import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './postgres-helper.js';
import {createRuntime} from '../server/runtime.js';
import {encodeImage,fitImage,IMAGE_PROFILES} from '../public/image-encoding.js';

const image='data:image/jpeg;base64,/9j/2QAA/9k=';
const thumb='data:image/jpeg;base64,/9j/2QAB/9k=';
const garment={name:'반팔',category:'top',image,thumbnail:thumb};
test('thumbnail and main upload together; list points to thumbnail; deletion removes both and retries are safe',async t=>{
 const {call,objects}=await setup(t);
 const first=await call('garments/tee','PUT',garment);assert.equal(first.status,201);
 const g=(await first.json()).garment;assert.equal(g.hasThumbnail,true);assert.equal(g.thumbnail,'/api/garments/tee/thumbnail');assert.equal(g.image,'/api/garments/tee/image');
 assert.equal(objects.size,2);
 assert.deepEqual(new Uint8Array(await (await call('garments/tee/thumbnail')).arrayBuffer()),Uint8Array.from(atob(thumb.split(',')[1]),c=>c.charCodeAt(0)));
 assert.equal((await call('garments/tee','PUT',garment)).status,200);assert.equal(objects.size,2);
 assert.equal((await call('garments/tee/thumbnail','GET',undefined,'bob')).status,404);
 await call('garments/tee?permanent=1','DELETE');assert.equal(objects.size,0);
});
test('legacy photos remain readable; backfill adds only a thumbnail and concurrent retries create one object',async t=>{
 const {call,objects}=await setup(t);
 await call('garments/legacy','PUT',{name:'옛 사진',category:'top',image});
 const before=(await (await call('library')).json()).garments[0];assert.equal(before.hasThumbnail,false);assert.equal(before.thumbnail,before.image);
 const original=await (await call('garments/legacy/image')).arrayBuffer();
 assert.deepEqual(await (await call('garments/legacy/thumbnail')).arrayBuffer(),original);
 assert.equal((await call('garments/legacy/thumbnail','PUT',{thumbnail:thumb},'bob')).status,404);
 assert.equal((await call('garments/legacy/thumbnail','PUT',{thumbnail:thumb},'alice',{origin:'https://other.test'})).status,403);
 const responses=await Promise.all([call('garments/legacy/thumbnail','PUT',{thumbnail:thumb}),call('garments/legacy/thumbnail','PUT',{thumbnail:thumb})]);
 assert.ok(responses.every(r=>r.status===200));assert.equal(objects.size,2);
 assert.deepEqual(await (await call('garments/legacy/image')).arrayBuffer(),original);
 assert.equal((await (await call('library')).json()).garments[0].hasThumbnail,true);
});
test('image ETags avoid bucket reads only after authenticating and verifying ownership',async t=>{
 const {call,bucket}=await setup(t);await call('garments/tee','PUT',garment);
 const get=t.mock.method(bucket,'get',bucket.get);
 const first=await call('garments/tee/thumbnail'),etag=first.headers.get('etag');assert.ok(etag);
 assert.equal(first.headers.get('cache-control'),'private, no-cache');assert.equal(first.headers.get('vary'),'Cookie');assert.equal(get.mock.callCount(),1);
 const unchanged=await call('garments/tee/thumbnail','GET',undefined,'alice',{'if-none-match':'W/'+etag});
 assert.equal(unchanged.status,304);assert.equal((await unchanged.arrayBuffer()).byteLength,0);assert.equal(get.mock.callCount(),1);
 assert.equal((await call('garments/tee/thumbnail','GET',undefined,'bob',{'if-none-match':etag})).status,404);
 assert.equal((await call('garments/tee/thumbnail','GET',undefined,null,{'if-none-match':etag})).status,401);
 await call('garments/tee?permanent=1','DELETE');assert.equal((await call('garments/tee/thumbnail','GET',undefined,'alice',{'if-none-match':etag})).status,404);
 await call('garments/tee','PUT',garment);const changed=await call('garments/tee/thumbnail','GET',undefined,'alice',{'if-none-match':etag});assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),etag);
});
test('runtime keeps private image revalidation but auth and JSON remain no-store',()=>{
 const runtime=createRuntime(new Request('https://form.test/api/garments/tee/image'),{SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'});
 const headers={'Cache-Control':'private, no-cache','ETag':'"test"','Vary':'Cookie'};
 for(const status of [200,304])assert.equal(runtime.finish(new Response(null,{status,headers})).headers.get('cache-control'),'private, no-cache');
 assert.equal(runtime.finish(Response.json({user:'alice'})).headers.get('cache-control'),'private, no-store');
 assert.equal(runtime.finish(new Response(null,{status:401,headers})).headers.get('cache-control'),'private, no-store');
});
test('invalid thumbnails and failed upload/DB writes leave no partial objects',async t=>{
 const {call,objects,bucket,sql}=await setup(t);
 assert.equal((await call('garments/bad','PUT',{...garment,thumbnail:'data:image/png;base64,YWJj'})).status,400);assert.equal(objects.size,0);
 const large='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([255,216]),Buffer.alloc(120000),Buffer.from([255,217])]).toString('base64');
 assert.equal((await call('garments/large','PUT',{...garment,thumbnail:large})).status,413);assert.equal(objects.size,0);
 const put=bucket.put;const mocked=t.mock.method(bucket,'put',async(key,...args)=>{if(key.includes('/thumbnails/'))throw Error('upload failed');return put(key,...args);});
 assert.equal((await call('garments/fail','PUT',garment)).status,503);assert.equal(objects.size,0);mocked.mock.restore();
 await sql.exec('ALTER TABLE garments ADD CONSTRAINT simulated_failure CHECK (false)');
 assert.equal((await call('garments/fail','PUT',garment)).status,503);assert.equal(objects.size,0);
});
test('saved look previews use authenticated conditional responses too',async t=>{
 const {sampleBoard}=await import('../public/board-state.js');const {call,bucket}=await setup(t);
 await call('looks/look','PUT',{name:'코디',state:sampleBoard(),image:'data:image/jpeg;base64,/9j/2Q=='});
 const first=await call('looks/look/image'),etag=first.headers.get('etag');const get=t.mock.method(bucket,'get',bucket.get);
 assert.equal((await call('looks/look/image','GET',undefined,'alice',{'if-none-match':etag})).status,304);assert.equal(get.mock.callCount(),0);
 assert.equal((await call('looks/look/image','GET',undefined,'bob',{'if-none-match':etag})).status,404);
});
const canvasFactory=()=>({getContext:()=>({drawImage(){}})});
test('encoding preserves aspect ratio, avoids upscaling and searches within quality/resolution floors',async()=>{
 assert.deepEqual(fitImage(1200,800,320),{width:320,height:213});assert.deepEqual(fitImage(100,50,320),{width:100,height:50});
 const calls=[];const output=await encodeImage({width:1000,height:700},IMAGE_PROFILES.garment,{makeCanvas:canvasFactory,encode:async(canvas,type,q)=>{calls.push([canvas.width,q]);return new Blob([new Uint8Array(q>.78?350000:240000)],{type});}});
 assert.equal(output.blob.size,240000);assert.equal(output.width,1000);assert.deepEqual(calls,[[1000,.85],[1000,.78]]);
 const fallback=[];const png=await encodeImage({width:1000,height:1000},IMAGE_PROFILES.thumbnail,{makeCanvas:canvasFactory,encode:async(canvas)=>{fallback.push(canvas.width);return new Blob([new Uint8Array(canvas.width*200)],{type:'image/png'});}});
 assert.equal(png.width,160);assert.deepEqual(fallback,[320,240,160]);
 await assert.rejects(()=>encodeImage({width:1000,height:1000},IMAGE_PROFILES.thumbnail,{makeCanvas:canvasFactory,encode:async()=>new Blob([new Uint8Array(130000)],{type:'image/png'})}),/사진이 너무/);
});
