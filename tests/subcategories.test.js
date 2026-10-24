import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,ids} from './postgres-helper.js';
import {withUserTransaction} from '../server/database.js';
import {filterCloset} from '../public/closet.js';
const garment={name:'여름 티',category:'top',image:'data:image/jpeg;base64,/9j/2QAA/9k='};
test('user-created subcategories persist independently of garments, deduplicate names and enforce owner access',async t=>{
  const {call,pool}=await setup(t);
  assert.equal((await call('subcategories/summer','PUT',{category:'top',name:'  여름  '})).status,200);
  const duplicate=await (await call('subcategories/duplicate','PUT',{category:'top',name:'여름'})).json();
  assert.equal(duplicate.subcategory.id,'summer');
  assert.equal((await (await call('library')).json()).subcategories.length,1);
  assert.deepEqual((await (await call('library','GET',undefined,'bob')).json()).subcategories,[]);
  const rows=await withUserTransaction(pool,ids.bob,false,db=>db.prepare('SELECT * FROM subcategories WHERE user_id = ?').bind(ids.alice).all());
  assert.equal(rows.results.length,0);
  assert.equal((await call('subcategories/x','PUT',{category:'top',name:'x'},null)).status,401);
  assert.equal((await call('subcategories/x','PUT',{category:'top',name:'x'},'alice',{origin:'https://other.test'})).status,403);
});
test('multiple tags round-trip; cross-owner and wrong-parent tags rejected; deleting tags preserves garments and images',async t=>{
  const {call,objects}=await setup(t);
  await call('subcategories/summer','PUT',{category:'top',name:'여름'});
  await call('subcategories/short','PUT',{category:'top',name:'반팔'});
  await call('subcategories/denim','PUT',{category:'bottom',name:'데님'});
  assert.equal((await call('garments/tee','PUT',{...garment,subcategories:['summer','short']})).status,201);
  assert.equal((await call('garments/invalid','PUT',{...garment,subcategories:['denim']})).status,400);
  assert.equal((await call('garments/stolen','PUT',{...garment,subcategories:['summer']},'bob')).status,400);
  await call('subcategories/summer','DELETE',undefined,'bob');
  let lib=await (await call('library')).json();assert.deepEqual(lib.garments[0].subcategories,['summer','short']);
  await call('garments/tee','PATCH',{archived:true});await call('garments/tee','PATCH',{archived:false});
  lib=await (await call('library')).json();assert.deepEqual(lib.garments[0].subcategories,['summer','short']);
  await call('subcategories/summer','DELETE');
  lib=await (await call('library')).json();assert.deepEqual(lib.garments[0].subcategories,['short']);assert.equal(objects.size,1);
  await call('garments/tee','PATCH',{category:'bottom'});
  assert.deepEqual((await (await call('library')).json()).garments[0].subcategories,[]);
  await call('garments/tee','PATCH',{subcategories:['denim']});
  assert.deepEqual((await (await call('library')).json()).garments[0].subcategories,['denim']);
});
test('invalid subcategory input is rejected and per-parent count is capped',async t=>{
  const {call}=await setup(t);
  for(const body of [null,[],{category:'top',name:''},{category:'top',name:'x'.repeat(25)},{category:'bad',name:'여름'}])
    assert.equal((await call('subcategories/invalid','PUT',body)).status,400);
  for(let i=0;i<30;i++)assert.equal((await call('subcategories/tag'+i,'PUT',{category:'top',name:'분류'+i})).status,200);
  assert.equal((await call('subcategories/overflow','PUT',{category:'top',name:'초과'})).status,409);
  for(const subcategories of [null,{},['missing'],Array.from({length:13},()=> 'tag0')])
    assert.equal((await call('garments/invalid','PUT',{...garment,subcategories})).status,400);
  assert.equal((await call('garments/legacy','PUT',garment)).status,201);
  assert.deepEqual((await (await call('library')).json()).garments[0].subcategories,[]);
});
test('all-category filters support subcategories and distinguish identical labels under different parents',()=>{
  const items=[{name:'반팔',category:'top',subcategories:['top-summer']},{name:'반바지',category:'bottom',subcategories:['bottom-summer']},{name:'긴팔',category:'top'}];
  assert.deepEqual(filterCloset(items,{subcategory:'top-summer'}).map(g=>g.name),['반팔']);
  assert.equal(filterCloset(items,{category:'bottom',subcategory:'top-summer'}).length,0);
  assert.equal(filterCloset(items).length,3);
});
