// 主持人私人的試玩畫面：狀態只留在這個分頁，不呼叫正式遊戲 API。
let rehearsal = null;
const rehearsalEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rehearsalBall = n => '<span class="rehearsal-ball">' + (n ? String(n).padStart(2, '0') : '?') + '</span>';

function openRehearsal(mode = 'quiz') {
  if (!data.admin) return toast('請先登入主持人控制台');
  if (!rehearsal) rehearsal = { mode, quizIndex: -1, quizOpen: false, choice: null, score: 0, lotteryStatus: 'open', picks: [], tickets: [], result: [], startedAt: 0 };
  rehearsal.mode = mode;
  let overlay = document.getElementById('rehearsal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'rehearsal';
    overlay.className = 'rehearsal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '主持人試玩模式');
    document.body.append(overlay);
  }
  overlay.classList.add('show');
  renderRehearsal();
}
function closeRehearsal() {
  document.getElementById('rehearsal')?.classList.remove('show');
  rehearsal = null;
}
function rehearsalMode(mode) { if (!rehearsal) return; rehearsal.mode = mode; renderRehearsal(); }

function renderRehearsal() {
  if (!rehearsal) return;
  const isQuiz = rehearsal.mode === 'quiz';
  document.getElementById('rehearsal').innerHTML = '<div class="rehearsal-window">'
    + '<header class="rehearsal-header"><div><strong>主持人試玩模式</strong><p>僅在這個分頁模擬；不會影響正式賓客、分數或彩券。</p></div><button class="outline" type="button" onclick="closeRehearsal()">✕ 結束試玩</button></header>'
    + '<div class="rehearsal-tabs"><button type="button" class="' + (isQuiz ? 'active' : '') + '" onclick="rehearsalMode(\'quiz\')">⚡ 快問快答</button><button type="button" class="' + (!isQuiz ? 'active' : '') + '" onclick="rehearsalMode(\'lottery\')">🎱 幸福大樂透</button></div>'
    + '<div class="rehearsal-columns"><section class="rehearsal-host"><h3>主持人操作</h3>' + (isQuiz ? rehearsalQuizHost() : rehearsalLotteryHost()) + '</section><section class="rehearsal-guest"><h3>賓客手機畫面預覽</h3>' + (isQuiz ? rehearsalQuizGuest() : rehearsalLotteryGuest()) + '</section></div></div>';
  updateRehearsalDraw();
}

function rehearsalQuizHost() {
  const total = data.questions.length, index = rehearsal.quizIndex;
  return '<p>題目：' + Math.max(0, index + 1) + ' / ' + total + '　·　試玩得分：' + rehearsal.score + '</p>'
    + (total ? '<p>先按「下一題」，再到右側點選答案。公布答案後才能繼續。</p>' : '<p>題庫目前沒有題目，請先在控制台新增。</p>')
    + '<div class="rehearsal-actions"><button class="primary" type="button" onclick="rehearsalNextQuestion()" ' + (index + 1 >= total || rehearsal.quizOpen ? 'disabled' : '') + '>下一題／開放作答</button>'
    + '<button class="outline" type="button" onclick="rehearsalCloseQuestion()" ' + (index < 0 || !rehearsal.quizOpen ? 'disabled' : '') + '>停止作答／公布答案</button>'
    + '<button class="outline" type="button" onclick="rehearsalResetQuiz()">重新試玩</button></div>';
}
function rehearsalQuizGuest() {
  const q = data.questions[rehearsal.quizIndex];
  if (!q) return '<div class="rehearsal-phone"><p>等待主持人出題</p></div>';
  const answered = rehearsal.choice !== null;
  return '<div class="rehearsal-phone"><span class="pill">第 ' + (rehearsal.quizIndex + 1) + ' 題 · ' + (rehearsal.quizOpen ? '開放作答' : '答案公布') + '</span><h3>' + rehearsalEscape(q.text) + '</h3>'
    + q.options.map((option, i) => '<button class="quizopt ' + (rehearsal.choice === i ? 'chosen' : '') + '" type="button" onclick="rehearsalAnswer(' + i + ')" ' + (!rehearsal.quizOpen || answered ? 'disabled' : '') + '>' + String.fromCharCode(65 + i) + '．' + rehearsalEscape(option) + '</button>').join('')
    + (answered ? '<p>已送出答案</p>' : '')
    + (!rehearsal.quizOpen ? '<p class="status">正確答案：' + String.fromCharCode(65 + q.correct) + '．' + rehearsalEscape(q.options[q.correct]) + '</p>' : '')
    + '<p>目前累計得分：' + rehearsal.score + '</p></div>';
}
function rehearsalNextQuestion() {
  if (!rehearsal || rehearsal.quizOpen || rehearsal.quizIndex + 1 >= data.questions.length) return;
  rehearsal.quizIndex++;
  rehearsal.quizOpen = true;
  rehearsal.choice = null;
  renderRehearsal();
}
function rehearsalAnswer(choice) {
  if (!rehearsal || !rehearsal.quizOpen || rehearsal.choice !== null) return;
  rehearsal.choice = choice;
  if (data.questions[rehearsal.quizIndex]?.correct === choice) rehearsal.score += 10;
  renderRehearsal();
}
function rehearsalCloseQuestion() { if (!rehearsal || rehearsal.quizIndex < 0) return; rehearsal.quizOpen = false; renderRehearsal(); }
function rehearsalResetQuiz() { if (!rehearsal) return; rehearsal.quizIndex = -1; rehearsal.quizOpen = false; rehearsal.choice = null; rehearsal.score = 0; renderRehearsal(); }

function rehearsalLotteryHost() {
  const status = rehearsal.lotteryStatus, count = rehearsal.tickets.length;
  return '<p>狀態：<strong>' + ({open:'開放選號',closed:'已截止選號',drawn:'已開獎'})[status] + '</strong>　·　試玩彩券：' + count + ' 張</p>'
    + '<p>先在右側選六碼送出試玩彩券，再截止選號與開獎。</p>'
    + '<div class="rehearsal-actions"><button class="outline" type="button" onclick="rehearsalLotteryState(\'open\')" ' + (status !== 'closed' ? 'disabled' : '') + '>① 開放選號</button>'
    + '<button class="outline" type="button" onclick="rehearsalLotteryState(\'closed\')" ' + (status !== 'open' ? 'disabled' : '') + '>② 截止選號</button>'
    + '<button class="primary" type="button" onclick="rehearsalDraw()" ' + (status !== 'closed' || !count ? 'disabled' : '') + '>③ 開始開獎</button>'
    + '<button class="outline" type="button" onclick="rehearsalResetLottery()">重新試玩（清空試玩彩券）</button></div>'
    + '<p class="small muted">開出的六碼會從已送出的試玩彩券中抽出一張。</p>';
}
function rehearsalLotteryGuest() {
  const status = rehearsal.lotteryStatus;
  return '<div class="rehearsal-phone"><span class="pill">' + ({open:'投注開放中',closed:'已截止投注',drawn:'幸福開獎中'})[status] + '</span>'
    + (status === 'open' ? '<p>從 1–49 選六個不重複的號碼。</p><div class="rehearsal-numbers">' + Array.from({length:49},(_,i) => '<button class="num ' + (rehearsal.picks.includes(i+1)?'selected':'') + '" type="button" onclick="rehearsalPick(' + (i+1) + ')">' + String(i+1).padStart(2,'0') + '</button>').join('') + '</div><p>已選 ' + rehearsal.picks.length + ' / 6 個</p><button class="primary" type="button" onclick="rehearsalTicket()" ' + (rehearsal.picks.length !== 6 ? 'disabled' : '') + '>送出一張試玩彩券</button>' : '')
    + '<p>已送出的試玩彩券：' + rehearsal.tickets.map((ticket,i) => '<br>第 ' + (i+1) + ' 張：' + ticket.map(n=>String(n).padStart(2,'0')).join(' · ')).join('') + '</p>'
    + (status === 'drawn' ? '<div class="rehearsal-balls" id="rehearsalBalls"></div><p id="rehearsalWinner"></p>' : '')
    + '</div>';
}
function rehearsalPick(number) {
  if (!rehearsal || rehearsal.lotteryStatus !== 'open') return;
  const picks = rehearsal.picks;
  if (picks.includes(number)) rehearsal.picks = picks.filter(n=>n!==number);
  else if (picks.length < 6) picks.push(number);
  renderRehearsal();
}
function rehearsalTicket() {
  if (!rehearsal || rehearsal.lotteryStatus !== 'open' || rehearsal.picks.length !== 6) return;
  rehearsal.tickets.push([...rehearsal.picks].sort((a,b)=>a-b));
  rehearsal.picks = [];
  renderRehearsal();
}
function rehearsalLotteryState(status) {
  if (!rehearsal || rehearsal.lotteryStatus === 'drawn') return;
  rehearsal.lotteryStatus = status;
  renderRehearsal();
}
function rehearsalDraw() {
  if (!rehearsal || rehearsal.lotteryStatus !== 'closed' || !rehearsal.tickets.length) return;
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  rehearsal.result = rehearsal.tickets[random[0] % rehearsal.tickets.length];
  rehearsal.startedAt = Date.now();
  rehearsal.lotteryStatus = 'drawn';
  renderRehearsal();
}
function rehearsalResetLottery() {
  if (!rehearsal) return;
  rehearsal.lotteryStatus = 'open'; rehearsal.picks = []; rehearsal.tickets = []; rehearsal.result = []; rehearsal.startedAt = 0;
  renderRehearsal();
}
function updateRehearsalDraw() {
  if (!rehearsal || rehearsal.lotteryStatus !== 'drawn') return;
  const count = Math.min(6, Math.floor((Date.now() - rehearsal.startedAt) / 1600));
  const balls = document.getElementById('rehearsalBalls');
  if (balls) balls.innerHTML = Array.from({length:6},(_,i)=>rehearsalBall(i<count?rehearsal.result[i]:null)).join('');
  const winner = document.getElementById('rehearsalWinner');
  if (winner) winner.textContent = count === 6 ? '恭喜！試玩彩券六碼全中 🎉' : '逐顆開獎中…';
}
setInterval(updateRehearsalDraw, 250);
