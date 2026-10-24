import {api} from './cloud-store.js';
import {categories} from './board-state.js';

export const matchesSubcategory=(item,id)=>!id||(item.subcategories||[]).includes(id);
export function createSubcategories({onChange,onDelete,toast}) {
  let catalog=[],busy=false;
  const pickers=[];
  const node=(tag,text='',className='')=>{const el=document.createElement(tag);el.textContent=text;el.className=className;return el;};
  const button=(text,action,className='subcategory-chip')=>{const el=node('button',text,className);el.type='button';el.onclick=action;return el;};
  const options=category=>catalog.filter(t=>category==='all'||t.category===category);
  const label=(tag,all=false)=>(all?categories[tag.category]+' · ':'')+tag.name;
  function refresh(){pickers.forEach(p=>p.render());renderManager();onChange();}
  async function add(category,name){
    if(busy)return null;
    if(!name.trim()){toast('하위 분류 이름을 입력해 주세요.');return null;}
    busy=true;
    try{const data=await api('/api/subcategories/'+crypto.randomUUID(),{method:'PUT',body:JSON.stringify({category,name})});
      catalog=[...catalog.filter(t=>t.id!==data.subcategory.id),data.subcategory];return data.subcategory;
    }catch(e){toast(e.message);return null;}finally{busy=false;}
  }
  function filter(host,category,current,onSelect){
    const list=options(category);if(!list.some(t=>t.id===current))current='';
    host.replaceChildren();host.hidden=!list.length;
    for(const tag of [{id:'',name:'하위 분류 전체'},...list]){
      const b=button(tag.id?label(tag,category==='all'):tag.name,()=>onSelect(tag.id));
      b.classList.toggle('active',tag.id===current);b.setAttribute('aria-pressed',String(tag.id===current));host.append(b);
    }
    return current;
  }
  function picker(select,onInput=()=>{}){
    let selected=new Set(),generation=0;
    const root=node('section','','subcategory-picker'),title=node('p','하위 분류 · 여러 개 선택 가능','input-label'),choices=node('div','','subcategory-chips');
    const row=node('div','','subcategory-create'),input=node('input');input.maxLength=24;input.placeholder='예: 반팔, 여름 (한 번에 하나씩)';input.setAttribute('aria-label','새 하위 분류 이름');
    const addButton=button('＋ 만들기',async()=>{
      const category=select.value,version=generation;addButton.disabled=true;
      const tag=await add(category,input.value);
      if(tag&&version===generation&&select.value===category){if(selected.size<12)selected.add(tag.id);input.value='';onInput();}
      addButton.disabled=false;refresh();
    },'btn secondary');
    input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addButton.click();}};
    row.append(input,addButton);root.append(title,choices,row);select.after(root);
    const control={
      values:()=>[...selected],
      set(ids=[]){generation++;selected=new Set(ids);input.value='';this.render();},
      render(){
        const list=options(select.value);selected=new Set([...selected].filter(id=>list.some(t=>t.id===id)));
        choices.replaceChildren();
        if(!list.length)choices.append(node('small','아래에서 나만의 하위 분류를 만들어 보세요.'));
        for(const tag of list){
          const item=node('label','','subcategory-option'),check=node('input');check.type='checkbox';check.checked=selected.has(tag.id);
          check.onchange=()=>{if(check.checked&&selected.size>=12){check.checked=false;toast('최대 12개까지 선택할 수 있어요.');return;}
            if(check.checked)selected.add(tag.id);else selected.delete(tag.id);onInput();};
          item.append(check,node('span',tag.name));choices.append(item);
        }
      }
    };
    select.addEventListener('change',()=>{control.set();onInput();});pickers.push(control);control.render();return control;
  }
  const manager=document.querySelector('#subcategoryManager');
  const summary=node('summary','하위 분류 만들기 · 관리'),managerCategory=node('select');managerCategory.setAttribute('aria-label','하위 분류를 만들 종류');
  for(const [key,name] of Object.entries(categories)){const o=node('option',name);o.value=key;managerCategory.append(o);}
  const managerInput=node('input');managerInput.maxLength=24;managerInput.placeholder='새 하위 분류 이름';managerInput.setAttribute('aria-label','새 하위 분류 이름');
  const createButton=button('＋ 만들기',async()=>{createButton.disabled=true;const tag=await add(managerCategory.value,managerInput.value);createButton.disabled=false;if(tag)managerInput.value='';refresh();},'btn secondary');
  managerInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();createButton.click();}};
  const createRow=node('div','','subcategory-create'),managerList=node('div','','subcategory-chips');createRow.append(managerCategory,managerInput,createButton);
  manager.append(summary,node('p','분류를 삭제해도 옷 사진과 저장한 코디는 유지됩니다.','fine-print'),createRow,managerList);
  managerCategory.onchange=renderManager;
  function renderManager(){
    managerList.replaceChildren();
    for(const tag of options(managerCategory.value)){
      const b=button(tag.name+' ×',async()=>{
        if(busy||!confirm('“'+tag.name+'” 분류를 삭제할까요? 옷 사진은 유지됩니다.'))return;
        busy=true;b.disabled=true;
        try{await api('/api/subcategories/'+tag.id,{method:'DELETE'});catalog=catalog.filter(t=>t.id!==tag.id);onDelete(tag.id);refresh();}
        catch(e){toast(e.message);}finally{busy=false;b.disabled=false;}
      });b.setAttribute('aria-label',label(tag,true)+' 분류 삭제');managerList.append(b);
    }
  }
  return {picker,filter,get busy(){return busy;},
    setCatalog(list=[]){catalog=list;pickers.forEach(p=>p.render());renderManager();},
    labels:item=>catalog.filter(t=>t.category===item.category&&(item.subcategories||[]).includes(t.id)).map(t=>t.name).join(' · ')
  };
}
