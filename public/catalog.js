export const catalog={
 top:[{id:'tee',name:'베이식 티셔츠',en:'BASIC T-SHIRT',fit:'레귤러 핏',type:'tee'},{id:'oversized',name:'오버핏 티셔츠',en:'OVERSIZED T-SHIRT',fit:'여유로운 실루엣',type:'oversized'},{id:'sweatshirt',name:'크루넥 맨투맨',en:'CREWNECK SWEATSHIRT',fit:'긴소매 · 레귤러',type:'sweatshirt'},{id:'shirt',name:'옥스퍼드 셔츠',en:'OXFORD SHIRT',fit:'칼라 · 버튼 디테일',type:'shirt'},{id:'knit',name:'리브 니트',en:'RIBBED KNIT',fit:'긴소매 · 니트 텍스처',type:'knit'},{id:'cropped',name:'크롭 티셔츠',en:'CROPPED T-SHIRT',fit:'짧은 기장',type:'cropped'}],
 bottom:[{id:'straight',name:'스트레이트 팬츠',en:'STRAIGHT PANTS',fit:'일자 실루엣',type:'straight'},{id:'wide',name:'와이드 팬츠',en:'WIDE PANTS',fit:'넓은 밑단',type:'wide'},{id:'shorts',name:'버뮤다 쇼츠',en:'BERMUDA SHORTS',fit:'무릎 위 기장',type:'shorts'},{id:'skirt',name:'A라인 스커트',en:'A-LINE SKIRT',fit:'미디 기장',type:'skirt'}],
 shoes:[{id:'sneaker',name:'로우 스니커즈',en:'LOW SNEAKERS',fit:'데일리 베이식',type:'sneaker'},{id:'loafer',name:'클래식 로퍼',en:'CLASSIC LOAFERS',fit:'단정한 실루엣',type:'loafer'},{id:'boot',name:'첼시 부츠',en:'CHELSEA BOOTS',fit:'앵클 기장',type:'boot'}]
};
export const colors=[{hex:'#ece8dd',name:'아이보리'},{hex:'#4c5550',name:'차콜'},{hex:'#243a50',name:'딥 네이비'},{hex:'#a8ad92',name:'세이지'},{hex:'#ad8c70',name:'샌드'},{hex:'#8b4c40',name:'테라코타'},{hex:'#afbdc5',name:'파우더 블루'},{hex:'#252725',name:'블랙'}];
export const initial={top:{id:'tee',color:'#ece8dd'},bottom:{id:'wide',color:'#4c5550'},shoes:{id:'sneaker',color:'#ece8dd'},body:{height:175,width:100,shoulder:100},styling:{tuck:'out'}};
export const presets=[{name:'조용한 주말',sub:'WARM & RELAXED',top:'knit',bottom:'wide',shoes:'sneaker',colors:['#ece8dd','#ad8c70','#ece8dd']},{name:'시티 모노톤',sub:'CLEAN & MINIMAL',top:'oversized',bottom:'straight',shoes:'loafer',colors:['#4c5550','#252725','#252725']},{name:'가벼운 산책',sub:'SOFT & CASUAL',top:'shirt',bottom:'shorts',shoes:'sneaker',colors:['#afbdc5','#ece8dd','#ece8dd']}];
export const kinds={top:'상의',bottom:'하의',shoes:'신발'};
export function item(category,id){return catalog[category].find(x=>x.id===id)||catalog[category][0]}
export function icon(type,color='#d8d9d0'){
 const stroke='#00000019';let shape='';
 if(['tee','oversized','cropped','sweatshirt','knit','shirt'].includes(type)){
 const long=['sweatshirt','knit','shirt'].includes(type);const hem=type==='cropped'?66:84;const wide=type==='oversized';
 shape=`<path d="M36 17 Q50 25 64 17 L${wide?81:76} 27 L${long?93:88} ${long?77:46} L${long?78:73} ${long?81:52} L${wide?69:67} 41 L${wide?70:67} ${hem} L${wide?30:33} ${hem} L${wide?31:33} 41 L27 52 L12 46 L24 27 Z" fill="${color}" stroke="${stroke}"/><path d="M36 17 Q50 34 64 17" fill="none" stroke="${stroke}" stroke-width="3"/><path d="M34 ${hem-4} H66" stroke="${stroke}"/>`;
 if(long)shape=shape.replace('L27 52 L12 46','L22 81 L7 77');
 if(type==='shirt')shape+=`<path d="M36 17 L43 34 L50 25 L57 34 L64 17 M50 26 V82" fill="none" stroke="${stroke}" stroke-width="2"/><circle cx="53" cy="44" r="1" fill="#777"/><circle cx="53" cy="57" r="1" fill="#777"/>`;
 if(type==='knit')for(let x=38;x<66;x+=5)shape+=`<path d="M${x} 35V80" stroke="${stroke}" stroke-width=".6"/>`;
 }else if(type==='skirt'){shape=`<path d="M35 17 H65 L81 84 Q50 90 19 84 Z" fill="${color}" stroke="${stroke}"/><path d="M35 23H65 M40 26L32 83 M60 26L68 83" stroke="${stroke}" fill="none"/>`}
 else if(['straight','wide','shorts'].includes(type)){const h=type==='shorts'?65:88;const w=type==='wide'?25:31;shape=`<path d="M31 15H69 L${100-w} ${h}H55 L50 42 L45 ${h}H${w}Z" fill="${color}" stroke="${stroke}"/><path d="M32 23H68 M50 23V42 M35 25L33 36 M65 25L67 36" stroke="${stroke}" fill="none"/>`}
 else {shape=`<path d="M22 ${type==='boot'?25:43} L48 ${type==='boot'?25:38} L52 55 Q61 61 80 67 Q89 71 87 79 H15 L16 60Z" fill="${color}" stroke="${stroke}"/><path d="M15 76H87V83H15Z" fill="${type==='loafer'?'#393c35':'#e7e5dc'}" stroke="${stroke}"/>`;if(type==='sneaker')shape+='<path d="M46 55L59 56 M49 60L65 62 M53 65L72 68" stroke="#a5a89a" stroke-width="2"/>'}
 return `<svg viewBox="0 0 100 100" aria-hidden="true">${shape}</svg>`
}
export function validState(s){return !!s && (s.styling===undefined || ['in','out'].includes(s.styling?.tuck)) && ['top','bottom','shoes'].every(k=>catalog[k].some(x=>x.id===s[k]?.id)&&/^#[a-f\d]{6}$/i.test(s[k]?.color))&&s.body&&[['height',150,195],['width',85,125],['shoulder',90,115]].every(([k,min,max])=>Number.isFinite(s.body[k])&&s.body[k]>=min&&s.body[k]<=max)}
