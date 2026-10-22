import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,ids} from './postgres-helper.js';
import {handleApi} from '../server/recommend.js';
import {createRuntime} from '../server/runtime.js';

const baseEnv={APP_ORIGIN:'https://form.test',SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-publishable-key'};
const request=(path,headers={})=>new Request('https://form.test/api/auth/'+path,{headers});
const cookies=response=>response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
async function wardrobe(call,user='alice') {
  const {readFile}=await import('node:fs/promises');
  const image='data:image/png;base64,'+(await readFile('public/samples/tee.png')).toString('base64');
  for (const [id,category] of [['t','top'],['b','bottom'],['s','shoes']]) {
    assert.equal((await call('garments/'+id,'PUT',{name:id,category,features:'아이보리 캐주얼',image},user)).status,201);
  }
}
test('Google OAuth uses SDK PKCE and HttpOnly cookies; callback is fixed and failures return to the app', async t=>{
  const startRequest=request('google'); const context=createRuntime(startRequest,baseEnv);
  const response=context.finish(await handleApi(startRequest,context));
  assert.equal(response.status,303);
  const target=new URL(response.headers.get('location'));
  assert.equal(target.origin,baseEnv.SUPABASE_URL);
  assert.equal(target.searchParams.get('provider'),'google');
  assert.equal(target.searchParams.get('code_challenge_method'),'s256');
  assert.equal(target.searchParams.get('redirect_to'),'https://form.test/api/auth/callback');
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  assert.match(response.headers.get('set-cookie'),/Secure/);
  assert.match(response.headers.get('set-cookie'),/SameSite=Lax/i);
  t.mock.method(globalThis,'fetch',async (_url,opts)=>{
    const body=JSON.parse(opts.body);assert.equal(body.auth_code,'test-code');assert.ok(body.code_verifier.length>20);
    return Response.json({error:'invalid_grant',error_description:'expired'},{status:400});
  });
  const callback=request('callback?code=test-code&next=https://evil.test',{cookie:cookies(response)});
  const cb=createRuntime(callback,baseEnv);const failed=cb.finish(await handleApi(callback,cb));
  assert.equal(failed.headers.get('location'),'/?auth_error=1');
  assert.equal(failed.headers.get('cache-control'),'private, no-store');
  const wrong=request('google',{'sec-fetch-site':'cross-site'});
  assert.equal((await handleApi(wrong,createRuntime(wrong,baseEnv))).status,403);
});
test('identity headers cannot authenticate; logout checks origin and provider failure', async()=>{
  const req=new Request('https://form.test/api/library',{headers:{'oai-authenticated-user-id':'forged'}});
  const env={supabase:{auth:{getUser:async()=>({data:{user:null},error:null}),signOut:async()=>({error:new Error('offline')})}}};
  assert.equal((await handleApi(req,env)).status,401);
  for(const [origin,status] of [['https://evil.test',403],['https://form.test',503]]) {
    assert.equal((await handleApi(new Request('https://form.test/api/auth/logout',{method:'POST',headers:{origin}}),env)).status,status);
  }
});
test('recommendations require owned top/bottom, preserve anchors and label fallback',async t=>{
  const {call}=await setup(t);await wardrobe(call,'bob');
  assert.equal((await call('recommend','POST',{prompt:'데이트'})).status,400);
  await wardrobe(call);
  assert.equal((await call('recommend','POST',{prompt:'x',anchorId:'foreign'})).status,400);
  assert.equal((await call('recommend','POST',{prompt:'x'},'alice',{origin:'https://evil.test'})).status,403);
  const result=await (await call('recommend','POST',{prompt:'캐주얼',anchorId:'s'})).json();
  assert.equal(result.source,'rules');assert.ok(result.looks.every(l=>l.ids.includes('s')));
});
test('AI cache, changed wardrobe, per-user/global quotas and invalid outputs',async t=>{
  const {call,sql,env}=await setup(t);await wardrobe(call);
  Object.assign(env,{CF_AI_ACCOUNT_ID:'test',CF_AI_TOKEN:'test'});
  let calls=0, malicious=false;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({success:true,result:{response:JSON.stringify({looks:[{ids:malicious?['foreign','b']:['t','b'],title:'코디',reason:'추천'}]})}});});
  assert.equal((await (await call('recommend','POST',{prompt:'캐주얼'})).json()).source,'ai');
  assert.equal((await (await call('recommend','POST',{prompt:'캐주얼'})).json()).cached,true);assert.equal(calls,1);
  await call('garments/t','PATCH',{features:'변경됨'});
  await call('recommend','POST',{prompt:'캐주얼'});assert.equal(calls,2);
  malicious=true;
  const invalid=await (await call('recommend','POST',{prompt:'세번째'})).json();assert.equal(invalid.source,'rules');
  assert.ok(invalid.looks.every(l=>!l.ids.includes('foreign')));
  await call('recommend','POST',{prompt:'네번째'});await call('recommend','POST',{prompt:'다섯번째'});
  assert.match((await (await call('recommend','POST',{prompt:'여섯번째'})).json()).reason,/한도/);assert.equal(calls,5);
  for(let i=0;i<45;i++) await sql.query("INSERT INTO ai_requests VALUES ($1,(now() AT TIME ZONE 'Asia/Seoul')::date,$2,null)",[ids.bob,String(i).padStart(64,'0')]);
  await wardrobe(call,'bob');
  assert.match((await (await call('recommend','POST',{prompt:'처음'},'bob')).json()).reason,/한도/);assert.equal(calls,5);
});
test('concurrent identical recommendations consume one reservation',async t=>{
  const {call,env,sql}=await setup(t);await wardrobe(call);Object.assign(env,{CF_AI_ACCOUNT_ID:'test',CF_AI_TOKEN:'test'});
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({success:true,result:{response:'{"looks":[{"ids":["t","b"],"title":"a","reason":"b"}]}'}});});
  await Promise.all(Array.from({length:8},()=>call('recommend','POST',{prompt:'동일 요청'})));
  assert.equal(calls,1);assert.equal((await sql.query('SELECT count(*)::int AS n FROM ai_requests')).rows[0].n,1);
});

test('successful OAuth callback persists SDK session and the next request revalidates identity',async t=>{
  const start=request('google'), runtime=createRuntime(start,baseEnv);
  const login=runtime.finish(await handleApi(start,runtime));
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:ids.alice,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})+'.test-signature';
  const user={id:ids.alice,aud:'authenticated',role:'authenticated',email:'test@example.invalid',app_metadata:{provider:'google'},user_metadata:{name:'테스트 회원'},created_at:new Date().toISOString()};
  let userChecks=0;
  t.mock.method(globalThis,'fetch',async url=>{
    if(String(url).includes('/token')) return Response.json({access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
    if(String(url).endsWith('/user')) {userChecks++;return Response.json(user);}
    throw new Error('Unexpected test request');
  });
  const callback=request('callback?code=valid',{cookie:cookies(login)}), cb=createRuntime(callback,baseEnv);
  const loggedIn=cb.finish(await handleApi(callback,cb));assert.equal(loggedIn.headers.get('location'),'/');
  assert.match(loggedIn.headers.get('set-cookie'),/HttpOnly/);
  const me=request('me',{cookie:cookies(loggedIn)}), session=createRuntime(me,baseEnv);
  const account=await (await handleApi(me,session)).json();
  assert.equal(account.user.id,ids.alice);assert.equal(account.user.name,'테스트 회원');assert.equal(userChecks,1);
});
