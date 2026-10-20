// Cross-device transport. Only durable media URLs leave the controlling browser.
import {projectionState} from './cat-meme-model.js';
export function createCloudProjection({session,screen=false,follow=false,onState=()=>{},onStatus=()=>{},fetchImpl=fetch,clock=Date.now,pollMs=900}) {
  const endpoint=screen&&follow?'/api/cat-live?follow=1':'/api/cat-live?session='+encodeURIComponent(session);
  const uploaded=new WeakMap();
  let enabled=screen,closed=false,timer=null,pending=null,sending=false,revision=null,seen=false,lastSerial=null,job=0,latest=0,requestedPlay=-1,sentPlay=-1;
  async function json(url,options={}) {
    const response=await fetchImpl(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(120000),...options});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'連線中斷');
    return data;
  }
  async function media(blob) {
    if(!blob)return '';
    if(!uploaded.has(blob)) {
      const promise=json('/api/cat-media',{method:'POST',headers:{'content-type':blob.type},body:blob})
        .then(r=>r.url).catch(error=>{uploaded.delete(blob);throw error});
      uploaded.set(blob,promise);
    }
    return uploaded.get(blob);
  }
  async function pump() {
    if(sending||!enabled||closed||!pending)return;
    sending=true;
    try {
      while(pending&&enabled&&!closed) {
        const work=pending;pending=null;
        onStatus({kind:'sending',message:'正在準備投影照片與影片…'});
        const q=work.q;
        const image=await media(q?.image);
        const answerBlob=q?.answerMedia?.type.startsWith('video/')?q.answerMedia:!q?.answerMedia&&q?.sound?.type.startsWith('video/')?q.sound:null;
        const answer=await media(answerBlob);
        if(work.id!==latest)continue; // A newer selection supersedes a slow upload.
        const source=blob=>blob===q?.image?image:blob===answerBlob?answer:'';
        const state={...projectionState(q,work.index,work.total,work.revealed,source),key:q?.id||'empty',serial:work.serial,volume:work.volume};
        // Legacy audio is not used by this video-only game.
        if(!state.soundType?.startsWith('video/')){state.sound='';state.soundType=''}
        await json(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({state,autoplay:state.revealed&&state.serial===requestedPlay&&sentPlay!==requestedPlay})});
        if(state.revealed&&state.serial===requestedPlay)sentPlay=requestedPlay;
        onStatus({kind:'sent',message:'✓ 手機指令已同步，等待投影連線。'});
      }
    } catch(error) {
      // Retry the most recent desired state, never an obsolete question.
      if(!pending&&currentWork)pending=currentWork;
      onStatus({kind:'error',message:error.message+'；將自動重試。'});
    } finally {sending=false}
  }
  let currentWork=null;
  function publish(work) {
    if(!enabled||screen||closed)return;
    if(work.autoplay)requestedPlay=work.serial;
    currentWork={...work,id:++job};latest=job;pending=currentWork;void pump();
  }
  async function poll() {
    if(!enabled||closed)return;
    try {
      const data=await json(endpoint+(screen?'&screen=1':''),{signal:AbortSignal.timeout(5000)});
      if(screen&&data.state&&data.revision!==revision) {
        const autoplay=seen&&data.state.serial!==lastSerial&&data.playAt>(data.serverNow??clock())-15000;
        lastSerial=data.state.serial;
        onState(data.state,autoplay);revision=data.revision;seen=true;
      }
      if(!sending&&!pending)onStatus({kind:'online',active:data.active!==false,connected:(data.serverNow??clock())-(data.screenAt||0)<12000,
        message:screen?(data.state?'✓ 已連線，跟隨手機主持人操作。':'等待手機主持人出題…'):
          (data.serverNow??clock())-(data.screenAt||0)<12000?'✓ 電腦投影已連線；聲音由投影電腦播放。':'✓ 雲端同步已啟用，請在電腦開啟投影連結。'});
      if(!screen)void pump();
    } catch(error){onStatus({kind:'error',message:'連線中斷，正在自動重連：'+error.message})}
    finally{if(!closed&&enabled)timer=setTimeout(poll,pollMs)}
  }
  return {
    async enable(){
      const result=await json('/api/state');
      if(!result.admin)throw Error('請先在這支手機登入婚禮主持人控制台，再回來啟用同步。');
      if(!enabled){enabled=true;void poll()}
    },
    start(){if(screen)void poll()},
    publish,
    get enabled(){return enabled},
    close(){closed=true;clearTimeout(timer)}
  };
}
