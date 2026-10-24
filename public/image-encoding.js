// Encode fresh from the edit canvas, never from a previously lossy export.
export const IMAGE_PROFILES = {
  garment: {maxEdge:1000,minEdge:800,targetBytes:300000,maxBytes:1600000,qualities:[.85,.78,.72],type:'image/webp'},
  thumbnail: {maxEdge:320,minEdge:160,targetBytes:40000,maxBytes:120000,qualities:[.8,.72,.65],type:'image/webp'},
  preview: {maxEdge:760,minEdge:600,targetBytes:150000,maxBytes:800000,qualities:[.82,.76,.72],type:'image/jpeg'}
};
export function fitImage(width,height,maxEdge){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('사진 크기가 올바르지 않아요.');
  const scale=Math.min(1,maxEdge/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
const browserEncode=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('사진을 압축하지 못했어요. 다시 시도해 주세요.')),type,quality));
export async function encodeImage(source,profile,{makeCanvas=()=>document.createElement('canvas'),encode=browserEncode}={}){
  const sourceWidth=source.naturalWidth||source.width,sourceHeight=source.naturalHeight||source.height;
  const edges=[profile.maxEdge,Math.round((profile.maxEdge+profile.minEdge)/2),profile.minEdge];
  const tried=new Set();let smallest=null;
  for(const edge of edges){
    const size=fitImage(sourceWidth,sourceHeight,edge),key=size.width+'x'+size.height;
    if(tried.has(key))continue;tried.add(key);
    const canvas=makeCanvas();canvas.width=size.width;canvas.height=size.height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('사진 편집을 지원하지 않는 브라우저입니다.');
    // A transparent canvas preserves cutouts; never fill it for WebP/PNG.
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,size.width,size.height);
    for(const quality of profile.qualities){
      const blob=await encode(canvas,profile.type,quality);
      if(!blob||!['image/webp','image/png','image/jpeg'].includes(blob.type)||!blob.size)throw new Error('사진 변환 결과를 읽지 못했어요.');
      if(profile.type==='image/webp'&&blob.type==='image/jpeg')throw new Error('투명 배경을 보존하지 못했어요. 다른 브라우저에서 시도해 주세요.');
      if(!smallest||blob.size<smallest.blob.size)smallest={blob,...size};
      if(blob.size<=profile.targetBytes)return {blob,...size};
      if(blob.type==='image/png')break; // PNG fallback ignores quality; try a smaller canvas.
    }
  }
  if(smallest?.blob.size<=profile.maxBytes)return smallest;
  throw new Error('사진이 너무 커요. 영역을 조금 더 자른 뒤 등록해 주세요.');
}
export const imageDataURL=blob=>new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('사진을 읽지 못했어요.'));reader.readAsDataURL(blob);
});
export async function createUploadImages(canvas){
  const main=await encodeImage(canvas,IMAGE_PROFILES.garment);
  const thumbnail=await encodeImage(canvas,IMAGE_PROFILES.thumbnail);
  return {image:await imageDataURL(main.blob),thumbnail:await imageDataURL(thumbnail.blob)};
}
