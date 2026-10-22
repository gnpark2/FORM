export async function api(path,options={}){
  let response;
  try{response=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(20000)});}
  catch{throw new Error('서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');}
  const body=await response.json().catch(()=>({error:'서버 응답을 읽지 못했어요.'}));
  if(!response.ok)throw Object.assign(new Error(body.error||'요청을 완료하지 못했어요.'),{status:response.status,...body});
  return body;
}
export class CloudDraft {
  constructor(notify){this.notify=notify;this.revision=0;this.pending=null;this.sending=false;this.conflict=null;this.timer=null;this.enabled=false;}
  queue(state){if(!this.enabled)return;this.pending=structuredClone(state);this.notify(this.conflict?'conflict':'pending');clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),800);}
  async flush(){
    clearTimeout(this.timer);if(this.sending||!this.pending||this.conflict||!this.enabled)return;
    this.sending=true;const next=this.pending;this.pending=null;this.notify('saving');
    try{const data=await api('/api/draft',{method:'PUT',body:JSON.stringify({state:next,revision:this.revision})});this.revision=data.revision;this.notify(this.pending?'pending':'saved');}
    catch(error){this.pending??=next;if(error.status===409){this.conflict=error;this.notify('conflict',error.message);}else this.notify('error',error.message);this.sending=false;return;}
    this.sending=false;if(this.pending)return this.flush();
  }
  useServer(){const state=this.conflict?.draft;this.revision=this.conflict?.revision??this.revision;this.pending=null;this.conflict=null;this.notify('saved');return state;}
  keepLocal(){this.revision=this.conflict?.revision??this.revision;this.conflict=null;return this.flush();}
  get dirty(){return !!this.pending||this.sending;}
}
