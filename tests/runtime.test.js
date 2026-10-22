import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,ids} from './postgres-helper.js';
import {withUserTransaction} from '../server/database.js';
import {supabaseBucket} from '../server/runtime.js';
import {blankBoard} from '../public/board-state.js';

test('database RLS blocks foreign writes and filters queries even without an owner predicate',async t=>{
  const {pool,call,sql}=await setup(t);
  await call('draft','PUT',{state:blankBoard(),revision:0});
  assert.equal(await withUserTransaction(pool,ids.bob,false,async db=>(await db.prepare('SELECT * FROM drafts').bind().all()).results.length),0);
  await assert.rejects(()=>withUserTransaction(pool,ids.bob,true,db=>db.prepare('INSERT INTO drafts VALUES(?,?,1,now())').bind(ids.alice,JSON.stringify(blankBoard())).run()),/row-level security/);
  await sql.exec('SET ROLE authenticated');
  await assert.rejects(()=>sql.query('SELECT * FROM drafts'),/permission denied/);
  await assert.rejects(()=>sql.query('SELECT public.reserve_ai_attempt($1)',['a'.repeat(64)]),/permission denied/);
  await sql.exec('RESET ROLE');
});
test('private photo policies isolate accounts and reject another account upload',async t=>{
  const {sql}=await setup(t);
  await sql.query('INSERT INTO storage.objects VALUES ($1,$2,$3)',['photo',ids.alice+'/garments/photo','wardrobe']);
  await sql.exec('SET ROLE authenticated');
  await sql.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[ids.bob]);
  assert.equal((await sql.query('SELECT * FROM storage.objects')).rows.length,0);
  await assert.rejects(()=>sql.query('INSERT INTO storage.objects VALUES ($1,$2,$3)',['bad',ids.alice+'/garments/bad','wardrobe']),/row-level security/);
  await sql.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[ids.alice]);
  assert.equal((await sql.query('SELECT * FROM storage.objects')).rows.length,1);
  await sql.exec('RESET ROLE');
  assert.equal((await sql.query("SELECT public FROM storage.buckets WHERE id='wardrobe'")).rows[0].public,false);
});
test('simultaneous board updates preserve a single revision winner',async t=>{
  const {call}=await setup(t);
  await call('draft','PUT',{state:blankBoard(),revision:0});
  const responses=await Promise.all(Array.from({length:4},()=>call('draft','PUT',{state:blankBoard(),revision:1})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409,409,409]);
});
test('Supabase object adapter uses owner paths and distinguishes storage failures',async()=>{
  let uploaded,removed,error;
  const sdk={storage:{from:name=>{assert.equal(name,'wardrobe');return {
    async upload(key,bytes,options){uploaded={key,bytes,options};return {error};},
    async download(){return {data:new Blob([new Uint8Array([1,2])]),error};},
    async remove(keys){removed=keys;return {error};}
  };}}};
  const bucket=supabaseBucket(sdk,ids.alice),key=ids.alice+'/garments/photo';
  await bucket.put(key,new Uint8Array([1,2]),{httpMetadata:{contentType:'image/png'}});
  assert.equal(uploaded.options.upsert,false);assert.equal(uploaded.options.contentType,'image/png');
  assert.deepEqual((await bucket.get(key)).body,new Uint8Array([1,2]));
  await bucket.delete(key);assert.deepEqual(removed,[key]);
  await assert.rejects(()=>bucket.get(ids.bob+'/garments/photo'),/owner/);
  error={statusCode:'404'};assert.equal(await bucket.get(key),null);
  error={statusCode:'503'};await assert.rejects(()=>bucket.get(key),/download failed/);
});
