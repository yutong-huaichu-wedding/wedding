/* Original wedding quiz: 16 tiles, five sets and one pair; no flowers or score minimum. */
(function(root){
  const fixed=[['z5','z5','z5'],['z6','z6','z6'],['z7','z7','z7'],['p1','p2','p3']];
  const questions=[
    {title:'暖身・還缺哪一張？',level:'★☆☆☆☆',hand:['m1','m2','m3','z1'],fixed:fixed,answers:['z1'],explanation:'一二三萬已是一組順子，東風需要再一張配成將眼，所以只聽東風。'},
    {title:'初階・補上中間',level:'★★☆☆☆',hand:['m2','m4','z1','z1'],fixed:fixed,answers:['m3'],explanation:'東風一對當將眼，二萬與四萬之間缺三萬；補進後成為二三四萬。'},
    {title:'進階・兩邊都可以',level:'★★★☆☆',hand:['m2','m3','z1','z1'],fixed:fixed,answers:['m1','m4'],explanation:'東風一對當將眼，二三萬可接一萬成一二三，也可接四萬成二三四。請答出兩種。'},
    {title:'挑戰・兩對怎麼拆？',level:'★★★★☆',hand:['m2','m2','m3','m3'],fixed:fixed,answers:['m2','m3'],explanation:'進二萬可組二二二＋三三；進三萬可組二二＋三三三。一組刻子加一對將眼，兩種都能胡。'},
    {title:'壓軸・找出所有聽牌',level:'★★★★★',hand:['m2','m3','m4','m5','m6','m7','m8'],fixed:fixed.slice(0,3),answers:['m2','m5','m8'],explanation:'進二萬：二二／三四五／六七八；進五萬：二三四／五五／六七八；進八萬：二三四／五六七／八八。三種都要答出！'}
  ];
  function label(code){const n=Number(code.slice(1));return code[0]==='z'?['','東','南','西','北','中','發','白'][n]:['','一','二','三','四','五','六','七','八','九'][n]+({m:'萬',p:'筒',s:'索'}[code[0]])}
  function tiles(codes){return codes.map(code=>'<span class="listen-tile '+(code[0]==='z'?'honor':'suit')+'" role="img" aria-label="'+label(code)+'">'+label(code)+'</span>').join('')}
  function markup(index=0,revealed=false){
    const q=questions[index]||questions[0];
    return '<div class="listen-quiz"><p class="listen-meta">聽牌挑戰 '+(questions.indexOf(q)+1)+' / 5　'+q.level+'</p><h2>'+q.title+'</h2><p class="listen-rules">本活動採 16 張：五組面子＋一對將眼。不計台數、花牌或其他限制。</p><div class="listen-hand" aria-label="待完成的手牌">'+tiles(q.hand)+'</div><p class="listen-question">再摸進哪一張可以胡牌？<br><small>請說出所有可能的牌</small></p><details class="listen-fixed" open><summary>已固定完成的 '+q.fixed.length+' 組面子（不再拆開）</summary><div class="listen-melds">'+q.fixed.map(group=>'<span class="listen-meld">'+tiles(group)+'</span>').join('')+'</div></details>'+(revealed?'<div class="listen-answer"><h3>答案</h3><div class="listen-hand">'+tiles(q.answers)+'</div><p>'+q.explanation+'</p></div>':'<p class="listen-wait">先猜猜看，等主持人公布答案！</p>')+'</div>';
  }
  root.MahjongQuiz={questions,label,markup};
})(typeof window==='undefined'?globalThis:window);
