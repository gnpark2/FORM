const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const normalizeRotation=angle=>((angle+180)%360+360)%360-180;
export function resizedWidth(width,rotation,aspect,boardWidth,dx,dy,corner){
 const [sx,sy]=corner,angle=rotation*Math.PI/180;
 const vx=sx*Math.cos(angle)-sy*aspect*Math.sin(angle),vy=sx*Math.sin(angle)+sy*aspect*Math.cos(angle);
 return clamp(width+2*(dx*vx+dy*vy)/(vx*vx+vy*vy)/boardWidth*100,12,85);
}
export function rotatedAngle(rotation,startAngle,currentAngle,snap=false){const angle=rotation+normalizeRotation((currentAngle-startAngle)*180/Math.PI);return normalizeRotation(snap?Math.round(angle/15)*15:angle);}
export function createBoardControls({board,getSelected,getElement,onUpdate,onCommit}){
 const overlay=document.createElement('div');overlay.className='piece-controls';overlay.hidden=true;overlay.setAttribute('role','group');overlay.setAttribute('aria-label','선택한 옷 크기와 회전 조절');board.append(overlay);
 let dragging=false;
 function update(piece){const el=getElement(piece);if(!el){overlay.hidden=true;return;}overlay.hidden=false;overlay.style.left=piece.x+'%';overlay.style.top=piece.y+'%';overlay.style.width=piece.width+'%';overlay.style.height=el.offsetHeight+'px';overlay.style.setProperty('--angle',piece.rotation+'deg');}
 function makeHandle(name,corner){
  const button=document.createElement('button');button.type='button';button.className=corner?'resize-handle handle-'+name:'rotate-handle';button.setAttribute('aria-label',corner?name+' 모서리 크기 조절':'회전 조절');button.title=corner?'드래그로 크기 조절 · 방향키로 미세 조절':'드래그로 회전 · 방향키로 미세 조절 · Shift로 15° 단위';button.textContent=corner?'':'↻';overlay.append(button);
  button.onclick=e=>e.stopPropagation();
  button.onpointerdown=e=>{
   if(e.button!==0||dragging)return;const piece=getSelected(),el=piece&&getElement(piece);if(!el)return;e.preventDefault();e.stopPropagation();dragging=true;button.setPointerCapture(e.pointerId);button.focus({preventScroll:true});
   const bounds=el.getBoundingClientRect(),center={x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2};
   const start={x:e.clientX,y:e.clientY,width:piece.width,rotation:piece.rotation,angle:Math.atan2(e.clientY-center.y,e.clientX-center.x),aspect:el.offsetHeight/el.offsetWidth,boardWidth:board.clientWidth};let modified=false;
   button.onpointermove=event=>{
    if(!button.hasPointerCapture(event.pointerId))return;
    if(corner)piece.width=resizedWidth(start.width,start.rotation,start.aspect,start.boardWidth,event.clientX-start.x,event.clientY-start.y,corner);
    else {const dx=event.clientX-center.x,dy=event.clientY-center.y;if(Math.hypot(dx,dy)<8)return;piece.rotation=rotatedAngle(start.rotation,start.angle,Math.atan2(dy,dx),event.shiftKey);}
    modified=piece.width!==start.width||piece.rotation!==start.rotation;onUpdate(piece);update(piece);
   };
   const finish=()=>{if(!dragging)return;dragging=false;button.onpointermove=null;button.onpointerup=null;button.onpointercancel=null;button.onlostpointercapture=null;if(button.hasPointerCapture(e.pointerId))button.releasePointerCapture(e.pointerId);if(modified)onCommit();};
   button.onpointerup=finish;button.onpointercancel=finish;button.onlostpointercapture=finish;
  };
  button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const piece=getSelected();if(!piece)return;const sign=['ArrowRight','ArrowUp'].includes(e.key)?1:-1;if(corner)piece.width=clamp(piece.width+sign*(e.shiftKey?5:1),12,85);else piece.rotation=normalizeRotation(piece.rotation+sign*(e.shiftKey?15:5));onUpdate(piece);update(piece);onCommit();};
 }
 for(const [name,corner] of [['좌상',[-1,-1]],['우상',[1,-1]],['좌하',[-1,1]],['우하',[1,1]]])makeHandle(name,corner);makeHandle('회전',null);
 const observer=new ResizeObserver(()=>{const piece=getSelected();if(piece)update(piece)});observer.observe(board);
 return {sync(){const piece=getSelected();if(!piece){overlay.hidden=true;return;}update(piece);},get dragging(){return dragging}};
}
