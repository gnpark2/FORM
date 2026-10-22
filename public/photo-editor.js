// Connected-color removal deliberately leaves disconnected areas of a garment intact.
export function removeConnectedBackground(data,width,height,seeds,tolerance=30){
 const seen=new Uint8Array(width*height),queue=new Int32Array(width*height),limit=Math.max(0,Math.min(150,tolerance))**2;
 let removed=0;
 for(const [sx,sy] of seeds){
  const seed=Math.floor(sy)*width+Math.floor(sx);if(sx<0||sy<0||sx>=width||sy>=height||seen[seed]||data[seed*4+3]===0)continue;
  const color=Array.from(data.slice(seed*4,seed*4+3));let head=0,tail=0;queue[tail++]=seed;seen[seed]=1;
  while(head<tail){const p=queue[head++],offset=p*4;if(data[offset+3]===0)continue;
   const distance=((data[offset]-color[0])**2+(data[offset+1]-color[1])**2+(data[offset+2]-color[2])**2)/3;
   if(distance>limit)continue;data[offset+3]=0;removed++;
   const x=p%width;for(const n of [x>0?p-1:-1,x<width-1?p+1:-1,p>=width?p-width:-1,p<width*(height-1)?p+width:-1])if(n>=0&&!seen[n]){seen[n]=1;queue[tail++]=n;}
  }
  seen.fill(0);
 }
 return removed;
}
export function cropBounds(width,height,selection){
 const x=Math.max(0,Math.min(width-1,Math.round(selection.x))),y=Math.max(0,Math.min(height-1,Math.round(selection.y)));
 return {x,y,width:Math.max(1,Math.min(width-x,Math.round(selection.width))),height:Math.max(1,Math.min(height-y,Math.round(selection.height)))};
}
export function createPhotoEditor({onChange,onError}){
 const $=s=>document.querySelector(s),canvas=$('#photoCanvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 let original=null,history=[],mode='crop',selection=null,drag=null,locked=false;
 const fields=['X','Y','W','H'];
 function snapshot(){return ctx.getImageData(0,0,canvas.width,canvas.height);}
 function remember(){history.push(snapshot());if(history.length>8)history.shift();}
 function restore(data){canvas.width=data.width;canvas.height=data.height;ctx.putImageData(data,0,0);selection=null;drawSelection();}
 function emit(){try{let data=canvas.toDataURL('image/webp',.9);if(data.length>2100000)data=canvas.toDataURL('image/webp',.65);if(data.length>2100000)throw new Error('편집한 사진이 커요. 영역을 조금 더 잘라 주세요.');onChange(data);}catch(e){onError(e.message)}$('#photoUndo').disabled=locked||history.length===0;$('#photoDimensions').textContent=canvas.width+' × '+canvas.height+' px';}
 function point(e){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width-1,(e.clientX-r.left)/r.width*canvas.width)),y:Math.max(0,Math.min(canvas.height-1,(e.clientY-r.top)/r.height*canvas.height))};}
 function drawSelection(){
  canvas.parentElement.style.maxWidth=Math.round(440*canvas.width/canvas.height)+'px';
  if(!selection)[0,0,canvas.width,canvas.height].forEach((n,i)=>$('#crop'+fields[i]).value=n);
  const box=$('#cropSelection');box.hidden=!selection||mode!=='crop';$('#cropApply').disabled=locked||!selection;
  if(!selection)return;box.style.left=selection.x/canvas.width*100+'%';box.style.top=selection.y/canvas.height*100+'%';box.style.width=selection.width/canvas.width*100+'%';box.style.height=selection.height/canvas.height*100+'%';
  [selection.x,selection.y,selection.width,selection.height].forEach((n,i)=>$('#crop'+fields[i]).value=Math.round(n));
 }
 function setMode(value){mode=value;document.querySelectorAll('[data-photo-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.photoMode===mode)));$('#cropOptions').hidden=mode!=='crop';$('#backgroundOptions').hidden=mode!=='background';$('#eraseOptions').hidden=mode!=='erase';canvas.style.cursor=mode==='erase'?'crosshair':mode==='background'?'pointer':'crosshair';drawSelection();}
 function erase(from,to){ctx.save();ctx.globalCompositeOperation='destination-out';ctx.lineWidth=Number($('#brushSize').value)/100*canvas.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(from.x,from.y);ctx.lineTo(to.x+.01,to.y+.01);ctx.stroke();ctx.restore();}
 canvas.onpointerdown=e=>{
  if(locked||!original||e.button!==0)return;e.preventDefault();const p=point(e);
  if(mode==='background'){remember();const data=snapshot();const n=removeConnectedBackground(data.data,canvas.width,canvas.height,[[p.x,p.y]],Number($('#backgroundTolerance').value));ctx.putImageData(data,0,0);$('#photoEditorStatus').textContent=n?'선택한 곳과 이어진 비슷한 색의 배경을 지웠어요.':'지울 영역이 없어요. 다른 위치를 선택해 주세요.';emit();return;}
  canvas.setPointerCapture(e.pointerId);drag={start:p,last:p};if(mode==='erase'){remember();erase(p,p);}else{selection={x:p.x,y:p.y,width:1,height:1};drawSelection();}
 };
 canvas.onpointermove=e=>{if(!drag)return;const p=point(e);if(mode==='erase')erase(drag.last,p);else{selection=cropBounds(canvas.width,canvas.height,{x:Math.min(drag.start.x,p.x),y:Math.min(drag.start.y,p.y),width:Math.abs(drag.start.x-p.x),height:Math.abs(drag.start.y-p.y)});drawSelection();}drag.last=p;};
 const finish=()=>{if(!drag)return;drag=null;if(mode==='erase'){emit();$('#photoEditorStatus').textContent='문지른 부분을 지웠어요. 되돌리기로 복구할 수 있어요.';}};canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
 document.querySelectorAll('[data-photo-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.photoMode));
 $('#cropAll').onclick=()=>{selection={x:0,y:0,width:canvas.width,height:canvas.height};drawSelection();};
 for(const key of fields)$('#crop'+key).oninput=()=>{selection=cropBounds(canvas.width,canvas.height,{x:Number($('#cropX').value),y:Number($('#cropY').value),width:Number($('#cropW').value),height:Number($('#cropH').value)});drawSelection();};
 $('#cropApply').onclick=()=>{if(!selection)return;const r=cropBounds(canvas.width,canvas.height,selection);if(r.width<8||r.height<8){onError('가로와 세로를 8px 이상 선택해 주세요.');return;}remember();const data=ctx.getImageData(r.x,r.y,r.width,r.height);restore(data);emit();$('#photoEditorStatus').textContent='선택한 영역으로 잘랐어요.';};
 $('#removeCornerBackground').onclick=()=>{remember();const data=snapshot();const n=removeConnectedBackground(data.data,canvas.width,canvas.height,[[0,0],[canvas.width-1,0],[0,canvas.height-1],[canvas.width-1,canvas.height-1]],Number($('#backgroundTolerance').value));ctx.putImageData(data,0,0);emit();$('#photoEditorStatus').textContent=n?'모서리와 이어진 단색 배경을 지웠어요. 옷까지 지워졌다면 되돌리기를 눌러 주세요.':'변경된 영역이 없어요. 사진에서 배경을 직접 눌러 주세요.';};
 $('#photoUndo').onclick=()=>{if(!history.length)return;restore(history.pop());emit();$('#photoEditorStatus').textContent='이전 편집으로 되돌렸어요.';};
 $('#photoReset').onclick=()=>{if(!original)return;remember();restore(original);emit();$('#photoEditorStatus').textContent='처음 선택한 사진으로 되돌렸어요.';};
 $('#backgroundTolerance').oninput=e=>$('#toleranceValue').textContent=e.target.value;
 $('#brushSize').oninput=e=>$('#brushValue').textContent=e.target.value+'%';
 return {setImage(image){const scale=Math.min(1,1000/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);original=snapshot();history=[];selection=null;$('#photoEditor').hidden=false;$('#photoEditorStatus').textContent='영역을 드래그해서 자르거나 배경을 지워 보세요. 편집 결과가 등록됩니다.';setMode('crop');emit();},clear(){original=null;history=[];selection=null;drag=null;$('#photoEditor').hidden=true;},setLocked(value){locked=value;$('#photoEditor').inert=value;$('#photoUndo').disabled=value||!history.length;$('#cropApply').disabled=value||!selection;}};
}
