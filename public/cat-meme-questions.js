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
 return Promise.all(catMemeQuestions.map(async q=>({...q,id:'cat-pack-'+q.id,image:await load(q.id,q.imageExt||(q.id==='huh'?'png':q.id==='oiia'?'gif':'jpg')),sound:q.soundPending?null:await load(q.id,'mp3')})));
}
export function mergeCatMemeDeck(existing,incoming){
 const merged=existing.map(q=>({...q}));
 for(const q of incoming){const at=merged.findIndex(item=>item.id===q.id||item.name===q.name);if(at<0)merged.push(q);else merged[at]={...merged[at],prompt:merged[at].prompt||q.prompt,image:merged[at].image||q.image,sound:merged[at].sound||q.sound};}
 return merged;
}
