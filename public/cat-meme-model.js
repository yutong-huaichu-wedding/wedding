export const IMAGE_LIMIT=8*1024*1024;
export const SOUND_LIMIT=12*1024*1024;
export const DECK_LIMIT=40*1024*1024;
export const imageTypes=['image/jpeg','image/png','image/webp','image/gif'];
export const soundTypes=['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/ogg','audio/webm','video/mp4','video/webm'];
export const answerTypes=['image/gif','image/webp','video/mp4','video/webm'];
export function validateMedia(blob,kind){
  if(!blob)return;
  if(kind==='answer'){
    if(!(blob instanceof Blob)||!answerTypes.includes(blob.type))throw Error('答案請選擇 GIF、WebP 動圖或 MP4、WebM 影片。');
    if(!blob.size||blob.size>SOUND_LIMIT)throw Error('答案影片或動圖需小於 12MB。');
    return;
  }
  if(!(blob instanceof Blob)||!(kind==='image'?imageTypes:soundTypes).includes(blob.type))throw Error(kind==='image'?'請選擇 JPG、PNG、WebP 或 GIF 圖片。':'請選擇 MP3、M4A、WAV、OGG、MP4 或 WebM 聲音／短片。');
  if(!blob.size||blob.size>(kind==='image'?IMAGE_LIMIT:SOUND_LIMIT))throw Error(kind==='image'?'圖片需小於 8MB。':'聲音或短片需小於 12MB。');
}
export function validateDeck(deck){
  if(!Array.isArray(deck)||deck.length>40)throw Error('最多可準備 40 道題目。');
  const ids=new Set();let bytes=0;
  for(const q of deck){
    if(!q||typeof q.id!=='string'||!q.id||q.id.length>100||ids.has(q.id)||typeof q.name!=='string'||!q.name.trim()||q.name.length>80||typeof q.answer!=='string'||!q.answer.trim()||q.answer.length>160||typeof q.note!=='string'||q.note.length>300)throw Error('題庫格式不完整，請重新選擇備份。');
    if(q.prompt!==undefined&&(typeof q.prompt!=='string'||q.prompt.length>160))throw Error('題目文字格式不正確。');
    ids.add(q.id);validateMedia(q.image,'image');validateMedia(q.sound,'sound');validateMedia(q.answerMedia,'answer');bytes+=(q.image?.size||0)+(q.sound?.size||0)+(q.answerMedia?.size||0);
  }
  if(bytes>DECK_LIMIT)throw Error('整份題庫的照片、動圖、影片與音效合計需小於 40MB，請縮短影片或音效。');
  return deck;
}
export function ready(q){return !!q?.image&&(!!q?.answerMedia?.type.startsWith('video/')||(!q?.answerMedia&&!!q?.sound?.type.startsWith('video/')))}
export function projectionState(q,index,total,revealed,src){
  return {index,total,revealed,prompt:q?.prompt||'這隻貓，怎麼叫？',ready:ready(q),image:q?.image?src(q.image):'',...(revealed&&q?{answer:q.answer,name:q.name,note:q.note,sound:q.sound?src(q.sound):'',soundType:q.sound?.type||'',answerMedia:q.answerMedia?src(q.answerMedia):'',answerMediaType:q.answerMedia?.type||''}:{})};
}
export async function packDeck(deck,encode){
  validateDeck(deck);return {format:'wedding-cat-memes',version:1,questions:await Promise.all(deck.map(async q=>({...q,image:q.image?{type:q.image.type,data:await encode(q.image)}:null,sound:q.sound?{type:q.sound.type,data:await encode(q.sound)}:null,answerMedia:q.answerMedia?{type:q.answerMedia.type,data:await encode(q.answerMedia)}:null})))};
}
export function unpackDeck(value,decode){
  if(value?.format!=='wedding-cat-memes'||value.version!==1||!Array.isArray(value.questions)||value.questions.length>40)throw Error('這不是小貓問答的題庫備份。');
  const decodeMedia=m=>{if(m===null||m===undefined)return null;if(typeof m.type!=='string'||typeof m.data!=='string'||m.data.length>17*1024*1024)throw Error('備份中的媒體格式不正確。');return decode(m.data,m.type)};
  return validateDeck(value.questions.map(q=>({id:q.id,name:q.name,prompt:q.prompt||'這隻貓，怎麼叫？',answer:q.answer,note:q.note,image:decodeMedia(q.image),sound:decodeMedia(q.sound),answerMedia:decodeMedia(q.answerMedia)})));
}

export function moveCatQuestion(deck,id,direction){
  if(direction!==-1&&direction!==1)return deck;
  const from=deck.findIndex(q=>q.id===id),to=from+direction;
  if(from<0||to<0||to>=deck.length)return deck;
  const next=[...deck];[next[from],next[to]]=[next[to],next[from]];return next;
}
