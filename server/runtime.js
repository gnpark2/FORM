import {createServerClient, parseCookieHeader, serializeCookieHeader} from '@supabase/ssr';
import {getPool, userDatabase, withUserTransaction} from './database.js';

const required = (env, name) => {
  if (!env[name]) throw new Error(`Missing server setting: ${name}`);
  return env[name];
};

export function supabaseBucket(client, userId, bucketName = 'wardrobe') {
  const bucket = client.storage.from(bucketName);
  const check = key => {
    if (!key.startsWith(userId + '/') || key.includes('..')) throw new Error('Invalid object owner');
    return key;
  };
  return {
    async put(key, bytes, options = {}) {
      const {error} = await bucket.upload(check(key), bytes, {contentType: options.httpMetadata?.contentType, upsert: false});
      if (error) throw new Error('Photo upload failed');
    },
    async get(key) {
      const {data, error} = await bucket.download(check(key));
      if (error) {
        if (String(error.statusCode) === '404' || error.code === 'NoSuchKey') return null;
        throw new Error('Photo download failed');
      }
      return {body: new Uint8Array(await data.arrayBuffer())};
    },
    async delete(key) {
      const {error} = await bucket.remove([check(key)]);
      if (error) throw new Error('Photo deletion failed');
    }
  };
}

// An SDK client and its cookie state belong to exactly one HTTP request.
export function createRuntime(request, env = process.env) {
  const jar = new Map(parseCookieHeader(request.headers.get('cookie') || '').map(c => [c.name, c.value || '']));
  const pending = new Map();
  const supabase = createServerClient(required(env, 'SUPABASE_URL'), required(env, 'SUPABASE_PUBLISHABLE_KEY'), {
    cookieOptions: {path: '/', sameSite: 'lax', httpOnly: true, secure: new URL(request.url).protocol === 'https:'},
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({name, value})),
      setAll: cookies => { for (const cookie of cookies) {jar.set(cookie.name, cookie.value); pending.set(cookie.name, cookie);} }
    }
  });
  const context = {
    APP_ORIGIN: env.APP_ORIGIN, supabase,
    CF_AI_ACCOUNT_ID: env.CF_AI_ACCOUNT_ID, CF_AI_TOKEN: env.CF_AI_TOKEN,
    forUser(userId) {
      const pool = getPool(env), bucket = supabaseBucket(supabase, userId, env.SUPABASE_STORAGE_BUCKET || 'wardrobe');
      return {...context, DB: userDatabase(pool, userId), BUCKET: bucket,
        storageTransaction: (mutate, work) => storageTransaction(pool, userId, bucket, mutate, work)
      };
    },
    finish(response) {
      const headers = new Headers(response.headers);
      const revalidatingImage=[200,304].includes(response.status)&&headers.has('ETag')&&headers.get('Cache-Control')==='private, no-cache';
      headers.set('Cache-Control', revalidatingImage?'private, no-cache':'private, no-store');
      headers.set('Vary', 'Cookie');
      for (const {name, value, options} of pending.values()) headers.append('Set-Cookie', serializeCookieHeader(name, value, options));
      return new Response(response.body, {status: response.status, headers});
    }
  };
  return context;
}

export async function storageTransaction(pool, userId, bucket, mutate, work) {
  // Storage is not transactional: compensate uploads on rollback and delete only after commit.
  const uploaded = new Set(), deleted = new Set();
  const stagedBucket = {
    get: key => bucket.get(key),
    async put(key, bytes, opts) { await bucket.put(key, bytes, opts); uploaded.add(key); },
    async delete(key) { deleted.add(key); }
  };
  let response;
  try { response = await withUserTransaction(pool, userId, mutate, DB => work({DB, BUCKET: stagedBucket})); }
  catch (error) { await Promise.allSettled([...uploaded].map(key => bucket.delete(key))); throw error; }
  const cleanup = response.status >= 400 ? uploaded : deleted;
  const results = await Promise.allSettled([...cleanup].map(key => bucket.delete(key)));
  if (results.some(r => r.status === 'rejected')) console.error('Orphan photo cleanup required');
  return response;
}
