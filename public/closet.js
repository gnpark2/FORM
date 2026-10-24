import {matchesSubcategory} from './subcategories.js';
import {categories} from './board-state.js';
import {api} from './cloud-store.js';
export function filterCloset(items,{category='all',query='',archived=false,subcategory=''}={}){
 const needle=query.trim().toLocaleLowerCase('ko-KR');return items.filter(g=>!!g.archived===archived&&matchesSubcategory(g,subcategory)&&(category==='all'||g.category===category)&&(!needle||g.name.toLocaleLowerCase('ko-KR').includes(needle)));
}
export function createCloset({subcategories,getGarments,onUpdate,onAdd,onDelete,openUpload,toast}){
 const $=s=>document.querySelector(s);let category='all',subcategory='',archived=false,query='',editing=null,busy=false;
 const icons={all:'◫',top:'01',bottom:'02',outer:'03',shoes:'04',accessory:'05'};
 const button=(text,fn,className='btn secondary')=>{const b=document.createElement('button');b.className=className;b.textContent=text;b.onclick=fn;return b;};
 function render(){
  $('#closetActionError').textContent='';const items=getGarments(),active=items.filter(g=>!g.archived);$('#closetNavCount').textContent=active.length;
  const filters=$('#closetCategories');filters.replaceChildren();
  for(const [key,label] of [['all','전체'],...Object.entries(categories)]){
   const b=button('',()=>{category=key;subcategory='';render()},'closet-category'+(category===key?' active':''));const icon=document.createElement('span');icon.className='category-number';icon.textContent=icons[key];const name=document.createElement('strong');name.textContent=label;const count=document.createElement('small');count.textContent=items.filter(g=>!!g.archived===archived&&(key==='all'||g.category===key)).length+'개';b.append(icon,name,count);b.setAttribute('aria-pressed',String(category===key));filters.append(b);
  }
  subcategory=subcategories.filter($('#closetSubcategories'),category,subcategory,id=>{subcategory=id;render();});
  const matches=filterCloset(items,{category,query,archived,subcategory});$('#closetHeading').textContent=(archived?'숨긴 옷 · ':'')+(category==='all'?'전체':categories[category]);$('#closetResultCount').textContent=matches.length+'개의 옷';$('#toggleArchived').setAttribute('aria-pressed',String(archived));$('#toggleArchived').textContent=archived?'내 옷으로 돌아가기':'숨긴 옷 보기';
  const root=$('#closetGrid');root.replaceChildren();for(const item of matches){
   const card=document.createElement('article');card.className='closet-card';const visual=document.createElement('div');visual.className='closet-photo';const img=document.createElement('img');img.src=item.thumbnail||item.image;img.alt=item.name;img.loading='lazy';img.decoding='async';visual.append(img);const info=document.createElement('div');info.className='closet-card-info';const tag=document.createElement('small');tag.textContent=[categories[item.category],subcategories.labels(item)].filter(Boolean).join(' · ');const title=document.createElement('h3');title.textContent=item.name;const actions=document.createElement('div');actions.className='closet-card-actions';
   if(!archived)actions.append(button('코디에 추가 ↗',()=>onAdd(item),'btn primary'));
   else actions.append(button('옷장으로 복원',async e=>{const b=e.currentTarget;b.disabled=true;try{const data=await api('/api/garments/'+item.id,{method:'PATCH',body:JSON.stringify({archived:false})});onUpdate(data.garment);render();toast('옷장으로 복원했어요.');}catch(error){b.disabled=false;toast(error.message)}},'btn primary'));
   actions.append(button('정보 수정',()=>edit(item)));
   info.append(tag,title,actions);
   const remove=button('옷 삭제',async e=>{if(busy||!confirm('“'+item.name+'” 사진과 정보를 영구 삭제할까요? 복원할 수 없습니다. 사용 중인 보드나 저장한 코디에서 먼저 빼 주세요.'))return;const b=e.currentTarget;busy=true;b.disabled=true;try{await onDelete(item);render();toast('옷 사진과 정보를 삭제했어요.');}catch(error){$('#closetActionError').textContent=error.message;b.disabled=false;}finally{busy=false;}},'btn danger closet-delete');info.append(remove);
   if(!archived)info.append(button('옷장에서 숨기기',async e=>{if(!confirm('옷장에서 숨길까요? 저장한 코디의 사진은 유지됩니다.'))return;const b=e.currentTarget;b.disabled=true;try{await api('/api/garments/'+item.id,{method:'DELETE'});onUpdate({...item,archived:true});render();toast('숨긴 옷에서 다시 복원할 수 있어요.');}catch(error){b.disabled=false;toast(error.message)}},'text-button closet-hide'));
   card.append(visual,info);root.append(card);
  }
  $('#closetEmpty').hidden=matches.length>0;$('#closetEmptyTitle').textContent=query?'검색한 이름의 옷이 없어요.':archived?'숨겨 둔 옷이 없어요.':category==='all'?'내 옷장의 첫 번째 옷을 등록해 보세요.':categories[category]+' 사진을 등록해 보세요.';$('#closetEmptyText').textContent=query?'다른 이름으로 검색하거나 분류를 바꿔 보세요.':archived?'옷장에서 숨긴 사진이 여기에 모입니다.':'사진과 이름, 종류를 선택하면 내 계정에 보관됩니다.';$('#closetEmptyUpload').hidden=archived||!!query;
 }
 function edit(item){if(busy)return;editing=item;$('#editGarmentName').value=item.name;$('#editGarmentCategory').value=item.category;editSubcategories.set(item.subcategories);$('#editGarmentUrl').value=item.sourceUrl||'';$('#editGarmentFeatures').value=item.features||'';$('#editGarmentImage').src=item.image;$('#editGarmentError').textContent='';$('#editGarmentDialog').showModal();}
 for(const [key,label] of Object.entries(categories)){const option=document.createElement('option');option.value=key;option.textContent=label;$('#editGarmentCategory').append(option);}
 const editSubcategories=subcategories.picker($('#editGarmentCategory'));
 $('#editGarmentForm').onsubmit=async e=>{e.preventDefault();if(busy||subcategories.busy||!editing)return;const body={name:$('#editGarmentName').value.trim(),category:$('#editGarmentCategory').value,sourceUrl:$('#editGarmentUrl').value.trim(),features:$('#editGarmentFeatures').value.trim(),subcategories:editSubcategories.values()};if(!body.name){$('#editGarmentError').textContent='옷 이름을 입력해 주세요.';return;}busy=true;const controls=[...e.currentTarget.querySelectorAll('input,select,button')];controls.forEach(c=>c.disabled=true);$('#editGarmentError').textContent='';try{const data=await api('/api/garments/'+editing.id,{method:'PATCH',body:JSON.stringify(body)});onUpdate(data.garment);category=data.garment.category;subcategory='';query='';$('#closetSearch').value='';render();$('#editGarmentDialog').close();toast('옷 정보와 분류를 저장했어요.');}catch(error){$('#editGarmentError').textContent=error.message;}finally{busy=false;controls.forEach(c=>c.disabled=false);}};
 $('#editGarmentDialog').oncancel=e=>{if(busy)e.preventDefault()};
 $('#closetSearch').oninput=e=>{query=e.target.value;render()};$('#toggleArchived').onclick=()=>{archived=!archived;render()};
 const upload=()=>openUpload({category:category==='all'?'top':category,addToBoard:false});$('#closetUpload').onclick=upload;$('#closetEmptyUpload').onclick=upload;
 return {render,focusCategory(key){category=key;subcategory='';archived=false;query='';$('#closetSearch').value='';render();},get busy(){return busy}};
}
