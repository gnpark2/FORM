import {categories} from '../public/board-state.js';
const fail=(status,message)=>{throw {status,message};};
export async function validateSubcategories(db,user,category,ids=[]) {
  if(!Array.isArray(ids)||ids.length>12||ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id)))
    fail(400,'하위 분류는 최대 12개까지 선택해 주세요.');
  const unique=[...new Set(ids)];
  const {results}=await db.prepare('SELECT id FROM subcategories WHERE user_id = ? AND category = ?').bind(user,category).all();
  if(unique.some(id=>!results.some(row=>row.id===id)))fail(400,'하위 분류가 변경되었어요. 새로고침 후 다시 선택해 주세요.');
  return unique;
}
export async function changeSubcategory(db,user,id,method,body) {
  if(method==='DELETE') {
    await db.prepare('UPDATE garments SET subcategories = subcategories - ?::text WHERE user_id = ?').bind(id,user).run();
    await db.prepare('DELETE FROM subcategories WHERE user_id = ? AND id = ?').bind(user,id).run();
    return {deleted:true};
  }
  if(method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
  const name=typeof body?.name==='string'?body.name.normalize('NFC').trim():'';
  if(!name||name.length>24||typeof body.category!=='string'||!Object.hasOwn(categories,body.category))fail(400,'분류 이름은 1~24자로 입력해 주세요.');
  const same=await db.prepare('SELECT id,category,name FROM subcategories WHERE user_id = ? AND category = ? AND name = ?').bind(user,body.category,name).first();
  if(same)return {subcategory:same};
  const old=await db.prepare('SELECT id,category,name FROM subcategories WHERE user_id = ? AND id = ?').bind(user,id).first();
  if(old){if(old.category!==body.category||old.name!==name)fail(409,'분류가 변경되었어요. 다시 시도해 주세요.');return {subcategory:old};}
  const count=await db.prepare('SELECT COUNT(*) AS n FROM subcategories WHERE user_id = ? AND category = ?').bind(user,body.category).first();
  if(Number(count.n)>=30)fail(409,'종류별 하위 분류는 최대 30개까지 만들 수 있어요.');
  const {results}=await db.prepare('INSERT INTO subcategories(user_id,id,category,name) VALUES(?,?,?,?) RETURNING id,category,name').bind(user,id,body.category,name).all();
  return {subcategory:results[0]};
}
