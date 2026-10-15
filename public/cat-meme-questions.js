// Fixed local starter deck. Media stays inside the site and exported backup.
export const catMemeQuestions=[
 {id:'huh',name:'Huh 貓',prompt:'看牠一臉疑惑，請模仿牠最有名的那一聲！',answer:'Huh？',note:'主持人判定：模仿疑惑的「蛤？」並帶上揚語氣即可，不必講出貓咪名字。'},
 {id:'happy',name:'Happy Happy Happy 貓',prompt:'這隻貓快樂到跳起來！請唱出牠常見配樂的關鍵片段。',answer:'Happy happy happy！',note:'主持人判定：唱出重複的 Happy，或模仿相近旋律即可；可以一起開心跳兩下。'},
 {id:'banana',name:'哭哭香蕉貓',prompt:'這隻穿香蕉裝的小貓好委屈，牠會發出什麼聲音？',answer:'嗚嗚嗚……哇啊啊！',note:'主持人判定：模仿拉長、抽泣的哭聲即可。這是哭泣音效題，不需要背固定台詞。'},
 {id:'chipi',name:'Chipi Chipi 動畫貓',prompt:'這隻動畫小貓準備跳舞，請唱出牠常見的魔性配樂！',answer:'Chipi chipi chapa chapa',note:'主持人判定：唱出這個短句或哼出相近旋律即可。常見配樂是 Christell 的〈Dubidubidu〉。'},
 {id:'oiia',name:'OIIA 旋轉貓',prompt:'想像這隻貓開始高速旋轉！請模仿那段魔性的聲音。',answer:'OIIA OIIA！',note:'主持人判定：模仿「嗚咿咿啊」及節奏變化即可，拼音沒有固定標準。'},
 {id:'pop',name:'Popcat 啵啵貓',prompt:'這張嘴一開一合會發出什麼聲音？請連續模仿三次！',answer:'Pop！Pop！Pop！',note:'主持人判定：模仿啵、波、啵啵的開合嘴音即可，不必發出完全相同的音色。'},
 {id:'no-no',name:'No No No 拒絕貓',prompt:'這隻貓好像很不願意，請模仿牠的拒絕聲！',answer:'No no no no！',note:'主持人判定：用低沉或拉長的聲音連續說 No，即可算答對；模仿叫聲也可以。'},
 {id:'nyan',name:'Nyan 彩虹吐司貓',prompt:'這隻吐司貓飛過彩虹時，會配上什麼魔性聲音？',answer:'Nyan nyan nyan…',note:'主持人判定：唱出重複的「喵／娘」並帶旋律即可，不要求原曲歌詞。'},
 {id:'vibing',name:'點頭貓 CatJAM',prompt:'加分挑戰：這隻白貓點著頭，請哼出經典波卡版本的旋律！',answer:'哼唱〈Ievan Polkka〉的節奏',note:'主持人判定：此題指定街頭鼓手波卡版本。點頭貓也有其他配樂，因此接受哼唱節奏，不要求歌名或芬蘭語。'},
 {id:'maxwell',name:'Maxwell 黑白旋轉貓',prompt:'壓軸加分題：這隻黑白貓原地轉圈時，常見的主題旋律怎麼哼？',answer:'哼唱 Maxwell 主題旋律',note:'主持人判定：這題是常見配樂版本，不是固定貓叫；哼出近似旋律或節奏即可，可由全場一起挑戰。'},
 {id:'german',imageExt:'png',name:'希特勒貓（德語貓）',prompt:'這隻貓一開口氣勢十足！請模仿牠說話的語氣與節奏。',answer:'模仿急促、有力、像在激動說話的德語配音',note:'主持人判定：模仿急促停頓與語氣即可，不必說出真正德文或背台詞。'},
 {id:'questioning',soundPending:true,imageExt:'png',name:'質問貓',prompt:'牠好像有一大堆話要質問你！請模仿牠連續碎念的聲音。',answer:'喵喵喵、喵喵喵喵……',note:'主持人判定：重點是低沉、連續、像在碎念的聲音，不是一般單聲喵叫。可邀請下一位賓客接著扮演委屈貓。'},
 {id:'aggrieved',imageExt:'png',name:'委屈貓',prompt:'被質問之後，這隻貓會怎麼小聲回應？',answer:'喵嗚……',note:'主持人判定：小聲、拉長、有氣無力的委屈叫聲即可。與質問貓形成一問一答，不用模仿哭哭香蕉貓的嚎哭聲。'}
];
export async function createCatMemeDeck(load){
 return Promise.all(catMemeQuestions.map(async q=>({...q,id:'cat-pack-'+q.id,image:await load(q.id,q.imageExt||(q.id==='huh'?'png':q.id==='oiia'?'gif':'jpg')),sound:q.soundPending?null:await load(q.id,'mp3'),answerMedia:q.soundPending?null:q.id==='oiia'?await load('oiia','gif'):await load(q.id+'-answer','gif')})));
}
export function mergeCatMemeDeck(existing,incoming){
 const merged=existing.map(q=>({...q}));
 for(const q of incoming){const at=merged.findIndex(item=>item.id===q.id||item.name===q.name);if(at<0)merged.push(q);else merged[at]={...merged[at],prompt:merged[at].prompt||q.prompt,image:merged[at].image||q.image,sound:merged[at].sound||q.sound,answerMedia:merged[at].answerMedia||(!merged[at].sound?.type.startsWith('video/')?q.answerMedia:null)};}
 return merged;
}

// Replace only byte-identical old bundled clips; custom recordings remain untouched.
const shortSoundHashes={"german": ["369a35c6483d11418d778623ed2deb57a47a0554ce5bfe48b02b49b66671813a", "a393f6ee56d3a43f46d814290921ff6dd1cc1bfbbfdf8bde1f7555202f229579"], "huh": ["870a81ca5d4723e9308d0337054b6f67932e0377643befdf84831c46ac17a9ec", "41a145b6097deaea2c1be24973f111443bab931bda49f138df1105a1d8f7439d", "44cf9ced3d2670fa59c1afc26ea4172ec40219056eeec10cb2203537ebf859cb"], "oiia": ["92c96569d5218976495c24766bbe54f6542cc4f765ea208abb9577ed4613945e", "08b677de31611705543d646e1495014353b3e52bc78ec53e72072624a57614a7"], "happy": ["97c1a3ffd1f593b1677d665607321f4b1f1cea42ebbd842f3ad9e098c207f54a", "f8b8aa163944415f0f774c8c26fcfb8515938d87371b346568e38845d473c992"], "chipi": ["d4edb302bc3a51ded65a958e1d5c181ee99d564c5e7c881500a36980f1d6df57", "c53b25ca3acc07ed34eb2d0ca74ed4afcaf7921ad9e1409e33c8f9e84f6bbcab"], "no-no": ["31e35c288ca2457b3f0fa188282b9892435d259f61c8ce6dc8644f8790e59343", "21c647463f72f5d0d971475f3acdd6b25e9f986dbcb7927449d0a4ef26824537"], "vibing": ["81d1e104b265635df97bccf40646e791ce55c039fd781d972ef05078920c5672", "2053e6ac8d7913d27d9adae65335978386c393f8970b5a8b910ae4eb6dbeb2db"], "nyan": ["8a7535c0022e3e284e6f7e9c3e418eefbc5d9d55e25e2c14afc1bced1ef60b4e", "06c2cd02d48824d3e1d1620ec7095dd88fa377eaf083b6af0bbac20479f968cb"], "maxwell": ["1776b5b0d388e909eec746cb4d945d5e2b1a3a82fd1f39f55938d629d10f05d5", "893fa937c1173c20d8c4bf5c27ee1b9a632bc75369e1b0a52cb4d7d54253b5bb"], "aggrieved": ["bd26cc2d9673e881d025390bc1397d5687a9cda45496575d750eed5fc57ef8a1", "4842ac6cb6bb1d1c4ba836a764aed2d4c11cd9d6d990db257d9fa5f860e050ce"], "pop": ["7e3c6add327218fa289d05d62613dc0c5c8af7693b261daef634e00adf155048"], "banana": ["0d2f760c333a15b370e7dd47189d51616453eba802ea06283f73db839259e8d3", "263c77cc200bb8ea82d26c5602627a145f5f55ee6fe8a0b92d5875faa0ec9ff5"]};
export async function upgradeCatMemeSounds(existing,incoming){
 const byId=new Map(incoming.map(q=>[q.id,q]));let changed=false;
 const hashBlob=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 const result=await Promise.all(existing.map(async original=>{
  const fresh=byId.get(original.id),key=original.id.replace(/^cat-pack-/, '');
  if(!fresh||original.sound?.type.startsWith('video/'))return original;
  let q=original;
  const hash=q.sound?await hashBlob(q.sound):null;
  const newHash=fresh.sound?await hashBlob(fresh.sound):null;
  const hashes=Array.isArray(shortSoundHashes[key])?shortSoundHashes[key]:[shortSoundHashes[key]];
  const bundled=!q.sound||hash===newHash||hashes.includes(hash);
  if(!bundled)return original;
  if(fresh.answerMedia&&!q.answerMedia)q={...q,answerMedia:fresh.answerMedia};
  if(fresh.sound&&q.sound&&hash!==newHash)q={...q,sound:fresh.sound};
  if(q!==original)changed=true;
  return q;
 }));
 return changed?result:existing;
}
