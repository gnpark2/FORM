import {createRuntime} from '../../../server/runtime.js';
import {handleApi} from '../../../server/recommend.js';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const handler = async (request: Request) => {
  try {
    const context = createRuntime(request);
    return context.finish(await handleApi(request, context));
  } catch {
    return Response.json({error: 'Supabase 서버 설정을 확인해 주세요.'}, {
      status: 503, headers: {'Cache-Control': 'private, no-store', Vary: 'Cookie'}
    });
  }
};
export {handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE};
