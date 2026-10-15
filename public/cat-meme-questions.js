// Fixed local starter deck. Media stays inside the site and exported backup.
export const catMemeQuestions=[
 {id:'huh',imageFile:'huh-final',imageExt:'jpg',answerFile:'huh-answer-final',name:'Huh 貓',prompt:'看牠一臉疑惑，請模仿牠最有名的那一聲！',answer:'Huh？',note:'主持人判定：模仿疑惑的「蛤？」並帶上揚語氣即可，不必講出貓咪名字。'},
 {id:'happy',imageFile:'happy-final',imageExt:'jpg',answerFile:'happy-answer-final',name:'Happy Happy Happy 貓',prompt:'這隻貓快樂到跳起來！請唱出牠常見配樂的關鍵片段。',answer:'Happy happy happy！',note:'主持人判定：唱出重複的 Happy，或模仿相近旋律即可；可以一起開心跳兩下。'},
 {id:'banana',name:'哭哭香蕉貓',prompt:'這隻穿香蕉裝的小貓好委屈，牠會發出什麼聲音？',answer:'嗚嗚嗚……哇啊啊！',note:'主持人判定：模仿拉長、抽泣的哭聲即可。這是哭泣音效題，不需要背固定台詞。'},
 {id:'oiia',imageFile:'oiia-final',imageExt:'jpg',answerFile:'oiia-answer-final',name:'OIIA 旋轉貓',prompt:'想像這隻貓開始高速旋轉！請模仿那段魔性的聲音。',answer:'OIIA OIIA！',note:'主持人判定：模仿「嗚咿咿啊」及節奏變化即可，拼音沒有固定標準。'},
 {id:'pop',answerFile:'pop-answer-final',name:'Popcat 啵啵貓',prompt:'這張嘴一開一合會發出什麼聲音？請連續模仿三次！',answer:'Pop！Pop！Pop！',note:'主持人判定：模仿啵、波、啵啵的開合嘴音即可，不必發出完全相同的音色。'},
 {id:'no-no',answerFile:'no-no-answer-final',name:'No No No 拒絕貓',prompt:'這隻貓好像很不願意，請模仿牠的拒絕聲！',answer:'No no no no！',note:'主持人判定：用低沉或拉長的聲音連續說 No，即可算答對；模仿叫聲也可以。'},
 {id:'german',imageExt:'png',answerFile:'german-answer-final',name:'希特勒貓（德語貓）',prompt:'這隻貓一開口氣勢十足！請模仿牠說話的語氣與節奏。',answer:'模仿急促、有力、像在激動說話的德語配音',note:'主持人判定：模仿急促停頓與語氣即可，不必說出真正德文或背台詞。'},
 {id:'questioning',imageExt:'png',answerFile:'questioning-answer-final',name:'質問貓',prompt:'牠好像有一大堆話要質問你！請模仿牠連續碎念的聲音。',answer:'喵喵喵、喵喵喵喵……',note:'主持人判定：重點是低沉、連續、像在碎念的聲音，不是一般單聲喵叫。可邀請下一位賓客接著扮演委屈貓。'},
 {id:'aggrieved',imageExt:'png',answerFile:'aggrieved-answer-final',name:'委屈貓',prompt:'被質問之後，這隻貓會怎麼小聲回應？',answer:'喵嗚……',note:'主持人判定：小聲、拉長、有氣無力的委屈叫聲即可。與質問貓形成一問一答，不用模仿哭哭香蕉貓的嚎哭聲。'}
];
export async function createCatMemeDeck(load){
 return Promise.all(catMemeQuestions.map(async q=>({...q,id:'cat-pack-'+q.id,image:await load(q.imageFile||q.id,q.imageExt||'jpg'),sound:null,answerMedia:await load(q.answerFile||q.id+'-answer','mp4')})));
}
export function applyFinalCatMemeDeck(existing,incoming){
 const byId=new Map(existing.map(q=>[q.id,q]));
 const replaceImage=new Set(['huh','happy','oiia']);
 const replaceVideo=new Set(['huh','happy','oiia','pop','no-no','german','questioning','aggrieved']);
 return incoming.map(fresh=>{
  const old=byId.get(fresh.id),key=fresh.id.replace(/^cat-pack-/, '');
  return {...fresh,image:replaceImage.has(key)?fresh.image:old?.image||fresh.image,answerMedia:replaceVideo.has(key)?fresh.answerMedia:old?.answerMedia||fresh.answerMedia,sound:null};
 });
}
export function mergeCatMemeDeck(existing,incoming){
 const merged=existing.map(q=>({...q}));
 for(const q of incoming){const at=merged.findIndex(item=>item.id===q.id||item.name===q.name);if(at<0)merged.push(q);else merged[at]={...merged[at],prompt:merged[at].prompt||q.prompt,image:merged[at].image||q.image,sound:merged[at].sound||null,answerMedia:merged[at].answerMedia||(!merged[at].sound?q.answerMedia:null)};}
 return merged;
}

// Replace only byte-identical old bundled clips; custom recordings remain untouched.
const shortSoundHashes={"german": ["369a35c6483d11418d778623ed2deb57a47a0554ce5bfe48b02b49b66671813a", "a393f6ee56d3a43f46d814290921ff6dd1cc1bfbbfdf8bde1f7555202f229579"], "huh": ["870a81ca5d4723e9308d0337054b6f67932e0377643befdf84831c46ac17a9ec", "41a145b6097deaea2c1be24973f111443bab931bda49f138df1105a1d8f7439d", "44cf9ced3d2670fa59c1afc26ea4172ec40219056eeec10cb2203537ebf859cb"], "oiia": ["92c96569d5218976495c24766bbe54f6542cc4f765ea208abb9577ed4613945e", "08b677de31611705543d646e1495014353b3e52bc78ec53e72072624a57614a7"], "happy": ["97c1a3ffd1f593b1677d665607321f4b1f1cea42ebbd842f3ad9e098c207f54a", "f8b8aa163944415f0f774c8c26fcfb8515938d87371b346568e38845d473c992"], "chipi": ["d4edb302bc3a51ded65a958e1d5c181ee99d564c5e7c881500a36980f1d6df57", "c53b25ca3acc07ed34eb2d0ca74ed4afcaf7921ad9e1409e33c8f9e84f6bbcab"], "no-no": ["31e35c288ca2457b3f0fa188282b9892435d259f61c8ce6dc8644f8790e59343", "21c647463f72f5d0d971475f3acdd6b25e9f986dbcb7927449d0a4ef26824537"], "vibing": ["81d1e104b265635df97bccf40646e791ce55c039fd781d972ef05078920c5672", "2053e6ac8d7913d27d9adae65335978386c393f8970b5a8b910ae4eb6dbeb2db"], "nyan": ["8a7535c0022e3e284e6f7e9c3e418eefbc5d9d55e25e2c14afc1bced1ef60b4e", "06c2cd02d48824d3e1d1620ec7095dd88fa377eaf083b6af0bbac20479f968cb"], "maxwell": ["1776b5b0d388e909eec746cb4d945d5e2b1a3a82fd1f39f55938d629d10f05d5", "893fa937c1173c20d8c4bf5c27ee1b9a632bc75369e1b0a52cb4d7d54253b5bb"], "aggrieved": ["bd26cc2d9673e881d025390bc1397d5687a9cda45496575d750eed5fc57ef8a1", "4842ac6cb6bb1d1c4ba836a764aed2d4c11cd9d6d990db257d9fa5f860e050ce"], "pop": ["7e3c6add327218fa289d05d62613dc0c5c8af7693b261daef634e00adf155048"], "banana": ["0d2f760c333a15b370e7dd47189d51616453eba802ea06283f73db839259e8d3", "263c77cc200bb8ea82d26c5602627a145f5f55ee6fe8a0b92d5875faa0ec9ff5"]};
const bundledGifHashes={"huh":"f1e58dd936374611daa64055950b5c57d23af8c7aa65636b1f04349b5fbec004","happy":"6c829b67f07e21d3cbb496092bd1a1075146fe447df5895e0cc72089a4d6c798","banana":"c1a2605b6d888716094be968880762d9cd5ec66a67b255da582374e14199f3ea","chipi":"1b56be02e41aa3020882027f5138af1ce0ede8e0d08cf68f397b8214f5586eec","oiia":"801fba74d2bc5a8f8b55a2eb6ac6a5b2d8a1df1eda1d13e9869b073ae73c58e0","pop":"d5b3b55b6a75b454c8e2f1cfaf5956e1f1c3a2a8573f3b6ddf5c45449df876a2","no-no":"1464cd32015b2fdce330c063e5d9f6f2d15d0d4fc53851c653a3f3dcd06560fd","nyan":"09cd5eb7654ed6d9078b9e1787c6f41673be21559382b8d3977a1db96a917fc1","vibing":"7ed49a3d503c164fe8b845fcd942d1c951fc4e80bcca434e4a8a2662674a2325","maxwell":"b1a93c04ed2cde39e23326cbe775bba7c6bae8cf0557bf270c9a940fe59491ee","german":"6abcdf9b7f65e1b698679c7f31ac2f3c3a58438a4b10a5af1c4df7af0f3fd996","aggrieved":"4901d5150820cd88cb6876a5f1e12ce12b6b6e8526af22a7b9fc65f0ae30194a"};
const bundledCurrentSoundHashes={"huh":"761b76d17c0d66e6be45f524ccfc46cb32af4224e271ddd42944a575a186091e","happy":"83bfa39b105983f5dde8cb725960265f559ee41091f6156e9896808460a42d82","banana":"a664617eeb37d02e604a031f41c6e032c4be3e63f0ab41a8c8cdce37b6499f0b","chipi":"b98ac51fd07f07b2da4ceb9ffe41dcaa052b276cbf5664936a704034e00f8510","oiia":"99dc788c741457500146155afc7419b23695853727ee645a0b30ebeab90343ba","pop":"4932a76a441f46a5af5a5681d496e3be555aa7613e8d9d798078ea8d13ab5e4a","no-no":"02957c5e8d6051481112e2ad59e7517e46ffc34db656895bffecd863f45b000d","nyan":"d579b4bfbabb340f98bfc2f565f76e1e8e77d8e5beb8a783af20496623d31fe0","vibing":"2fa67928190e5e01fba29981796d43130b5e6df7f226b3c783ce3fce838f4cc8","maxwell":"95057c364a268c3d99e556bce725b4ea3eb4d669ba4062556f419294cac8c49d","german":"4f8d46ca8124cabcf7fecd62eb625aff8a94c0961ee5262a52535a5779de6dd7","aggrieved":"1ff57d7210f51ea80fd285df22eb9ea5e5b876f94e6dd4caec268ab4b73bfa84"};
export async function upgradeCatMemeSounds(existing,incoming){
 const byId=new Map(incoming.map(q=>[q.id,q]));let changed=false;
 const hashBlob=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 const result=await Promise.all(existing.map(async original=>{
  const fresh=byId.get(original.id),key=original.id.replace(/^cat-pack-/, '');
  if(!fresh?.answerMedia||original.sound?.type.startsWith('video/')||original.answerMedia?.type.startsWith('video/'))return original;
  const soundHash=original.sound?await hashBlob(original.sound):null;
  const visualHash=original.answerMedia?await hashBlob(original.answerMedia):null;
  const hashes=Array.isArray(shortSoundHashes[key])?shortSoundHashes[key]:[shortSoundHashes[key]];
  if((original.sound&&!hashes.includes(soundHash)&&soundHash!==bundledCurrentSoundHashes[key])||(original.answerMedia&&visualHash!==bundledGifHashes[key]))return original;
  changed=true;
  return {...original,sound:null,answerMedia:fresh.answerMedia};
 }));
 return changed?result:existing;
}
