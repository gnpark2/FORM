import {addFeatureFields,connectAccount,createRecommender} from './recommend-ui.js';
import {createBoardControls} from './board-controls.js';
import {createPhotoEditor} from './photo-editor.js';
import {createCloset} from './closet.js';
import {api,CloudDraft} from './cloud-store.js';
import {categories,samples,backgrounds,placements,blankBoard,sampleBoard,validBoard,resolvePiece} from './board-state.js';
import {validState as validLegacy} from './catalog.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],clone=x=>structuredClone(x);
let state=sampleBoard(),garments=[],saved=[],activeKey=state.pieces[0].key,filter='all',screen='studio',loaded=false,userId='',toastTimer;
let pendingLook=null,uploadData=null,pendingGarment=null,uploading=false,saving=false,legacy=[],photoLoad=0;
addFeatureFields();
const imageCache=new Map();
const photoEditor=createPhotoEditor({onChange:data=>{uploadData=data;pendingGarment=null;$('#uploadError').textContent='';},onError:message=>{uploadData=null;$('#uploadError').textContent=message;}});
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500)}
function imageFor(piece){return resolvePiece(piece,garments)}
function loadImage(src){if(!imageCache.has(src)){imageCache.set(src,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{imageCache.delete(src);reject(new Error('사진을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.'))};img.src=src;}));}return imageCache.get(src);}
const cloud=new CloudDraft((status,message)=>{
 $('#cloudStatus').textContent=message||({pending:'변경 내용 저장 대기 중…',saving:'서버에 저장 중…',saved:'내 계정에 저장됨',conflict:'다른 기기에서 수정한 보드가 있어요.'}[status]||'저장 상태를 확인해 주세요.');
 $('#cloudRetry').hidden=status!=='error';$('#useServer').hidden=status!=='conflict';$('#keepLocal').hidden=status!=='conflict';
});
function changed(){pendingLook=null;cloud.queue(state);}
function selected(){return state.pieces.find(p=>p.key===activeKey)}
function positionElement(el,p){el.style.left=p.x+'%';el.style.top=p.y+'%';el.style.width=p.width+'%';el.style.setProperty('--angle',p.rotation+'deg');if(p.key===activeKey)boardControls.sync();}
function renderBoard(){
 const host=$('#pieces');host.replaceChildren();$('#board').style.background=state.background;
 state.pieces.forEach(p=>{
  const item=imageFor(p);if(!item)return;
  const el=document.createElement('button');el.className='piece'+(p.key===activeKey?' active':'');el.dataset.key=p.key;el.setAttribute('aria-label',item.name+' 사진. 드래그하거나 방향키로 이동');el.setAttribute('aria-pressed',String(p.key===activeKey));positionElement(el,p);
  const img=document.createElement('img');img.src=item.image;img.alt=item.name;img.draggable=false;img.onload=()=>boardControls.sync();el.append(img);host.append(el);
  el.onclick=()=>selectPiece(p.key);
  el.onpointerdown=e=>{if(e.button!==0)return;selectPiece(p.key);el.setPointerCapture(e.pointerId);const rect=$('#board').getBoundingClientRect(),start={x:e.clientX,y:e.clientY,px:p.x,py:p.y};let moved=false;
   el.onpointermove=event=>{if(!el.hasPointerCapture(event.pointerId))return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;p.x=Math.max(5,Math.min(95,start.px+dx/rect.width*100));p.y=Math.max(5,Math.min(95,start.py+dy/rect.height*100));positionElement(el,p);};
   const finish=()=>{el.onpointermove=null;el.onpointerup=null;el.onpointercancel=null;if(moved)changed();};el.onpointerup=finish;el.onpointercancel=finish;
  };
  el.onkeydown=e=>{const delta=e.shiftKey?5:1;if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();selectPiece(p.key);p.x=Math.max(5,Math.min(95,p.x+(e.key==='ArrowRight'?delta:e.key==='ArrowLeft'?-delta:0)));p.y=Math.max(5,Math.min(95,p.y+(e.key==='ArrowDown'?delta:e.key==='ArrowUp'?-delta:0)));positionElement(el,p);changed();};
 });
 $('#boardEmpty').hidden=state.pieces.length>0;$('#pieceCount').textContent=String(state.pieces.length).padStart(2,'0')+' PIECES';
 boardControls.sync();renderSelection();renderOutfit();renderBackgrounds();
}
function selectPiece(key){activeKey=key;$$('.piece').forEach(el=>{el.classList.toggle('active',el.dataset.key===key);el.setAttribute('aria-pressed',String(el.dataset.key===key));});boardControls.sync();renderSelection();}
function renderSelection(){
 const p=selected(),item=p&&imageFor(p);$('#selectionEmpty').hidden=!!item;$('#selectionControls').hidden=!item;if(!item)return;
 $('#selectedImage').src=item.image;$('#selectedImage').alt=item.name;$('#selectedName').textContent=item.name;$('#selectedCategory').textContent=categories[p.category];$('#sizeRange').value=p.width;$('#sizeValue').textContent=Math.round(p.width)+'%';$('#rotateRange').value=p.rotation;$('#rotateValue').textContent=Math.round(p.rotation)+'°';
 $('#productLink').hidden=!item.sourceUrl;if(item.sourceUrl)$('#productLink').href=item.sourceUrl;else $('#productLink').removeAttribute('href');
}
function renderOutfit(){const root=$('#outfitList');root.replaceChildren();for(const p of state.pieces){const item=imageFor(p);if(!item)continue;const b=document.createElement('button');b.className='outfit-row';const img=document.createElement('img');img.src=item.image;img.alt='';const info=document.createElement('span'),small=document.createElement('small');small.textContent=categories[p.category];info.append(small,document.createTextNode(item.name));b.append(img,info);b.onclick=()=>selectPiece(p.key);root.append(b);}}
function renderBackgrounds(){const root=$('#backgrounds');root.replaceChildren();backgrounds.forEach((color,i)=>{const b=document.createElement('button');b.style.background=color;b.className=color===state.background?'active':'';b.setAttribute('aria-label',['크림','화이트','세이지','웜 그레이'][i]+' 배경');b.setAttribute('aria-pressed',String(color===state.background));b.onclick=()=>{state.background=color;renderBoard();changed()};root.append(b);});}
function renderWardrobe(){
 const root=$('#wardrobeGrid');root.replaceChildren();const items=[...garments.filter(g=>!g.archived),...samples].filter(g=>filter==='all'||g.category===filter);$('#wardrobeCount').textContent=garments.filter(g=>!g.archived).length;$('#noItems').hidden=items.length>0;
 items.forEach(item=>{
  const checked=state.pieces.some(p=>p.itemId===item.id&&p.source===item.source);
  const card=document.createElement('div');card.className='item-card';
  const b=document.createElement('button');b.className='item-choice';b.classList.toggle('selected',checked);b.setAttribute('aria-pressed',String(checked));b.setAttribute('aria-label',item.name+(checked?' 코디에서 빼기':' 보드에 추가'));b.title=checked?'다시 눌러 코디에서 빼기':'코디에 추가';
  const visual=document.createElement('div');visual.className='item-photo';const img=document.createElement('img');img.src=item.image;img.alt=item.name;img.loading='lazy';visual.append(img);b.append(visual);b.onclick=()=>{if(checked)removeWardrobeItem(item);else addItem(item);};
  const caption=document.createElement('div');caption.className='item-caption';const name=document.createElement('span');name.className='item-name';name.textContent=item.name;name.title=item.name;
  caption.append(name);
  const meta=document.createElement('small');meta.className='item-meta';meta.textContent=item.source==='sample'?'AI SAMPLE':categories[item.category];card.append(b,caption,meta);root.append(card);
 });
 $$('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));closet.render();
}
function removeWardrobeItem(item){
 state.pieces=state.pieces.filter(p=>p.itemId!==item.id||p.source!==item.source);
 if(!state.pieces.some(p=>p.key===activeKey))activeKey=state.pieces.at(-1)?.key||null;
 renderBoard();renderWardrobe();changed();
}
function addItem(item){
 const existing=state.pieces.find(p=>p.itemId===item.id&&p.source===item.source);if(existing){selectPiece(existing.key);return;}
 if(state.pieces.length>=12){toast('한 보드에는 사진을 최대 12개까지 놓을 수 있어요.');return;}
 const offset=state.pieces.filter(p=>p.category===item.category).length*4;
 const p={key:crypto.randomUUID(),source:item.source,itemId:item.id,category:item.category,...placements[item.category]};p.x=Math.min(90,p.x+offset);p.y=Math.min(90,p.y+offset);state.pieces.push(p);activeKey=p.key;renderBoard();renderWardrobe();changed();
}
function removeSelected(){if(!selected())return;state.pieces=state.pieces.filter(p=>p.key!==activeKey);activeKey=state.pieces.at(-1)?.key||null;renderBoard();renderWardrobe();changed();}
function installBoard(board){state=clone(board);activeKey=state.pieces[0]?.key||null;renderBoard();renderWardrobe();}
function showScreen(which){screen=which;$('#studio').hidden=which!=='studio';$('#savedPage').hidden=which!=='saved';$('#closetPage').hidden=which!=='closet';$('#closetTab').classList.toggle('active',which==='closet');if(which==='closet')closet.render();$('#studioTab').classList.toggle('active',which==='studio');$('#savedTab').classList.toggle('active',which==='saved');if(which==='saved')renderSaved();window.scrollTo({top:0,behavior:'instant'});}
function renderSaved(){
 $('#saveCount').textContent=saved.length;const root=$('#savedGrid');root.replaceChildren();$('#emptySaved').hidden=saved.length>0;
 saved.forEach(look=>{const board=validBoard(look.state);const card=document.createElement('article');card.className='saved-card';if(look.image){const img=document.createElement('img');img.src=look.image;img.alt=look.name+' 미리보기';img.loading='lazy';card.append(img);}const info=document.createElement('div');info.className='saved-info';const title=document.createElement('h3');title.textContent=look.name;const caption=document.createElement('p');caption.textContent=board?look.state.pieces.length+'장의 사진 · '+new Date(look.createdAt).toLocaleDateString('ko-KR'):'이전 버전 코디 · 원본 기록 보관';const actions=document.createElement('div');actions.className='saved-actions';if(board){const load=document.createElement('button');load.className='btn primary';load.textContent='보드 불러오기';load.onclick=()=>{installBoard(look.state);changed();showScreen('studio');toast('저장한 사진과 배치를 불러왔어요.')};actions.append(load);}const del=document.createElement('button');del.className='btn danger saved-delete';del.textContent='코디 삭제';del.onclick=async()=>{if(!confirm(`“${look.name}” 코디를 삭제할까요? 저장한 배치와 미리보기는 복원할 수 없습니다. 옷장 사진은 유지됩니다.`))return;del.disabled=true;try{await api('/api/looks/'+look.id,{method:'DELETE'});saved=saved.filter(x=>x.id!==look.id);renderSaved();toast('저장한 코디를 삭제했어요. 옷장은 유지됩니다.');}catch(e){del.disabled=false;toast(e.message)}};info.append(title,caption,actions);card.append(del,info);root.append(card);});
}
async function refreshLibrary(){if(!loaded)return;const data=await api('/api/library');if(data.userId!==userId){location.reload();return;}garments=data.garments||[];saved=data.looks;renderSaved();renderWardrobe();}
async function connectCloud(){
 $('#cloudStatus').textContent='내 옷장을 불러오는 중…';$('#cloudRetry').hidden=true;
 try{await connectAccount(async()=>{if(uploading||saving||closet.busy)throw new Error('진행 중인 저장을 마친 뒤 로그아웃해 주세요.');await cloud.flush();if(cloud.dirty)throw new Error('저장을 완료한 뒤 로그아웃해 주세요.');});const data=await api('/api/library');userId=data.userId;garments=data.garments||[];saved=data.looks;cloud.revision=data.revision;if(validBoard(data.draft))installBoard(data.draft);else installBoard(sampleBoard());renderSaved();cloud.enabled=true;loaded=true;$('#studio').inert=false;$('#savedPage').inert=false;$('#closetPage').inert=false;$('#cloudStatus').textContent='내 계정에 연결됨 · 배치 자동 저장';$('#cloudLogin').hidden=true;
  try{const old=JSON.parse(localStorage.getItem('form-looks-v1')||'[]');legacy=Array.isArray(old)?old.filter(l=>typeof l.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(l.id)&&typeof l.name==='string'&&validLegacy(l.state)):[];$('#importLegacy').hidden=!legacy.length||!!localStorage.getItem('form-migrated-'+userId);}catch{}
 }catch(e){$('#cloudStatus').textContent=e.message;$('#cloudRetry').hidden=false;$('#cloudLogin').hidden=e.status!==401;}
}
async function capture(board=state){
 const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1140;const ctx=canvas.getContext('2d');ctx.fillStyle=board.background;ctx.fillRect(0,0,900,1140);
 for(const p of board.pieces){const item=imageFor(p);if(!item)throw new Error('등록한 사진을 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.');const img=await loadImage(item.image),w=p.width/100*900,h=w*img.naturalHeight/img.naturalWidth;ctx.save();ctx.translate(p.x/100*900,p.y/100*1140);ctx.rotate(p.rotation*Math.PI/180);ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();}
 ctx.fillStyle='#79836b';ctx.font='13px sans-serif';ctx.fillText('THE EVERYDAY EDIT',38,45);ctx.fillText('FORM / 01',765,45);ctx.font='italic 30px Georgia';ctx.fillText('a look, entirely yours.',42,1097);
 let image=canvas.toDataURL('image/jpeg',.82);if(image.length>1050000)image=canvas.toDataURL('image/jpeg',.65);return image;
}
function formBusy(form,busy){form.querySelectorAll('input,select,button').forEach(e=>e.disabled=busy);}
function openUpload({category=filter==='all'?'top':filter,addToBoard=screen==='studio'}={}){if(uploading)return;$('#uploadForm').reset();photoLoad++;photoEditor.clear();uploadData=null;pendingGarment=null;$('#uploadPreview').hidden=true;$('#filePrompt').hidden=false;$('#filePrompt').textContent='＋ 사진 선택 · JPG / PNG / WebP';$('#uploadError').textContent='';$('#garmentCategory').value=category;$('#addAfterUpload').checked=addToBoard;$('#uploadDialog').showModal();}
$('#photoFile').onchange=async e=>{
 const request=++photoLoad;uploadData=null;pendingGarment=null;photoEditor.clear();$('#uploadError').textContent='';$('#uploadPreview').hidden=true;$('#filePrompt').hidden=false;const file=e.target.files[0];if(!file)return;
 if(file.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){$('#uploadError').textContent='10MB 이하의 JPG, PNG, WebP 사진을 선택해 주세요.';return;}
 $('#uploadSubmit').disabled=true;
 try{const bitmap=await createImageBitmap(file);try{if(request!==photoLoad)return;if(bitmap.width*bitmap.height>40000000)throw new Error('사진 해상도가 너무 커요. 4,000만 화소 이하로 줄여 주세요.');photoEditor.setImage(bitmap);}finally{bitmap.close();}
  $('#filePrompt').textContent='사진 다시 선택';if(!$('#garmentName').value)$('#garmentName').value=file.name.replace(/\.[^.]+$/,'').slice(0,60);
 }catch(error){if(request===photoLoad)$('#uploadError').textContent=error.message||'사진을 읽지 못했어요.';}finally{if(request===photoLoad)$('#uploadSubmit').disabled=false;}
};
$('#uploadForm').onsubmit=async e=>{
 e.preventDefault();if(uploading)return;if(!uploadData){$('#uploadError').textContent='사진을 먼저 선택해 주세요.';return;}
 pendingGarment??={id:crypto.randomUUID(),name:$('#garmentName').value.trim(),category:$('#garmentCategory').value,sourceUrl:$('#garmentUrl').value.trim(),features:$('#garmentFeatures').value.trim(),image:uploadData};uploading=true;photoEditor.setLocked(true);formBusy(e.currentTarget,true);$('#uploadError').textContent='';$('#uploadSubmit').textContent='사진을 서버에 저장 중…';
 try{const data=await api('/api/garments/'+pendingGarment.id,{method:'PUT',body:JSON.stringify(pendingGarment)});garments=[data.garment,...garments.filter(x=>x.id!==data.garment.id)];filter=data.garment.category;renderWardrobe();const add=$('#addAfterUpload').checked;if(add)addItem(data.garment);closet.focusCategory(data.garment.category);$('#uploadDialog').close();pendingGarment=null;toast(add?'내 옷장에 등록하고 보드에 놓았어요.':'선택한 분류에 옷 사진을 저장했어요.');}catch(e){$('#uploadError').textContent=e.message;}finally{uploading=false;formBusy($('#uploadForm'),false);photoEditor.setLocked(false);$('#uploadSubmit').textContent='내 옷장에 등록';}
};
for(const id of ['garmentName','garmentCategory','garmentUrl','garmentFeatures'])$('#'+id).oninput=()=>pendingGarment=null;
$('#saveLook').onclick=()=>{if(!state.pieces.length){toast('사진을 하나 이상 놓아 주세요.');return;}if(saved.length>=100){toast('코디는 최대 100개까지 저장할 수 있어요.');return;}pendingLook=null;$('#lookName').value='나의 코디 '+(saved.length+1);$('#saveError').textContent='';$('#saveDialog').showModal();$('#lookName').select();};
$('#saveForm').onsubmit=async e=>{
 e.preventDefault();if(saving)return;const name=$('#lookName').value.trim();if(!name)return;saving=true;formBusy(e.currentTarget,true);$('#saveError').textContent='';
 try{if(!pendingLook){const snapshot=clone(state);pendingLook={id:crypto.randomUUID(),name,state:snapshot,image:await capture(snapshot)};}const data=await api('/api/looks/'+pendingLook.id,{method:'PUT',body:JSON.stringify(pendingLook)});saved=[data.look,...saved.filter(x=>x.id!==data.look.id)];renderSaved();pendingLook=null;$('#saveDialog').close();toast('사진과 배치를 코디로 저장했어요.');}catch(e){$('#saveError').textContent=e.message;}finally{saving=false;formBusy($('#saveForm'),false);}
};
$('#lookName').oninput=()=>pendingLook=null;
$('#saveDialog').oncancel=e=>{if(saving)e.preventDefault()};$('#uploadDialog').oncancel=e=>{if(uploading)e.preventDefault()};
$$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
$('#uploadOpen').onclick=openUpload;$('#uploadMain').onclick=openUpload;
$('#sizeRange').oninput=e=>{const p=selected();if(!p)return;p.width=Number(e.target.value);positionElement($('#pieces [data-key="'+p.key+'"]'),p);renderSelection();changed()};
$('#rotateRange').oninput=e=>{const p=selected();if(!p)return;p.rotation=Number(e.target.value);positionElement($('#pieces [data-key="'+p.key+'"]'),p);renderSelection();changed()};
$('#removePiece').onclick=removeSelected;
$('#moveFront').onclick=()=>{const p=selected();if(!p)return;state.pieces=state.pieces.filter(x=>x.key!==p.key);state.pieces.push(p);renderBoard();changed();};
$('#moveBack').onclick=()=>{const p=selected();if(!p)return;state.pieces=state.pieces.filter(x=>x.key!==p.key);state.pieces.unshift(p);renderBoard();changed();};
$('#autoArrange').onclick=()=>{const counts={};state.pieces.forEach(p=>{const count=counts[p.category]||0;Object.assign(p,placements[p.category]);p.x=Math.min(90,p.x+count*4);p.y=Math.min(90,p.y+count*4);counts[p.category]=count+1;});renderBoard();changed();toast('사진을 기본 위치로 정돈했어요.');};
$('#clearBoard').onclick=()=>{if(!state.pieces.length||confirm('현재 보드를 비울까요? 옷장과 저장한 코디는 유지됩니다.')){installBoard(blankBoard());changed();}};
$('#useSamples').onclick=()=>{installBoard(sampleBoard());changed()};
$('#downloadBoard').onclick=async()=>{const button=$('#downloadBoard');button.disabled=true;try{const url=await capture(clone(state));const a=document.createElement('a');a.href=url;a.download='form-outfit.jpg';a.click();toast('코디 이미지를 다운로드합니다.');}catch(e){toast(e.message)}finally{button.disabled=false}};
$('#closetTab').onclick=()=>{showScreen('closet');refreshLibrary().catch(e=>toast(e.message))};$('#studioTab').onclick=()=>showScreen('studio');$('#savedTab').onclick=()=>{showScreen('saved');refreshLibrary().catch(e=>toast(e.message))};$('#newBoard').onclick=()=>{showScreen('studio');installBoard(blankBoard());changed();};
$('#cloudRetry').onclick=()=>loaded?cloud.flush():connectCloud();$('#useServer').onclick=()=>{const board=cloud.useServer();installBoard(validBoard(board)?board:blankBoard());};$('#keepLocal').onclick=()=>cloud.keepLocal();
$('#importLegacy').onclick=async()=>{const b=$('#importLegacy');b.disabled=true;try{for(const look of legacy)await api('/api/looks/'+look.id,{method:'PUT',body:JSON.stringify(look)});try{localStorage.setItem('form-migrated-'+userId,'1')}catch{}b.hidden=true;await refreshLibrary();toast('이전 코디를 원본 기록으로 옮겼어요.')}catch(e){toast(e.message)}finally{b.disabled=false}};
window.addEventListener('beforeunload',e=>{if(cloud.dirty||saving||uploading||closet.busy||boardControls.dragging){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cloud.flush();else refreshLibrary().catch(()=>{})});
for(const [key,label] of [['all','전체'],...Object.entries(categories)]){const b=document.createElement('button');b.dataset.filter=key;b.textContent=label;b.onclick=()=>{filter=key;renderWardrobe()};$('#categoryFilters').append(b);}
const closet=createCloset({getGarments:()=>garments,openUpload,toast,onDelete:async item=>{await cloud.flush();if(cloud.dirty)throw new Error('현재 보드 저장을 먼저 완료해 주세요.');await api('/api/garments/'+item.id+'?permanent=1',{method:'DELETE'});garments=garments.filter(g=>g.id!==item.id);imageCache.delete(item.image);renderWardrobe();renderBoard();},onAdd:item=>{addItem(item);showScreen('studio');},onUpdate:item=>{garments=garments.map(g=>g.id===item.id?item:g);let recategorized=false;for(const piece of state.pieces)if(piece.source==='wardrobe'&&piece.itemId===item.id&&piece.category!==item.category){piece.category=item.category;recategorized=true;}renderWardrobe();renderBoard();if(recategorized)changed();}});
const boardControls=createBoardControls({board:$('#board'),getSelected:selected,getElement:p=>$('#pieces [data-key="'+p.key+'"]'),onUpdate:p=>{positionElement($('#pieces [data-key="'+p.key+'"]'),p);renderSelection();},onCommit:changed});
createRecommender({getGarments:()=>garments,getSelected:selected,apply:ids=>{
 const items=ids.map(id=>garments.find(g=>g.id===id&&!g.archived));
 if(items.some(item=>!item)){toast('옷장이 변경되었어요. 다시 추천받아 주세요.');return;}
 if(state.pieces.length&&!confirm('현재 보드를 추천 코디로 바꿀까요? 보관하려면 먼저 코디를 저장해 주세요.'))return;
 const board=blankBoard();board.background=state.background;
 board.pieces=items.map(item=>({key:crypto.randomUUID(),source:'wardrobe',itemId:item.id,category:item.category,...placements[item.category]}));
 installBoard(board);changed();toast('추천 코디를 보드에 놓았어요.');
}});
renderBoard();renderWardrobe();connectCloud();
