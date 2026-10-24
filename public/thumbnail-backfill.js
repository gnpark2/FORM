import {api} from './cloud-store.js';
import {encodeImage,IMAGE_PROFILES,imageDataURL} from './image-encoding.js';

export function createThumbnailBackfill({getGarments,onUpdate,onComplete,toast}){
  let busy=false,stop=false;
  const root=document.createElement('section');root.className='thumbnail-upgrade';root.setAttribute('aria-label','기존 사진 목록 최적화');
  const start=document.createElement('button');start.type='button';start.className='btn secondary';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='btn secondary';cancel.textContent='중단';cancel.hidden=true;
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  root.append(start,cancel,status);document.querySelector('.closet-tools').after(root);
  function refresh(){
    const count=getGarments().filter(g=>!g.hasThumbnail).length;
    start.disabled=busy||!count;start.textContent=busy?'사진 목록을 최적화하는 중…':`기존 사진 목록 최적화 (${count}장)`;
    cancel.hidden=!busy;root.hidden=!busy&&!count&&!status.textContent;
  }
  cancel.onclick=()=>{stop=true;cancel.disabled=true;status.textContent='현재 사진 처리가 끝나면 중단합니다.';};
  start.onclick=async()=>{
    if(busy)return;
    const items=getGarments().filter(g=>!g.hasThumbnail);
    if(!items.length)return;
    if(!confirm('기존 사진을 한 번씩 불러와 작은 목록용 이미지를 만들까요? 원본과 코디는 그대로 유지되며, 사진 다운로드에 데이터가 사용됩니다.'))return;
    busy=true;stop=false;cancel.disabled=false;let completed=0;
    refresh();
    try{
      for(const item of items){
        if(stop)break;
        if(!getGarments().some(g=>g.id===item.id))continue;
        status.textContent=`${completed} / ${items.length}장 완료 · ${item.name}`;
        const response=await fetch(item.image,{credentials:'same-origin',cache:'no-cache',signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw new Error('사진을 불러오지 못했어요. 연결과 로그인을 확인한 뒤 다시 시도해 주세요.');
        const blob=await response.blob();
        if(!['image/png','image/webp','image/jpeg'].includes(blob.type)||blob.size>1600000)throw new Error('지원하지 않는 사진입니다.');
        const bitmap=await createImageBitmap(blob);
        let thumbnail;
        try{if(bitmap.width*bitmap.height>40000000)throw new Error('사진 해상도가 너무 커요.');thumbnail=await imageDataURL((await encodeImage(bitmap,IMAGE_PROFILES.thumbnail)).blob);}finally{bitmap.close();}
        const data=await api('/api/garments/'+item.id+'/thumbnail',{method:'PUT',body:JSON.stringify({thumbnail})});
        onUpdate(data.garment);completed++;
      }
      status.textContent=stop?`${completed}장 완료 후 중단했어요. 다시 누르면 남은 사진부터 처리합니다.`:`${completed}장의 목록을 최적화했어요. 원본과 코디는 유지됩니다.`;
    }catch(e){status.textContent=`${completed}장 완료 · ${e.message} 완료한 사진은 유지되며 다시 시도할 수 있습니다.`;toast(e.message);}
    finally{busy=false;cancel.hidden=true;onComplete();refresh();}
  };
  refresh();
  return {refresh,get busy(){return busy;}};
}
