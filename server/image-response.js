import {createHash} from 'node:crypto';
// Object keys are immutable. Validate ownership before calling this function.
export async function privateImage(request,bucket,key,mime){
  const etag='"'+createHash('sha256').update(key+'\n'+mime).digest('hex')+'"';
  const headers={'Content-Type':mime,'Cache-Control':'private, no-cache','Vary':'Cookie','ETag':etag,'X-Content-Type-Options':'nosniff'};
  const candidates=(request.headers.get('if-none-match')||'').split(',').map(s=>s.trim().replace(/^W\//,''));
  if(candidates.includes(etag)||candidates.includes('*'))return new Response(null,{status:304,headers});
  const object=await bucket.get(key);
  if(!object)throw {status:404,message:'사진이 없습니다.'};
  return new Response(object.body,{headers});
}
