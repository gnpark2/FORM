export async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const json = (value, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'private, no-store', Vary: 'Cookie'}});
export function fail(status, message) { throw {status, message}; }
export function sameOrigin(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, '같은 사이트에서 다시 요청해 주세요.');
}
function redirect(location) {
  return new Response(null, {status: 303, headers: {Location: location, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer'}});
}
export async function getUser(_request, env) {
  if (!env.userPromise) env.userPromise = env.supabase.auth.getUser().then(({data, error}) => {
    if (error) {
      if (error.status >= 500 || error.name === 'AuthRetryableFetchError') fail(503, '로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
      return null;
    }
    const user = data?.user;
    return user ? {id: user.id, name: String(user.user_metadata?.full_name || user.user_metadata?.name || 'FORM 회원').slice(0,80), provider: 'google'} : null;
  });
  return env.userPromise;
}
export function appOrigin(request, env) {
  let origin;
  try { origin = new URL(env.APP_ORIGIN); } catch { fail(503, 'APP_ORIGIN 설정을 확인해 주세요.'); }
  if (origin.origin !== new URL(request.url).origin || (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname))) fail(403, '설정된 서비스 주소에서 로그인해 주세요.');
  return origin.origin;
}
export async function handleAuth(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (!path.startsWith('/api/auth/')) return null;
  if (path === '/api/auth/me' && request.method === 'GET') {
    return json({user: await getUser(request, env), loginUrl: '/api/auth/google', loginLabel: 'Google로 가입 / 로그인', logoutUrl: null});
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    sameOrigin(request);
    const {error} = await env.supabase.auth.signOut({scope: 'local'});
    if (error) fail(503, '로그아웃을 완료하지 못했어요. 다시 시도해 주세요.');
    return json({});
  }
  if (request.method !== 'GET') fail(405, '지원하지 않는 요청입니다.');
  const origin = appOrigin(request, env);
  if (path === '/api/auth/google') {
    if (request.headers.get('sec-fetch-site') === 'cross-site') fail(403, '사이트의 로그인 버튼으로 시작해 주세요.');
    const {data, error} = await env.supabase.auth.signInWithOAuth({provider: 'google', options: {
      redirectTo: origin + '/api/auth/callback', skipBrowserRedirect: true
    }});
    if (error || !data?.url) fail(503, 'Google 로그인 설정을 확인해 주세요.');
    return redirect(data.url);
  }
  if (path === '/api/auth/callback') {
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.has('error')) return redirect('/?auth_error=1');
    const {error} = await env.supabase.auth.exchangeCodeForSession(code);
    return redirect(error ? '/?auth_error=1' : '/');
  }
  fail(404, '지원하지 않는 로그인 경로입니다.');
}
