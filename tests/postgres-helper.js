import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {userDatabase} from '../server/database.js';
import {storageTransaction} from '../server/runtime.js';
import {handleApi} from '../server/recommend.js';
export const ids = {alice: '00000000-0000-4000-8000-000000000001', bob: '00000000-0000-4000-8000-000000000002'};
export async function setup(t) {
  const sql = new PGlite(); t.after(() => sql.close());
  await sql.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id text,name text,bucket_id text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA auth,storage TO authenticated;
    GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name,'/') $$;
  `);
  for(const name of (await readdir('supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await sql.exec(await readFile('supabase/migrations/'+name,'utf8'));
  await sql.query('INSERT INTO auth.users VALUES ($1),($2)',Object.values(ids));
  let tail = Promise.resolve();
  const pool = {async connect() {
    const previous = tail; let release;
    tail = new Promise(resolve => {release = resolve;});
    await previous;
    return {query: (query,args) => sql.query(query,args), release};
  }};
  const objects = new Map();
  const bucket = {async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{body:objects.get(k)}:null;},async delete(k){objects.delete(k);}};
  const env = {};
  const call = (path,method='GET',body,user='alice',headers={}) => {
    const uid = ids[user];
    const context = {...env,APP_ORIGIN:'https://form.test',supabase:{auth:{
      async getUser(){return {data:{user:uid?{id:uid,user_metadata:{name:user}}:null},error:null};},
      async signOut(){return {error:null};}
    }},forUser(userId) {
      return {...this,DB:userDatabase(pool,userId),BUCKET:bucket,storageTransaction:(mutate,work)=>storageTransaction(pool,userId,bucket,mutate,work)};
    }};
    return handleApi(new Request('https://form.test/api/'+path,{method,headers:{'content-type':'application/json',origin:'https://form.test',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),context);
  };
  return {sql,pool,objects,call,env,bucket};
}
