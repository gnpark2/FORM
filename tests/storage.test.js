import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,ids} from './postgres-helper.js';
import {readFileSync} from 'node:fs';
import {handleApi as handleStorage} from '../server/recommend.js';
import {initial} from '../public/catalog.js';
import {sampleBoard,validBoard} from '../public/board-state.js';
import {filterCloset} from '../public/closet.js';
import {CloudDraft} from '../public/cloud-store.js';
const look={name:'주말 코디',state:initial,image:'data:image/jpeg;base64,/9j/2Q=='};
test('rejects anonymous and cross-origin mutations; validates payload',async t=>{
 const {call}=await setup(t);assert.equal((await call('library','GET',undefined,null)).status,401);
 assert.equal((await call('looks/a','PUT',look,'alice',{origin:'https://elsewhere.test'})).status,403);
 assert.equal((await call('looks/a','PUT',{...look,state:{}})).status,400);
 assert.equal((await call('looks/a','PUT',{...look,image:'data:image/svg+xml;base64,abcd'})).status,400);
 assert.equal((await call('looks/a','PUT',{...look,name:'x'.repeat(41)})).status,400);
 assert.equal((await call('looks/a','PUT',{...look,image:'x'.repeat(2300001)})).status,413);
});
test('persists looks and images; isolates reads, deletes and thumbnails by account',async t=>{
 const {call,objects}=await setup(t);assert.equal((await call('looks/a','PUT',look)).status,201);
 const list=await (await call('library')).json();assert.equal(list.looks[0].name,look.name);assert.equal(list.looks[0].image,'/api/looks/a/image');
 assert.equal((await call('looks/a/image')).status,200);
 assert.equal((await (await call('library','GET',undefined,'bob')).json()).looks.length,0);
 assert.equal((await call('looks/a/image','GET',undefined,'bob')).status,404);
 await call('looks/a','DELETE',undefined,'bob');assert.equal(objects.size,1);
 await call('looks/a','DELETE');assert.equal(objects.size,0);assert.equal((await (await call('library')).json()).looks.length,0);
});
test('safe retry does not duplicate or replace an existing saved look',async t=>{
 const {call,objects}=await setup(t);await call('looks/a','PUT',look);
 const retry=await (await call('looks/a','PUT',{...look,name:'changed'})).json();assert.equal(retry.existing,true);assert.equal(retry.look.name,look.name);assert.equal(objects.size,1);
});
test('draft revisions protect concurrent devices and preserve account isolation',async t=>{
 const {call}=await setup(t);const first=await call('draft','PUT',{state:initial,revision:0});assert.equal((await first.json()).revision,1);
 const conflict=await call('draft','PUT',{state:initial,revision:0});assert.equal(conflict.status,409);assert.equal((await conflict.json()).revision,1);
 const modified=structuredClone(initial);modified.top.color='#123456';
 assert.equal((await (await call('draft','PUT',{state:modified,revision:1})).json()).revision,2);
 assert.equal((await call('draft','PUT',{state:initial,revision:1})).status,409);
 const current=await (await call('library')).json();assert.equal(current.draft.top.color,'#123456');
 assert.equal((await (await call('library','GET',undefined,'bob')).json()).draft,null);
});
test('enforces per-account capacity without retaining rejected preview files',async t=>{
 const {call,objects,sql}=await setup(t);
 for(let i=0;i<100;i++)await sql.query('INSERT INTO looks VALUES ($1,$2,$3,$4,$5,$6)',[ids.alice,String(i),'x',JSON.stringify(initial),null,new Date().toISOString()]);
 assert.equal((await call('looks/overflow','PUT',look)).status,409);assert.equal(objects.size,0);
 assert.equal((await call('looks/overflow','PUT',look,'bob')).status,201);
});
test('failed database write cleans up its uploaded image',async t=>{
 const {call,sql,objects}=await setup(t);
 await sql.exec('ALTER TABLE looks ADD CONSTRAINT simulated_failure CHECK (false)');
 assert.equal((await call('looks/a','PUT',look)).status,503);assert.equal(objects.size,0);
});
test('client serializes rapid draft edits and retains failed edits for retry',async t=>{
 const previous=globalThis.fetch;const writes=[];let release;
 try{
  globalThis.fetch=async(_url,options)=>{writes.push(JSON.parse(options.body));if(writes.length===1)await new Promise(r=>release=r);return Response.json({revision:writes.length})};
  const cloud=new CloudDraft(()=>{});cloud.enabled=true;cloud.queue({v:1});const first=cloud.flush();cloud.queue({v:2});release();await first;clearTimeout(cloud.timer);
  assert.deepEqual(writes,[{state:{v:1},revision:0},{state:{v:2},revision:1}]);assert.equal(cloud.dirty,false);
  globalThis.fetch=async t=>{throw new Error('offline')};cloud.queue({v:3});await cloud.flush();assert.deepEqual(cloud.pending,{v:3});
  globalThis.fetch=async()=>Response.json({revision:3});await cloud.flush();assert.equal(cloud.dirty,false);
 }finally{globalThis.fetch=previous}
});
test('client pauses on conflict and requires an explicit resolution',async t=>{
 const previous=globalThis.fetch;const statuses=[];
 try{
  globalThis.fetch=async()=>Response.json({error:'conflict',revision:8,draft:{v:8}},{status:409});
  const cloud=new CloudDraft(s=>statuses.push(s));cloud.enabled=true;cloud.queue({v:1});await cloud.flush();cloud.queue({v:2});clearTimeout(cloud.timer);
  assert.equal(statuses.at(-1),'conflict');assert.deepEqual(cloud.pending,{v:2});
  assert.deepEqual(cloud.useServer(),{v:8});assert.equal(cloud.revision,8);assert.equal(cloud.dirty,false);
 }finally{globalThis.fetch=previous}
});
test('photo board preserves arrangement, supports empty draft, rejects malformed transforms',async t=>{
 const {call}=await setup(t);const state=sampleBoard();state.pieces[0].rotation=25;state.pieces[0].x=65;
 assert.equal((await call('looks/board','PUT',{...look,state})).status,201);
 assert.deepEqual((await (await call('library')).json()).looks[0].state,state);
 const invalid=structuredClone(state);invalid.pieces[0].x=1000;
 assert.equal((await call('draft','PUT',{state:invalid,revision:0})).status,400);
 const duplicated=structuredClone(state);duplicated.pieces.push({...duplicated.pieces[0]});assert.equal(validBoard(duplicated),false);
 const missing=structuredClone(state);delete missing.pieces[0].key;assert.equal(validBoard(missing),false);
 assert.equal((await call('draft','PUT',{state:{version:2,background:'#ffffff',pieces:[]},revision:0})).status,200);
});
const garment={name:'내 티셔츠',category:'top',sourceUrl:'https://www.musinsa.com/products/example',image:'data:image/png;base64,'+readFileSync(new URL('../public/samples/tee.png',import.meta.url)).toString('base64')};
test('uploads photos, isolates them by owner, and validates wardrobe references',async t=>{
 const {call,objects}=await setup(t);assert.equal((await call('garments/tshirt','PUT',garment)).status,201);
 const lib=await (await call('library')).json();assert.equal(lib.garments[0].name,garment.name);assert.equal(lib.garments[0].sourceUrl,garment.sourceUrl);
 assert.equal((await call('garments/tshirt/image')).headers.get('content-type'),'image/png');
 assert.equal((await call('garments/tshirt/image','GET',undefined,'bob')).status,404);
 const state=sampleBoard();state.pieces[0]={...state.pieces[0],source:'wardrobe',itemId:'tshirt'};
 assert.equal((await call('looks/photo','PUT',{...look,state})).status,201);
 assert.equal((await call('draft','PUT',{state,revision:0},'bob')).status,400);
 state.pieces[0].category='invalid';assert.equal((await call('draft','PUT',{state,revision:0})).status,400);
 const count=objects.size;assert.equal((await call('garments/tshirt','PUT',garment)).status,200);assert.equal(objects.size,count);
});
test('hiding a garment retains images used by saved boards and does not affect another owner',async t=>{
 const {call}=await setup(t);await call('garments/tshirt','PUT',garment);
 await call('garments/tshirt','DELETE',undefined,'bob');assert.equal((await (await call('library')).json()).garments[0].archived,false);
 await call('garments/tshirt','DELETE');assert.equal((await (await call('library')).json()).garments[0].archived,true);assert.equal((await call('garments/tshirt/image')).status,200);
});
test('photo upload rejects script URLs and disguised image files',async t=>{
 const {call}=await setup(t);assert.equal((await call('garments/bad','PUT',{...garment,sourceUrl:'javascript:alert(1)'})).status,400);
 assert.equal((await call('garments/bad','PUT',{...garment,image:'data:image/png;base64,YWJj'})).status,400);
});

test('edits garment metadata and restores hidden photos without replacing image data',async t=>{
 const {call,objects}=await setup(t);await call('garments/tshirt','PUT',garment);const original=[...objects.keys()];
 assert.equal((await call('garments/tshirt','PATCH',{name:'다른 사람'},'bob')).status,404);
 const changed=await (await call('garments/tshirt','PATCH',{name:'  봄 재킷  ',category:'outer',sourceUrl:''})).json();
 assert.equal(changed.garment.name,'봄 재킷');assert.equal(changed.garment.category,'outer');assert.equal(changed.garment.sourceUrl,'');
 await call('garments/tshirt','DELETE');await call('garments/tshirt','PATCH',{archived:false});
 const item=(await (await call('library')).json()).garments[0];assert.equal(item.archived,false);assert.equal(item.name,'봄 재킷');assert.deepEqual([...objects.keys()],original);assert.equal((await call('garments/tshirt/image')).status,200);
});
test('metadata edits reject invalid input and cross-origin requests',async t=>{
 const {call}=await setup(t);await call('garments/tshirt','PUT',garment);
 for(const body of [{name:''},{name:'x'.repeat(61)},{category:'invalid'},{category:['top']},{sourceUrl:'javascript:alert(1)'},{sourceUrl:42},{archived:'false'},[]])assert.equal((await call('garments/tshirt','PATCH',body)).status,400);
 assert.equal((await call('garments/tshirt','PATCH',{name:'blocked'},'alice',{origin:'https://elsewhere.test'})).status,403);
 assert.equal((await (await call('library')).json()).garments[0].name,garment.name);
});
test('recategorizing an owned garment preserves old saved boards and reusable drafts',async t=>{
 const {call}=await setup(t);await call('garments/tshirt','PUT',garment);const state=sampleBoard();state.pieces[0]={...state.pieces[0],source:'wardrobe',itemId:'tshirt'};
 await call('looks/before','PUT',{...look,state});await call('garments/tshirt','PATCH',{category:'outer'});
 const stored=(await (await call('library')).json()).looks[0].state;assert.deepEqual(stored,state);
 assert.equal((await call('draft','PUT',{state:stored,revision:0})).status,200);
 assert.equal((await call('looks/after','PUT',{...look,state:stored})).status,201);
 assert.equal((await call('looks/stolen','PUT',{...look,state:stored},'bob')).status,400);
});
test('closet filters combine category, case-insensitive names and hidden state',()=>{
 const items=[{id:1,name:'White Tee',category:'top',archived:false},{id:2,name:'흰 셔츠',category:'top',archived:true},{id:3,name:'White Jeans',category:'bottom',archived:false}];
 assert.deepEqual(filterCloset(items,{query:' WHITE ',category:'top'}).map(x=>x.id),[1]);
 assert.deepEqual(filterCloset(items,{category:'top',archived:true}).map(x=>x.id),[2]);
 assert.equal(filterCloset(items,{query:'없는 이름'}).length,0);assert.equal(filterCloset(items).length,2);
});

test('permanent garment deletion is owner-only, removes image, frees capacity and is idempotent',async t=>{
 const {call,objects}=await setup(t);await call('garments/tshirt','PUT',garment);
 await call('garments/tshirt?permanent=1','DELETE',undefined,'bob');assert.equal(objects.size,1);
 assert.equal((await call('garments/tshirt?permanent=1','DELETE')).status,200);assert.equal(objects.size,0);
 assert.equal((await (await call('library')).json()).garments.length,0);assert.equal((await call('garments/tshirt/image')).status,404);
 assert.equal((await call('garments/tshirt?permanent=1','DELETE')).status,200);
});
test('permanent deletion preserves referenced saved looks and drafts until both references are removed',async t=>{
 const {call,objects}=await setup(t);await call('garments/tshirt','PUT',garment);const state=sampleBoard();state.pieces[0]={...state.pieces[0],source:'wardrobe',itemId:'tshirt'};
 await call('looks/ref','PUT',{...look,state});await call('draft','PUT',{state,revision:0});
 assert.equal((await call('garments/tshirt?permanent=1','DELETE')).status,409);
 await call('looks/ref','DELETE');assert.equal((await call('garments/tshirt?permanent=1','DELETE')).status,409);
 await call('draft','PUT',{state:{...state,pieces:[]},revision:1});assert.equal((await call('garments/tshirt?permanent=1','DELETE')).status,200);assert.equal(objects.size,0);
});
