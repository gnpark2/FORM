import {privateImage} from './image-response.js';
import {validateSubcategories,changeSubcategory} from './subcategories.js';
import {validBoard,sanitizeBoard,categories} from '../public/board-state.js';
import {validState} from '../public/catalog.js';
const MAX_BYTES=2300000, MAX_LOOKS=100;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
function fail(status,message,extra={}) {throw {status,message,...extra};}
function cleanState(input){
  if(input?.version===2){if(!validBoard(input))fail(400,'코디 보드 형식이 올바르지 않습니다.');return sanitizeBoard(input);}
  if(!validState(input))fail(400,'코디 형식이 올바르지 않습니다.');
  return Object.fromEntries([...['top','bottom','shoes'].map(k=>[k,{id:input[k].id,color:input[k].color}]),['body',{height:input.body.height,width:input.body.width,shoulder:input.body.shoulder}],['styling',{tuck:input.styling?.tuck||'out'}]]);
}
export async function readBody(request,maxBytes=MAX_BYTES){
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON 요청만 지원합니다.');
  if(Number(request.headers.get('content-length'))>maxBytes)fail(413,'이미지가 너무 큽니다.');
  const reader=request.body?.getReader();if(!reader)fail(400,'요청 내용이 없습니다.');
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();fail(413,'이미지가 너무 큽니다.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'JSON 형식이 올바르지 않습니다.');}
}
function previewBytes(image){
  if(image==null)return null;
  if(typeof image!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image))fail(400,'JPEG 미리보기만 저장할 수 있습니다.');
  let decoded;try{decoded=Uint8Array.from(atob(image.split(',')[1]),c=>c.charCodeAt(0));}catch{fail(400,'이미지가 올바르지 않습니다.');}
  if(decoded.length>800000)fail(413,'미리보기는 800KB 이하로 저장해 주세요.');
  if(decoded.length<4||decoded[0]!==255||decoded[1]!==216||decoded.at(-2)!==255||decoded.at(-1)!==217)fail(400,'JPEG 이미지가 올바르지 않습니다.');
  return decoded;
}
async function authorizeBoard(db,user,state){
 if(state.version!==2)return;
 for(const piece of state.pieces.filter(p=>p.source==='wardrobe')){
  const garment=await db.prepare('SELECT category FROM garments WHERE user_id = ? AND id = ?').bind(user,piece.itemId).first();
  if(!garment)fail(400,'내 옷장에 없는 사진이 포함되어 있어요.');
 }
}
function garmentMetadata(body){
 if(typeof body?.name!=='string'||!body.name.trim()||body.name.trim().length>60||typeof body.category!=='string'||!Object.hasOwn(categories,body.category))fail(400,'옷 이름과 종류를 확인해 주세요.');
 if(body.sourceUrl!=null&&typeof body.sourceUrl!=='string')fail(400,'상품 링크를 확인해 주세요.');
 let sourceUrl='';
 if(body.sourceUrl){try{const u=new URL(body.sourceUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.href.length>2000)throw 0;sourceUrl=u.href;}catch{fail(400,'상품 링크는 http 또는 https 주소를 입력해 주세요.');}}
 if(body.features!=null&&(typeof body.features!=='string'||body.features.length>240))fail(400,'옷의 특징은 240자 이내로 입력해 주세요.');
 return {name:body.name.trim(),category:body.category,sourceUrl,features:body.features?.trim()||''};
}
function garmentFromRow(row){return {id:row.id,name:row.name,category:row.category,sourceUrl:row.source_url,features:row.features||'',subcategories:row.subcategories||[],archived:!!row.archived,hasThumbnail:!!row.thumbnail_key,thumbnail:`/api/garments/${row.id}/${row.thumbnail_key?'thumbnail':'image'}`,image:`/api/garments/${row.id}/image`,source:'wardrobe'};}
function garmentBytes(image,maxBytes=1600000){
 if(typeof image!=='string')fail(400,'옷 사진을 선택해 주세요.');
 const match=image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
 if(!match)fail(400,'JPG, PNG, WebP 사진만 지원합니다.');
 let bytes;try{bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));}catch{fail(400,'사진이 올바르지 않습니다.');}
 if(bytes.length>maxBytes)fail(413,'사진 크기를 줄여 다시 등록해 주세요.');
 const png=bytes.length>24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 const jpeg=bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217;
 const webp=bytes.length>12&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
 if(!({'image/png':png,'image/jpeg':jpeg,'image/webp':webp}[match[1]]))fail(400,'사진 형식이 올바르지 않습니다.');
 return {bytes,mime:match[1]};
}
function lookFromRow(row){return {id:row.id,name:row.name,state:row.state,image:row.image_key?`/api/looks/${encodeURIComponent(row.id)}/image`:null,createdAt:row.created_at};}
export async function handleStorage(request,env,user){
 try{
  const url=new URL(request.url),path=url.pathname;
  if(!user)fail(401,'로그인 후 서버 저장을 사용할 수 있습니다.');
  if(!env.DB||!env.BUCKET)fail(503,'저장소를 준비 중입니다. 잠시 후 다시 시도해 주세요.');
  if(!['GET','HEAD'].includes(request.method)){
    const origin=request.headers.get('origin');
    if((origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')fail(403,'다른 사이트의 저장 요청은 허용하지 않습니다.');
  }
  const db=env.DB;
  if(path==='/api/library'&&request.method==='GET'){
    const list=await db.prepare('SELECT * FROM looks WHERE user_id = ? ORDER BY created_at DESC, id DESC').bind(user).all();
    const garments=await db.prepare('SELECT * FROM garments WHERE user_id = ? ORDER BY created_at DESC').bind(user).all();
    const draft=await db.prepare('SELECT state, revision FROM drafts WHERE user_id = ?').bind(user).first();
    const subcategories=await db.prepare('SELECT id,category,name FROM subcategories WHERE user_id = ? ORDER BY category,name').bind(user).all();
    return json({subcategories:subcategories.results,userId:user,garments:garments.results.map(garmentFromRow),looks:list.results.map(lookFromRow),draft:draft?draft.state:null,revision:draft?.revision||0,limit:MAX_LOOKS});
  }
  const subcategoryRoute=path.match(/^\/api\/subcategories\/([A-Za-z0-9_-]{1,100})$/);
  if(subcategoryRoute)return json(await changeSubcategory(db,user,subcategoryRoute[1],request.method,request.method==='PUT'?await readBody(request,4096):null));
  if(path==='/api/draft'&&request.method==='PUT'){
    const body=await readBody(request),state=cleanState(body?.state);
    await authorizeBoard(db,user,state);
    if(!Number.isSafeInteger(body.revision)||body.revision<0)fail(400,'저장 버전이 올바르지 않습니다.');
    const result=await db.prepare(`INSERT INTO drafts (user_id,state,revision,updated_at) SELECT ?,?,1,? WHERE ? = 0
      ON CONFLICT(user_id) DO NOTHING RETURNING revision`).bind(user,JSON.stringify(state),new Date().toISOString(),body.revision).all();
    let revision=result.results[0]?.revision;
    if(!revision&&body.revision>0){
      const update=await db.prepare('UPDATE drafts SET state = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision').bind(JSON.stringify(state),new Date().toISOString(),user,body.revision).all();
      revision=update.results[0]?.revision;
    }
    if(!revision){const current=await db.prepare('SELECT state,revision FROM drafts WHERE user_id = ?').bind(user).first();fail(409,'다른 기기에서 편집한 코디가 있습니다.',{revision:current?.revision||0,draft:current?current.state:null});}
    return json({revision});
  }
  const garmentRoute=path.match(/^\/api\/garments\/([A-Za-z0-9_-]{1,100})(\/(?:image|thumbnail))?$/);
  if(garmentRoute){
    const id=garmentRoute[1];
    const found=await db.prepare('SELECT * FROM garments WHERE user_id = ? AND id = ?').bind(user,id).first();
    if(garmentRoute[2]){
      if(!found)fail(404,'사진이 없습니다.');
      const thumbnailRoute=garmentRoute[2]==='/thumbnail';
      if(thumbnailRoute&&request.method==='PUT'){
        if(found.thumbnail_key)return json({garment:garmentFromRow(found),existing:true});
        const body=await readBody(request,170000),thumbnail=garmentBytes(body?.thumbnail,120000);
        const key=`${user}/thumbnails/${crypto.randomUUID()}`;
        await env.BUCKET.put(key,thumbnail.bytes,{httpMetadata:{contentType:thumbnail.mime}});
        const result=await db.prepare('UPDATE garments SET thumbnail_key = ?, thumbnail_mime = ? WHERE user_id = ? AND id = ? RETURNING *').bind(key,thumbnail.mime,user,id).all();
        return json({garment:garmentFromRow(result.results[0])});
      }
      if(request.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
      const small=thumbnailRoute&&found.thumbnail_key;
      return await privateImage(request,env.BUCKET,small?found.thumbnail_key:found.image_key,small?found.thumbnail_mime:found.mime);
    }
    if(request.method==='PATCH'){
      if(!found)fail(404,'옷을 찾을 수 없습니다.');
      const body=await readBody(request);
      if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'수정 내용을 확인해 주세요.');
      if(body.archived!==undefined&&typeof body.archived!=='boolean')fail(400,'보관 상태가 올바르지 않습니다.');
      const data=garmentMetadata({name:body.name??found.name,category:body.category??found.category,sourceUrl:body.sourceUrl??found.source_url,features:body.features??found.features});
      const subcategories=await validateSubcategories(db,user,data.category,body.subcategories===undefined?(data.category===found.category?found.subcategories:[]):body.subcategories);
      const result=await db.prepare('UPDATE garments SET name = ?, category = ?, source_url = ?, features = ?, subcategories = ?, archived = ? WHERE user_id = ? AND id = ? RETURNING *').bind(data.name,data.category,data.sourceUrl,data.features,JSON.stringify(subcategories),body.archived===undefined?found.archived:Number(body.archived),user,id).all();
      return json({garment:garmentFromRow(result.results[0])});
    }
    if(request.method==='DELETE'){
      if(url.searchParams.get('permanent')==='1'){
        if(!found)return json({deleted:true});
        // Check references in the same statement that deletes the row.
        const removed=await db.prepare(`DELETE FROM garments WHERE user_id = ? AND id = ?
          AND NOT EXISTS (SELECT 1 FROM looks l, jsonb_array_elements(COALESCE(l.state->'pieces','[]'::jsonb)) p(value) WHERE l.user_id = ? AND p.value->>'source' = 'wardrobe' AND p.value->>'itemId' = ?)
          AND NOT EXISTS (SELECT 1 FROM drafts d, jsonb_array_elements(COALESCE(d.state->'pieces','[]'::jsonb)) p(value) WHERE d.user_id = ? AND p.value->>'source' = 'wardrobe' AND p.value->>'itemId' = ?)
          RETURNING image_key,thumbnail_key`).bind(user,id,user,id,user,id).all();
        if(!removed.results.length)fail(409,'이 옷을 사용하는 현재 보드 또는 저장한 코디가 있어요. 현재 보드에서 옷을 빼고, 해당 저장 코디를 삭제한 뒤 다시 시도해 주세요. 코디를 유지하려면 옷장에서 숨기기를 사용하세요.');
        for(const key of [removed.results[0].image_key,removed.results[0].thumbnail_key].filter(Boolean))await env.BUCKET.delete(key).catch(()=>console.error('Garment image cleanup failed'));
        return json({deleted:true});
      }
      await db.prepare('UPDATE garments SET archived = 1 WHERE user_id = ? AND id = ?').bind(user,id).all();
      return json({archived:true});
    }
    if(request.method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
    if(found)return json({garment:garmentFromRow(found),existing:true});
    const body=await readBody(request);
    const metadata=garmentMetadata(body),sourceUrl=metadata.sourceUrl;
    const subcategories=await validateSubcategories(db,user,metadata.category,body.subcategories);
    const thumbnail=body.thumbnail===undefined?null:garmentBytes(body.thumbnail,120000);
    const thumbnailKey=thumbnail?`${user}/thumbnails/${crypto.randomUUID()}`:null;
    const {bytes,mime}=garmentBytes(body.image);const key=`${user}/garments/${crypto.randomUUID()}`;
    await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
    if(thumbnail)await env.BUCKET.put(thumbnailKey,thumbnail.bytes,{httpMetadata:{contentType:thumbnail.mime}});
    let inserted;
    try{inserted=await db.prepare(`INSERT INTO garments (user_id,id,name,category,source_url,features,subcategories,image_key,mime,thumbnail_key,thumbnail_mime,archived,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,0,? WHERE (SELECT COUNT(*) FROM garments WHERE user_id = ?) < 200
      ON CONFLICT(user_id,id) DO NOTHING RETURNING *`).bind(user,id,body.name.trim(),body.category,sourceUrl,metadata.features,JSON.stringify(subcategories),key,mime,thumbnailKey,thumbnail?.mime||null,new Date().toISOString(),user).all();}
    catch(error){await env.BUCKET.delete(key).catch(()=>{});if(thumbnailKey)await env.BUCKET.delete(thumbnailKey).catch(()=>{});throw error;}
    if(!inserted.results.length){await env.BUCKET.delete(key).catch(()=>{});if(thumbnailKey)await env.BUCKET.delete(thumbnailKey).catch(()=>{});const retry=await db.prepare('SELECT * FROM garments WHERE user_id = ? AND id = ?').bind(user,id).first();if(retry)return json({garment:garmentFromRow(retry),existing:true});fail(409,'옷 사진은 계정당 최대 200개까지 등록할 수 있어요.');}
    return json({garment:garmentFromRow(inserted.results[0])},201);
  }
  const match=path.match(/^\/api\/looks\/([A-Za-z0-9_-]{1,100})(\/image)?$/);
  if(!match)fail(404,'요청한 경로가 없습니다.');
  const id=match[1],imageRoute=!!match[2];
  const existing=await db.prepare('SELECT * FROM looks WHERE user_id = ? AND id = ?').bind(user,id).first();
  if(imageRoute&&request.method==='GET'){
    if(!existing?.image_key)fail(404,'미리보기가 없습니다.');
    return await privateImage(request,env.BUCKET,existing.image_key,'image/jpeg');
  }
  if(imageRoute)fail(405,'지원하지 않는 요청입니다.');
  if(request.method==='DELETE'){
    const deleted=await db.prepare('DELETE FROM looks WHERE user_id = ? AND id = ? RETURNING image_key').bind(user,id).all();
    const key=deleted.results[0]?.image_key;if(key)await env.BUCKET.delete(key).catch(()=>console.error('Preview cleanup failed'));
    return json({deleted:true});
  }
  if(request.method!=='PUT')fail(405,'지원하지 않는 요청입니다.');
  const body=await readBody(request);
  const state=cleanState(body?.state),name=typeof body?.name==='string'?body.name.trim():'';
  if(!name||name.length>40)fail(400,'이름은 1~40자로 입력해 주세요.');
  await authorizeBoard(db,user,state);
  if(existing)return json({look:lookFromRow(existing),existing:true}); // Safe retries never replace a saved look.
  const bytes=previewBytes(body.image),key=bytes?`${user}/previews/${crypto.randomUUID()}.jpg`:null;
  const createdAt=new Date().toISOString();
  if(key)await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  let inserted;
  try{inserted=await db.prepare(`INSERT INTO looks (user_id,id,name,state,image_key,created_at)
      SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM looks WHERE user_id = ?) < ?
      ON CONFLICT(user_id,id) DO NOTHING RETURNING *`).bind(user,id,name,JSON.stringify(state),key,createdAt,user,MAX_LOOKS).all();}
  catch(error){if(key)await env.BUCKET.delete(key).catch(()=>{});throw error;}
  if(!inserted.results.length){
    if(key)await env.BUCKET.delete(key).catch(()=>{});
    const retry=await db.prepare('SELECT * FROM looks WHERE user_id = ? AND id = ?').bind(user,id).first();
    if(retry)return json({look:lookFromRow(retry),existing:true});
    fail(409,'최대 100개까지 저장할 수 있습니다. 이전 코디를 삭제해 주세요.');
  }
  return json({look:lookFromRow(inserted.results[0])},201);
 }catch(error){
  if(error.status)return json({error:error.message,...(error.revision!==undefined?{revision:error.revision,draft:error.draft}:{})},error.status);
  console.error('Storage request failed');
  return json({error:'서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);
 }
}
