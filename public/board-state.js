export const categories={top:'상의',bottom:'하의',shoes:'신발',outer:'아우터',accessory:'가방·소품'};
export const samples=[
 {id:'sample-tee',name:'아이보리 티셔츠',category:'top',image:'/samples/tee.png',source:'sample'},
 {id:'sample-jeans',name:'스트레이트 데님',category:'bottom',image:'/samples/jeans.png',source:'sample'},
 {id:'sample-sneakers',name:'크림 스니커즈',category:'shoes',image:'/samples/sneakers.png',source:'sample'}
];
export const backgrounds=['#f4f1e9','#ffffff','#e8ecdf','#e9e5e1'];
export const placements={top:{x:37,y:26,width:55,rotation:-4},bottom:{x:43,y:64,width:42,rotation:3},shoes:{x:78,y:74,width:30,rotation:12},outer:{x:70,y:33,width:45,rotation:6},accessory:{x:80,y:45,width:24,rotation:-8}};
export const blankBoard=()=>({version:2,background:backgrounds[0],pieces:[]});
export const sampleBoard=()=>({version:2,background:backgrounds[0],pieces:samples.map((item,i)=>({key:'sample-'+i,source:'sample',itemId:item.id,category:item.category,...placements[item.category]}))});
const idPattern=/^[A-Za-z0-9_-]{1,100}$/;
export function validBoard(s){return !!s&&s.version===2&&backgrounds.includes(s.background)&&Array.isArray(s.pieces)&&s.pieces.length<=12&&new Set(s.pieces.map(p=>p?.key)).size===s.pieces.length&&s.pieces.every(p=>p&&typeof p.key==='string'&&idPattern.test(p.key)&&['sample','wardrobe'].includes(p.source)&&typeof p.itemId==='string'&&idPattern.test(p.itemId)&&Object.hasOwn(categories,p.category)&&[['x',5,95],['y',5,95],['width',12,85],['rotation',-180,180]].every(([k,a,b])=>Number.isFinite(p[k])&&p[k]>=a&&p[k]<=b)&&(p.source!=='sample'||samples.some(x=>x.id===p.itemId&&x.category===p.category)));}
export function sanitizeBoard(s){if(!validBoard(s))throw new Error('잘못된 코디 보드입니다.');return {version:2,background:s.background,pieces:s.pieces.map(p=>Object.fromEntries(['key','source','itemId','category','x','y','width','rotation'].map(k=>[k,p[k]])))}}
export function resolvePiece(piece,garments){return piece.source==='sample'?samples.find(x=>x.id===piece.itemId):garments.find(x=>x.id===piece.itemId)}
