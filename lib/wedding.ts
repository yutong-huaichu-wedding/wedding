
import { env } from 'cloudflare:workers';

type Row = Record<string, any>;
export const db = () => { if (!env.DB) throw new Error('Database unavailable'); return env.DB; };
export const bucket = () => { if (!env.BUCKET) throw new Error('Photo storage unavailable'); return env.BUCKET; };
export const mediaLimit = 20 * 1024 * 1024 * 1024;
export const photoLimit = 20, photoFileLimit = 30 * 1024 * 1024;
export const mediaBytes = async () => Number((await first('SELECT COALESCE(SUM(size),0) AS total FROM media'))?.total || 0);
export const now = () => Date.now();
export const bad = (message: string, status = 400) => Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } });
export const good = (value: unknown = {}) => Response.json(value, { headers: { 'cache-control': 'no-store' } });
export const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
export const all = async (sql: string, ...args: unknown[]): Promise<Row[]> => (await db().prepare(sql).bind(...args).all()).results as Row[];
export const first = async (sql: string, ...args: unknown[]): Promise<Row | null> => await db().prepare(sql).bind(...args).first() as Row | null;
export const run = async (sql: string, ...args: unknown[]) => db().prepare(sql).bind(...args).run();
export const setting = async (key: string, fallback: any) => { const row = await first('SELECT value FROM settings WHERE key = ?', key); try { return row ? JSON.parse(row.value) : fallback; } catch { return fallback; } };
export const setSetting = async (key: string, value: unknown) => run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
export const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');
const cookie = (request: Request, name: string) => (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
export const isAdmin = async (request: Request) => { const token = cookie(request, 'wedding_admin'); if (!token) return false; const row = await first('SELECT expires_at FROM admin_sessions WHERE token_hash=?', await hash(token)); return !!row && Number(row.expires_at) > now(); };
export const guest = async (request: Request) => { const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || ''; if (!token) return null; return await first('SELECT id,name,avatar_kind AS avatarKind,avatar_value AS avatarValue,created_at FROM guests WHERE token_hash=?', await hash(token)); };
export const sameOrigin = (request: Request) => { const origin = request.headers.get('origin'); return !origin || origin === new URL(request.url).origin; };
export const sessionCookie = (request: Request, token: string, maxAge: number) => 'wedding_admin=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge + (new URL(request.url).protocol === 'https:' ? '; Secure' : '');
export const validNumbers = (value: unknown): value is number[] => Array.isArray(value) && value.length === 6 && value.every(n => Number.isInteger(n) && n >= 1 && n <= 49) && new Set(value).size === 6;
export const lotteryDrawDuration = 15600;
const publicLottery = (lottery: any) => ({ ...lottery, draws: (lottery.draws || []).map(({ winnerIds: _ids, ...entry }: any) => entry) });
export const lotteryDefault = { status: 'open', result: [] as number[], startedAt: 0 };
export const quizDefault = { index: -1, open: false };
export const mahjongDefault = { phase: 'guess' };
export const kahootDefault = { url: 'https://kahoot.it/', pin: '' };
export const projectionDefault = { mode: 'waiting', session: '' };
const projectionModes = ['waiting', 'mahjong', 'cat', 'lotto', 'wall', 'kahoot', 'quiz', 'join'];
export function validKahootUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && ['kahoot.it','www.kahoot.it'].includes(url.hostname) && !url.username && !url.password && (!url.port || url.port === '443') ? url.href : null; } catch { return null; }
}
export const avatarPresets = ['cat','rabbit','bear','panda','fox','chick','frog','penguin','dog','koala','hamster','tiger','lion','pig','monkey','owl','unicorn','butterfly','sunflower','cherry','heart','star','cake'];

// Participation and each question's roster live in settings; no migration or data reset.
const participantKey = (id: string) => 'quizParticipant:' + id;
const closeCompletedQuiz = () => db().prepare(`
  UPDATE settings SET value=json_set(value,'$.open',json('false'))
  WHERE key='quiz' AND COALESCE(json_extract(value,'$.autoJoin'),0)=0 AND json_extract(value,'$.open')=1
    AND json_array_length(value,'$.participants')>0
    AND NOT EXISTS (
      SELECT 1 FROM json_each(settings.value,'$.participants') p
      WHERE NOT EXISTS (SELECT 1 FROM answers a WHERE a.guest_id=p.value
        AND a.question_id=json_extract(settings.value,'$.questionId'))
    )`);

export const buzzerDefault = { round: '', status: 'idle', opensAt: 0, title: '', winner: null };
const publicBuzzer = (value: any) => ({ round: value.round, status: value.status, opensAt: value.opensAt || 0, title: value.title || '', showWinner: value.showWinner !== false, winner: value.winner ? { name: value.winner.name, at: value.winner.at } : null });
export async function readBuzzer() { return good({ buzzer: publicBuzzer(await setting('buzzer', buzzerDefault)), serverNow: now() }); }

// Score timing is stored beside the existing quiz settings; no schema migration.
const answerPoints = `CASE WHEN a.correct=1 THEN CASE WHEN json_extract(t.value,'$.durationMs')>0
  THEN CAST(ROUND(1000-500*MIN(1.0,MAX(0.0,(a.created_at-json_extract(t.value,'$.startedAt'))*1.0/json_extract(t.value,'$.durationMs')))) AS INTEGER)
  ELSE 10 END ELSE 0 END`;
const gameRoster = async () => {
  const names = await all("SELECT g.name FROM settings s JOIN guests g ON s.key='gameJoined:'||g.id ORDER BY json_extract(s.value,'$.joinedAt') DESC,g.created_at,g.id");
  return { count: names.length, names: names.map(row => row.name) };
};

export const eventDefault = { mode: 'reception', serial: 'initial' };
const eventModes = ['reception', 'quiz', 'cat', 'mahjong', 'lotto'];
export async function readActivity() {
  const [activity, quiz] = await Promise.all([setting('eventActivity', eventDefault), setting('quiz', quizDefault)]);
  const response: any = { activity, serverNow: now(), quiz: null, players: await gameRoster() };
  if (activity.mode === 'quiz' || (await setting('projection', projectionDefault)).mode === 'quiz') {
    const q = quiz.questionId ? await first('SELECT id,text,options,correct FROM questions WHERE id=?', quiz.questionId) : null;
    const open = !!quiz.open && (!quiz.endsAt || quiz.endsAt > now());
    response.quiz = { index: quiz.index, round: quiz.round || '', open, endsAt: quiz.endsAt || 0, scoring: quiz.scoring || 'fixed',
      question: q ? { id: q.id, text: q.text, options: JSON.parse(q.options), ...(!open ? { correct: q.correct } : {}) } : null,
      answered: q ? Number((await first('SELECT COUNT(*) AS count FROM answers WHERE question_id=?', q.id))?.count || 0) : 0,
      total: Number((await first('SELECT COUNT(*) AS count FROM questions'))?.count || 0),
      leaders: open ? [] : await all(`SELECT g.name,SUM(${answerPoints}) AS score FROM guests g JOIN answers a ON a.guest_id=g.id LEFT JOIN settings t ON t.key='quizTiming:'||a.question_id GROUP BY g.id ORDER BY score DESC,g.created_at LIMIT 10`) };
  }
  return good(response);
}

export async function state(request: Request) {
  const admin = await isAdmin(request);
  const me = await guest(request);
  const photoTake = Math.min(3000,Math.max(60,Math.floor(Number(new URL(request.url).searchParams.get('photos'))||60)));
  const [blessings, photos, questions, tickets, guests, lotto, quiz, mahjong, kahoot, projection] = await Promise.all([
    all('SELECT b.id,b.name,b.text,b.created_at AS time,g.avatar_kind AS avatarKind,g.avatar_value AS avatarValue FROM blessings b LEFT JOIN guests g ON g.id=b.guest_id ORDER BY b.created_at DESC LIMIT 150'),
    all("SELECT p.id,p.name,p.guest_id AS guestId,p.created_at AS time FROM photos p WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key='photoPending:'||p.id) ORDER BY p.created_at DESC,p.id DESC LIMIT ?",photoTake),
    all('SELECT id,text,options,correct,position FROM questions ORDER BY position,id'),
    all('SELECT t.id,t.guest_id AS guestId,t.name,t.numbers,t.created_at AS time,b.text AS blessing FROM tickets t LEFT JOIN blessings b ON b.id=t.id ORDER BY t.created_at'),
    admin ? all('SELECT id,name,avatar_kind AS avatarKind,avatar_value AS avatarValue,created_at AS time FROM guests ORDER BY created_at') : Promise.resolve([]),
    setting('lottery', lotteryDefault),
    setting('quiz', quizDefault),
    setting('mahjong', mahjongDefault),
    setting('kahoot', kahootDefault),
    setting('projection', projectionDefault)
  ]);
  const photoTotal = Number((await first("SELECT COUNT(*) AS count FROM photos p WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key='photoPending:'||p.id)"))?.count||0);
  const ownPhotoCount = me ? Number((await first("SELECT COUNT(*) AS count FROM photos p WHERE p.guest_id=? AND NOT EXISTS (SELECT 1 FROM settings WHERE key='photoPending:'||p.id AND CAST(value AS INTEGER)<?)", me.id, now()-30*60*1000))?.count||0) : 0;
  const parsedTickets: Row[] = tickets.map(t => ({ ...t, numbers: JSON.parse(t.numbers) }));
  const result = Array.isArray(lotto.result) ? lotto.result : [];
  const winners = lotto.status === 'drawn' ? parsedTickets.filter(t => t.numbers.join(',') === result.join(',')).map(t => t.name) : [];
  const current = questions[quiz.index];
  const roster: string[] = Array.isArray(quiz.participants) ? quiz.participants : [];
  const participantCount = await first("SELECT COUNT(*) AS count FROM settings s JOIN guests g ON s.key='quizParticipant:'||g.id");
  const answeredCount = current ? await first('SELECT COUNT(*) AS count FROM answers WHERE question_id=? AND guest_id IN (SELECT value FROM json_each(?))', current.id, JSON.stringify(roster)) : null;
  const joined = me ? !!await first('SELECT key FROM settings WHERE key=?', participantKey(me.id)) : false;
  const { participants: _participants, ...publicQuiz } = quiz;
  const currentQuestion = current ? { id: current.id, text: current.text, options: JSON.parse(current.options), ...(admin || !quiz.open ? { correct: current.correct } : {}) } : null;
  const myAnswer = me && current ? await first('SELECT choice FROM answers WHERE guest_id=? AND question_id=?', me.id, current.id) : null;
  const myScore = me ? await first(`SELECT COALESCE(SUM(${answerPoints}),0) AS score FROM answers a LEFT JOIN settings t ON t.key='quizTiming:'||a.question_id WHERE a.guest_id=?`, me.id) : null;
  const scores = admin ? await all(`SELECT g.name,g.avatar_kind AS avatarKind,g.avatar_value AS avatarValue,SUM(${answerPoints}) AS score FROM guests g JOIN answers a ON a.guest_id=g.id LEFT JOIN settings t ON t.key='quizTiming:'||a.question_id GROUP BY g.id ORDER BY score DESC,g.created_at LIMIT 30`) : [];
  return good({
    mahjong, kahoot, projection,
    admin, me: me ? { id: me.id, name: me.name, avatarKind: me.avatarKind, avatarValue: me.avatarValue } : null,
    blessings: blessings.reverse(), photos: photos.reverse().map(p => { const { guestId, ...photo } = p; return { ...photo, canDelete: admin || !!me && guestId === me.id, url: '/api/photo/' + p.id, thumbnailUrl: '/api/photo/' + p.id + '?preview=1', downloadUrl: '/api/photo/' + p.id + '?download=1' }; }),
    album: { total: photoTotal, mine: ownPhotoCount, perGuest: photoLimit, perFileBytes: photoFileLimit, capacityBytes: mediaLimit, hasMore: photoTotal>photos.length },
    lottery: { ...publicLottery(lotto), winners, ticketCount: parsedTickets.length, remainingCount: parsedTickets.filter(t => !(lotto.draws || []).some((draw: any) => (draw.winnerIds || []).includes(t.guestId))).length },
    myTicket: me ? parsedTickets.find(t => t.guestId === me.id) || null : null,
    quiz: { ...publicQuiz, joined, eligible: !!me && roster.includes(me.id), participantCount: Number(participantCount?.count || 0), answeredCount: Number(answeredCount?.count || 0), totalParticipants: roster.length, question: currentQuestion, total: questions.length, myAnswer: myAnswer?.choice ?? null, myScore: Number(myScore?.score || 0) },
    ...(admin ? { guests, tickets: parsedTickets, questions: questions.map(q => ({ ...q, options: JSON.parse(q.options) })), scores } : {})
  });
}

// A dedicated projection reads only display state, without guest/profile/legacy quiz queries.
export async function readProjection() {
  const [projection, mahjong, lottery, kahoot] = await Promise.all([
    setting('projection', projectionDefault), setting('mahjong', mahjongDefault),
    setting('lottery', lotteryDefault), setting('kahoot', kahootDefault)
  ]);
  const winners = lottery.status === 'drawn' ? (await all('SELECT name FROM tickets WHERE numbers=?', JSON.stringify(lottery.result))).map(row => row.name) : [];
  const blessings = projection.mode === 'wall' ? await all('SELECT b.id,b.name,b.text,g.avatar_kind AS avatarKind,g.avatar_value AS avatarValue FROM blessings b LEFT JOIN guests g ON g.id=b.guest_id ORDER BY b.created_at DESC LIMIT 150') : [];
  return good({ projection, mahjong, lottery: { ...publicLottery(lottery), winners }, kahoot, blessings });
}

export async function action(request: Request) {
  if (!sameOrigin(request)) return bad('來源不符', 403);
  let body: any; try { body = await request.json(); } catch { return bad('資料格式錯誤'); }
  const type = clean(body.type, 40);
  if (type === 'login') {
    if (!env.ADMIN_PASSWORD) return bad('主持人密碼尚未設定', 503);
    if (await hash(clean(body.password, 200)) !== await hash(env.ADMIN_PASSWORD)) return bad('管理密碼不正確', 401);
    const token = crypto.randomUUID() + crypto.randomUUID();
    await run('INSERT INTO admin_sessions (token_hash,expires_at) VALUES (?,?)', await hash(token), now() + 12*60*60*1000);
    const response = good({ ok: true });
    response.headers.set('set-cookie', sessionCookie(request, token, 12*60*60));
    return response;
  }
  if (type === 'logout') {
    const token = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith('wedding_admin='))?.slice(14) || '';
    if (token) await run('DELETE FROM admin_sessions WHERE token_hash=?', await hash(token));
    const response = good({ ok: true }); response.headers.set('set-cookie', sessionCookie(request, '', 0)); return response;
  }
  if (type === 'checkin') {
    const name = clean(body.name, 25);
    if (name.length < 2) return bad('請輸入至少兩個字的姓名');
    const avatarKind = body.avatarKind === 'photo' ? 'pending' : 'preset';
    const avatarValue = avatarKind === 'preset' ? clean(body.avatarValue, 20) : '';
    if (avatarKind === 'preset' && !avatarPresets.includes(avatarValue)) return bad('請先選擇頭像');
    const token = crypto.randomUUID() + crypto.randomUUID(), id = crypto.randomUUID();
    await run('INSERT INTO guests (id,name,token_hash,avatar_kind,avatar_value,created_at) VALUES (?,?,?,?,?,?)', id, name, await hash(token), avatarKind, avatarValue, now());
    return good({ ok: true, token, id });
  }
  const admin = await isAdmin(request);
  const me = await guest(request);
  if (type === 'buzzerClaim') {
    if (!me || !['preset', 'photo'].includes(me.avatarKind)) return bad('請先完成賓客報到', 401);
    const current = await setting('buzzer', buzzerDefault);
    if (!body.round || body.round !== current.round) return bad('這輪已結束，請等待主持人重新開放', 409);
    if (current.winner) return good({ ok: true, won: current.winner.guestId === me.id, buzzer: publicBuzzer(current), serverNow: now() });
    const receivedAt = now();
    if (current.status !== 'open' || receivedAt < current.opensAt) return bad('尚未開放，請等倒數結束再按', 425);
    const winner = JSON.stringify({ guestId: me.id, name: me.name, at: receivedAt });
    await run(`UPDATE settings SET value=json_set(value,'$.winner',json(?),'$.status','closed')
      WHERE key='buzzer' AND json_extract(value,'$.round')=? AND json_extract(value,'$.status')='open'
        AND json_extract(value,'$.opensAt')<=? AND json_extract(value,'$.winner') IS NULL`, winner, body.round, receivedAt);
    const decided = await setting('buzzer', buzzerDefault);
    if (decided.round !== body.round) return bad('主持人已換到下一輪，請重新確認', 409);
    return good({ ok: true, won: decided.winner?.guestId === me.id, buzzer: publicBuzzer(decided), serverNow: now() });
  }
  if (type === 'gameJoin') {
    if (!me || !['preset', 'photo'].includes(me.avatarKind)) return bad('請先完成報到', 401);
    await run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO NOTHING', 'gameJoined:' + me.id, JSON.stringify({ joinedAt: now() }));
    return good({ ok: true });
  }
  if (type === 'profileUpdate') {
    if (!me) return bad('請先報到', 401);
    const name = clean(body.name, 25);
    if (name.length < 2) return bad('請輸入至少兩個字的姓名');
    if (name === me.name) return good({ ok: true });
    await db().batch([
      db().prepare('UPDATE guests SET name=? WHERE id=?').bind(name, me.id),
      db().prepare('UPDATE blessings SET name=? WHERE guest_id=?').bind(name, me.id),
      db().prepare('UPDATE photos SET name=? WHERE guest_id=?').bind(name, me.id)
    ]);
    return good({ ok: true });
  }
  if (type === 'avatarUpdate') {
    if (!me) return bad('請先報到', 401);
    const value = clean(body.avatarValue, 20);
    if (!avatarPresets.includes(value)) return bad('請選擇有效的頭像');
    await run('UPDATE guests SET avatar_kind=?,avatar_value=? WHERE id=?', 'preset', value, me.id);
    if (me.avatarKind === 'photo' && me.avatarValue) {
      await bucket().delete('avatars/' + me.avatarValue);
      await run('DELETE FROM media WHERE id=?', me.avatarValue);
    }
    return good({ ok: true });
  }
  if (type === 'blessing') {
    if (!me) return bad('請先報到', 401);
    if (!['preset','photo'].includes(me.avatarKind)) return bad('請先選擇頭像', 403);
    const text = clean(body.text, 100);
    if (!text) return bad('請輸入祝福');
    await run('INSERT INTO blessings (id,guest_id,name,text,created_at) VALUES (?,?,?,?,?)', crypto.randomUUID(), me.id, me.name, text, now());
    return good({ ok: true });
  }
  if (type === 'ticket' || type === 'proxyTicket') {
    if (!me && type === 'ticket') return bad('請先報到', 401);
    if (type === 'ticket' && me && !['preset','photo'].includes(me.avatarKind)) return bad('請先選擇頭像', 403);
    if (type === 'proxyTicket' && !admin) return bad('僅主持人可代投', 403);
    const numbers = body.numbers;
    if (!validNumbers(numbers)) return bad('請從 1–49 選 6 個不重複號碼');
    if (body.blessing != null && typeof body.blessing !== 'string') return bad('祝福格式錯誤');
    const blessing = (body.blessing || '').trim();
    if (blessing.length > 100) return bad('祝福請在 100 字以內');
    const realName = typeof body.realName === 'string' ? body.realName.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
    if (realName.length < 2 || realName.length > 25) return bad('請填寫 2–25 字的兌獎本名，勿填暱稱');
    const nameKey = realName.replace(/\s+/gu, '').toLowerCase();
    const offline = type === 'proxyTicket' && body.offline === true;
    if (offline && body.guestId) return bad('請選擇直接代投或已報到賓客其中一種方式');
    const target = offline ? { id: crypto.randomUUID(), name: realName } : type === 'ticket' ? me : await first('SELECT id,name FROM guests WHERE id=?', clean(body.guestId, 80));
    if (!target) return bad('找不到報到賓客');
    const sorted = [...numbers].sort((a,b) => a-b);
    const id = crypto.randomUUID(), time = now();
    const ticket = db().prepare("INSERT INTO tickets (id,guest_id,name,numbers,created_at) SELECT ?,?,?,?,? WHERE COALESCE(json_extract((SELECT value FROM settings WHERE key='lottery'),'$.status'),'open')='open' AND EXISTS (SELECT 1 FROM guests WHERE id=?) AND NOT EXISTS (SELECT 1 FROM tickets WHERE lower(replace(replace(name,' ',''),'　',''))=?) ON CONFLICT(guest_id) DO NOTHING").bind(id, target.id, realName, JSON.stringify(sorted), time, target.id, nameKey);
    // One transaction: only this newly created ticket can add its blessing.
    // A duplicate ticket or closed round cannot leave an orphan message.
    // Offline identity and ticket are one transaction: failures create neither.
    // No reusable guest credential is returned or stored on the staff phone.
    const registration = offline ? [db().prepare("INSERT INTO guests (id,name,token_hash,created_at,avatar_kind,avatar_value) SELECT ?,?,?,?,'preset','cat' WHERE COALESCE(json_extract((SELECT value FROM settings WHERE key='lottery'),'$.status'),'open')='open' AND NOT EXISTS (SELECT 1 FROM tickets WHERE lower(replace(replace(name,' ',''),'　',''))=?)").bind(target.id, realName, await hash(crypto.randomUUID()+crypto.randomUUID()), time, nameKey)] : [];
    const results = await db().batch([...registration, ticket, ...(blessing ? [db().prepare('INSERT INTO blessings (id,guest_id,name,text,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tickets WHERE id=?)').bind(id, target.id, target.name, blessing, time, id)] : [])]);
    const result = results[registration.length];
    if (!result.meta.changes) return bad('投注已截止，或此身分／本名已投注；每人限一注。同名賓客請找主持人核對。');
    return good({ ok: true });
  }
  if (type === 'quizJoin' || type === 'quizLeave') {
    if (!me) return bad('請先報到', 401);
    if (!['preset','photo'].includes(me.avatarKind)) return bad('請先選擇頭像', 403);
    if (type === 'quizJoin') {
      await setSetting(participantKey(me.id), true);
    } else {
      await db().batch([
        db().prepare('DELETE FROM settings WHERE key=?').bind(participantKey(me.id)),
        // Retain submitted answers and their place in this question's denominator.
        db().prepare(`UPDATE settings SET value=json_set(value,'$.participants',json(
          (SELECT json_group_array(p.value) FROM json_each(settings.value,'$.participants') p WHERE p.value<>?)
        )) WHERE key='quiz' AND json_type(value,'$.participants')='array'
          AND NOT EXISTS (SELECT 1 FROM answers WHERE guest_id=? AND question_id=json_extract(settings.value,'$.questionId'))`).bind(me.id, me.id),
        closeCompletedQuiz()
      ]);
    }
    return good({ ok: true });
  }
  if (type === 'answer') {
    if (!me) return bad('請先報到', 401);
    if (!['preset','photo'].includes(me.avatarKind)) return bad('請先選擇頭像', 403);
    const quiz = await setting('quiz', quizDefault);
    const questions = await all('SELECT id,correct FROM questions ORDER BY position,id');
    const q = questions[quiz.index];
    const choice = Number(body.choice);
    if (!quiz.open || !q || quiz.endsAt && now() >= quiz.endsAt) return bad('目前未開放作答');
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return bad('答案無效');
    if (body.round !== quiz.round || body.questionId !== q.id) return bad('題目已更新，請重新確認後作答');
    if (!quiz.autoJoin && (!Array.isArray(quiz.participants) || !quiz.participants.includes(me.id))) return bad('請先按「我要參賽」，從下一題開始作答');
    const answerId = crypto.randomUUID(), receivedAt = now();
    const [result] = await db().batch([
      db().prepare(`INSERT INTO answers (id,question_id,guest_id,choice,correct,created_at)
        SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM settings WHERE key='quiz'
          AND json_extract(value,'$.open')=1 AND json_extract(value,'$.round')=?
          AND json_extract(value,'$.questionId')=?
          AND (COALESCE(json_extract(value,'$.autoJoin'),0)=1 OR EXISTS (SELECT 1 FROM json_each(settings.value,'$.participants') WHERE value=?))
          AND (COALESCE(json_extract(value,'$.endsAt'),0)=0 OR json_extract(value,'$.endsAt')>?))
        ON CONFLICT(question_id,guest_id) DO NOTHING`).bind(answerId, q.id, me.id, choice, choice === q.correct ? 1 : 0, receivedAt, quiz.round, q.id, me.id, receivedAt),
      db().prepare(`INSERT INTO settings (key,value) SELECT ?,? WHERE EXISTS (SELECT 1 FROM answers WHERE id=?) ON CONFLICT(key) DO NOTHING`).bind('gameJoined:' + me.id, JSON.stringify({ joinedAt: receivedAt }), answerId),
      closeCompletedQuiz()
    ]);
    if (!result.meta.changes) return bad('已作答，或作答已結束');
    return good({ ok: true });
  }
  if (type === 'photoDelete') {
    const id = clean(body.id, 80);
    const photo = await first('SELECT id,guest_id AS guestId FROM photos WHERE id=?', id);
    if (!admin && (!me || !photo || photo.guestId !== me.id)) return bad('只能刪除自己上傳的照片', 403);
    if (!photo) return good({ ok: true });
    // Check the stored uploader, never a submitted name or uploader ID.
    // Keep the album row if storage fails so the deletion can be retried.
    await bucket().delete('photo-previews/' + id);
    await bucket().delete('photos/' + id);
    await db().batch([
      db().prepare('DELETE FROM photos WHERE id=?').bind(id),
      db().prepare('DELETE FROM media WHERE id=?').bind(id),
      db().prepare('DELETE FROM settings WHERE key=?').bind('photoPending:' + id)
    ]);
    return good({ ok: true });
  }
  if (!admin) return bad('請先登入主持人控制台', 403);
  if (type === 'eventActivity') {
    if (!eventModes.includes(body.mode)) return bad('活動無效');
    const next = { mode: body.mode, serial: crypto.randomUUID() };
    const statements = [db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('eventActivity', JSON.stringify(next))];
    if (body.mode !== 'cat') statements.push(db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('projection', JSON.stringify({ mode: ({ reception: 'waiting', quiz: 'quiz', mahjong: 'mahjong', lotto: 'lotto' } as Record<string,string>)[body.mode], session: '' })));
    await db().batch(statements);
    return good({ ok: true, activity: next });
  }
  if (type === 'liveQuizNext') {
    const previous = await setting('quiz', quizDefault), questions = await all('SELECT id FROM questions ORDER BY position,id');
    if (previous.open && (!previous.endsAt || previous.endsAt > now())) return bad('請先截止目前這一題');
    const index = previous.index + 1;
    if (!questions[index]) return bad('尚無題目，或已經是最後一題');
    const duration = Number(body.seconds ?? 20);
    if (!Number.isInteger(duration) || duration < 10 || duration > 60) return bad('作答時間請設10～60秒');
    const round = crypto.randomUUID(), startedAt = now(), next = { index, questionId: questions[index].id, round, open: true, autoJoin: true, scoring: 'speed', participants: [], startedAt, endsAt: startedAt + duration * 1000 };
    const activity = { mode: 'quiz', serial: crypto.randomUUID() };
    const [result] = await db().batch([
      db().prepare(`INSERT INTO settings (key,value) SELECT 'quiz',? WHERE COALESCE(json_extract((SELECT value FROM settings WHERE key='quiz'),'$.index'),-1)=?
        AND (COALESCE(json_extract((SELECT value FROM settings WHERE key='quiz'),'$.open'),0)=0 OR json_extract((SELECT value FROM settings WHERE key='quiz'),'$.endsAt')<=?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(JSON.stringify(next), previous.index, now()),
      db().prepare(`INSERT INTO settings (key,value) SELECT 'eventActivity',? WHERE json_extract((SELECT value FROM settings WHERE key='quiz'),'$.round')=? ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(JSON.stringify(activity), round),
      db().prepare(`INSERT INTO settings (key,value) SELECT 'projection',? WHERE json_extract((SELECT value FROM settings WHERE key='quiz'),'$.round')=? ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(JSON.stringify({ mode: 'quiz', session: '' }), round),
      db().prepare(`INSERT INTO settings (key,value) SELECT ?,? WHERE json_extract((SELECT value FROM settings WHERE key='quiz'),'$.round')=? ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind('quizTiming:' + questions[index].id, JSON.stringify({ startedAt, durationMs: duration * 1000, round }), round)
    ]);
    if (!result.meta.changes) return bad('另一台主持人已出題，請重新確認');
    return good({ ok: true });
  }
  if (type === 'liveQuizClose') {
    const result = await run(`UPDATE settings SET value=json_set(value,'$.open',json('false')) WHERE key='quiz' AND json_extract(value,'$.round')=?`, clean(body.round, 80));
    if (!result.meta.changes) return bad('題目已更新，請重新確認');
    return good({ ok: true });
  }
  if (type === 'buzzerPrepare') {
    if (typeof body.round !== 'string' || body.round.length > 80) return bad('請先重新連線取得目前輪次');
    const next = { round: crypto.randomUUID(), status: 'ready', opensAt: 0, title: clean(body.title, 60) || '現場搶答', winner: null };
    const result = await run(`INSERT INTO settings (key,value) VALUES ('buzzer',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE json_extract(settings.value,'$.round')=?`, JSON.stringify(next), body.round);
    if (!result.meta.changes) return bad('另一台主持人已切換輪次，請重新確認', 409);
    return good({ ok: true, buzzer: publicBuzzer(next), serverNow: now() });
  }
  if (type === 'buzzerOpen' || type === 'buzzerClose') {
    if (typeof body.round !== 'string' || !body.round) return bad('請先準備新一輪');
    const result = type === 'buzzerOpen'
      ? await run(`UPDATE settings SET value=json_set(value,'$.status','open','$.opensAt',?) WHERE key='buzzer' AND json_extract(value,'$.round')=? AND json_extract(value,'$.status')='ready'`, now() + 5000, body.round)
      : await run(`UPDATE settings SET value=json_set(value,'$.status','closed','$.showWinner',json('false')) WHERE key='buzzer' AND json_extract(value,'$.round')=? AND json_extract(value,'$.status') IN ('ready','open','closed')`, body.round);
    if (!result.meta.changes) return bad('狀態已變更，請重新確認目前輪次', 409);
    return good({ ok: true, buzzer: publicBuzzer(await setting('buzzer', buzzerDefault)), serverNow: now() });
  }
  if (type === 'kahootUpdate') {
    const url = validKahootUrl(body.url), pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!url) return bad('請貼上 https://kahoot.it/ 開頭的遊戲加入連結');
    if (pin && !/^\d{4,10}$/.test(pin)) return bad('PIN 請填 4～10 位數字，或留空');
    await setSetting('kahoot', { url, pin });
    return good({ ok: true });
  }
  if (type === 'projectionMode') {
    if (!projectionModes.includes(body.mode) || body.mode === 'cat') return bad('請從小貓控制頁出題以切換小貓投影');
    await setSetting('projection', { mode: body.mode, session: '' });
    return good({ ok: true });
  }
  if (type === 'mahjongQuiz') {
    if (!Number.isInteger(body.index) || body.index < 0 || body.index >= 5 || !['question', 'answer'].includes(body.phase)) return bad('請選擇第 1～5 題及出題／解答畫面');
    await db().batch([
      db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('mahjong', JSON.stringify({ kind: 'quiz', index: body.index, phase: body.phase })),
      db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('projection', JSON.stringify({ mode: 'mahjong', session: '' }))
    ]);
    return good({ ok: true, mahjong: { kind: 'quiz', index: body.index, phase: body.phase }, projection: { mode: 'mahjong', session: '' } });
  }
  if (type === 'mahjongPhase') {
    if (!['guess', 'correct', 'wrong'].includes(body.phase)) return bad('請選擇猜牌、答對或答錯畫面');
    await db().batch([
      db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('mahjong', JSON.stringify({ phase: body.phase })),
      db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('projection', JSON.stringify({ mode: 'mahjong', session: '' }))
    ]);
    return good({ ok: true, mahjong: { phase: body.phase }, projection: { mode: 'mahjong', session: '' } });
  }
  if (type === 'ticketName') {
    const id = clean(body.id, 80);
    const realName = typeof body.realName === 'string' ? body.realName.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
    if (realName.length < 2 || realName.length > 25) return bad('請填寫 2–25 字的兌獎本名');
    const key = realName.replace(/\s+/gu, '').toLowerCase();
    const result = await run("UPDATE tickets SET name=? WHERE id=? AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.id<>? AND lower(replace(replace(t.name,' ',''),'　',''))=?)", realName, id, id, key);
    return result.meta.changes ? good({ ok: true }) : bad('找不到彩券，或此本名已投注；請核對名單');
  }
  if (type === 'lottoState') {
    const status = body.status;
    if (status !== 'open' && status !== 'closed') return bad('狀態無效');
    const lottery = await setting('lottery', lotteryDefault);
    if (lottery.status === 'drawn' || lottery.status === 'drawing') return bad('本輪開獎中或已開獎，請先開新一輪');
    await setSetting('lottery', { ...lottery, status });
    return good({ ok: true });
  }
  if (type === 'draw') {
    const stored = await first("SELECT value FROM settings WHERE key='lottery'");
    if (!stored) return bad('請先截止選號，再開始開獎');
    const lottery = JSON.parse(stored.value);
    if (!['closed','drawn'].includes(lottery.status)) return bad(lottery.status === 'open' ? '請先截止選號，再開始開獎' : '正在開獎，請稍候');
    if (lottery.status === 'drawn' && now() - Number(lottery.startedAt) < Number(lottery.durationMs || 27600)) return bad('請等這個獎的開獎動畫結束，再開下一個獎');
    const tickets = await all('SELECT id,guest_id AS guestId,name,numbers FROM tickets ORDER BY created_at');
    if (!tickets.length) return bad('至少要有一張有效彩券');
    const draws = Array.isArray(lottery.draws) ? [...lottery.draws] : [];
    // Preserve an already completed draw from a previous deployment.
    if (!draws.length && lottery.status === 'drawn' && Array.isArray(lottery.result)) {
      const oldWinners = tickets.filter(t => t.numbers === JSON.stringify(lottery.result));
      draws.push({ id: 'legacy-' + lottery.startedAt, index: 1, prizeName: lottery.prizeName || '第 1 個獎', result: lottery.result, startedAt: lottery.startedAt, winners: oldWinners.map(t => t.name), winnerIds: oldWinners.map(t => t.guestId) });
    }
    const awarded = new Set(draws.flatMap((draw: any) => draw.winnerIds || []));
    const eligible = tickets.filter(t => !awarded.has(t.guestId));
    if (!eligible.length) return bad('本輪賓客都已中獎，沒有尚未中獎的彩券；原投注與得獎紀錄已保留');
    const prizeName = typeof body.prizeName === 'string' ? clean(body.prizeName, 30) : '';
    const lock = JSON.stringify({ ...lottery, status: 'drawing' });
    const claimed = await run("UPDATE settings SET value=? WHERE key='lottery' AND value=?", lock, stored.value);
    if (!claimed.meta.changes) return bad('其他主持人已更新開獎狀態，請稍候重新確認', 409);
    try {
      const random = new Uint32Array(1), limit = Math.floor(4294967296 / eligible.length) * eligible.length;
      do { crypto.getRandomValues(random); } while (random[0] >= limit);
      const picked = eligible[random[0] % eligible.length], result = JSON.parse(picked.numbers);
      const winners = eligible.filter(t => t.numbers === picked.numbers), startedAt = now();
      const draw = { id: crypto.randomUUID(), index: draws.length + 1, prizeName: prizeName || '第 ' + (draws.length + 1) + ' 個獎', result, startedAt, winners: winners.map(t => t.name), winnerIds: winners.map(t => t.guestId) };
      const next = { status: 'drawn', result, startedAt, durationMs: lotteryDrawDuration, prizeName: draw.prizeName, drawIndex: draw.index, draws: [...draws, draw] };
      await db().batch([
        db().prepare("UPDATE settings SET value=? WHERE key='lottery' AND value=?").bind(JSON.stringify(next), lock),
        db().prepare("INSERT INTO settings (key,value) VALUES ('projection',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({ mode: 'lotto', session: '' })),
        db().prepare("INSERT INTO settings (key,value) VALUES ('eventActivity',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({ mode: 'lotto', serial: crypto.randomUUID() }))
      ]);
      return good({ ok: true });
    } catch (error) {
      await run("UPDATE settings SET value=? WHERE key='lottery' AND value=?", stored.value, lock);
      throw error;
    }
  }
  if (type === 'lottoReset') {
    const stored = await first("SELECT value FROM settings WHERE key='lottery'");
    const lottery = stored ? JSON.parse(stored.value) : lotteryDefault;
    if (lottery.status === 'drawing' || lottery.status === 'drawn' && now() - Number(lottery.startedAt) < Number(lottery.durationMs || 27600)) return bad('開獎進行中，請等動畫結束再重開新一輪');
    if (!stored) {
      await db().batch([db().prepare("INSERT INTO settings (key,value) VALUES ('lottery',?) ON CONFLICT(key) DO NOTHING").bind(JSON.stringify(lotteryDefault)),db().prepare("DELETE FROM tickets WHERE EXISTS (SELECT 1 FROM settings WHERE key='lottery' AND value=?)").bind(JSON.stringify(lotteryDefault))]);
    } else {
      const results = await db().batch([db().prepare("DELETE FROM tickets WHERE EXISTS (SELECT 1 FROM settings WHERE key='lottery' AND value=?)").bind(stored.value),db().prepare("UPDATE settings SET value=? WHERE key='lottery' AND value=?").bind(JSON.stringify(lotteryDefault), stored.value)]);
      if (!results[1].meta.changes) return bad('開獎狀態已更新，未清空彩券，請重新確認', 409);
    }
    return good({ ok: true });
  }
  if (type === 'questionAdd' || type === 'questionEdit') {
    const text = clean(body.text, 160), options = Array.isArray(body.options) ? body.options.map((x: unknown) => clean(x, 80)) : [];
    const correct = Number(body.correct);
    if (!text || options.length !== 4 || options.some((x: string) => !x) || ![0,1,2,3].includes(correct)) return bad('請輸入問題、四個選項與正確答案');
    const quiz = await setting('quiz', quizDefault);
    if (quiz.index >= 0) return bad('測驗進行中不可改題');
    if (type === 'questionAdd') {
      const pos = await first('SELECT COALESCE(MAX(position),0)+1 AS value FROM questions');
      await run('INSERT INTO questions (id,text,options,correct,position) VALUES (?,?,?,?,?)', crypto.randomUUID(), text, JSON.stringify(options), correct, pos?.value || 1);
    } else await run('UPDATE questions SET text=?,options=?,correct=? WHERE id=?', text, JSON.stringify(options), correct, clean(body.id, 80));
    return good({ ok: true });
  }
  if (type === 'questionDelete') {
    const quiz = await setting('quiz', quizDefault);
    if (quiz.index >= 0) return bad('測驗進行中不可刪題');
    await run('DELETE FROM questions WHERE id=?', clean(body.id, 80));
    return good({ ok: true });
  }
  if (type === 'questionReorder') {
    const quiz = await setting('quiz', quizDefault);
    if (quiz.index >= 0) return bad('測驗進行中不可移動題目');
    const ids = body.ids;
    const questions = await all('SELECT id FROM questions');
    if (!Array.isArray(ids) || ids.length !== questions.length || new Set(ids).size !== ids.length || !ids.every((id: unknown) => typeof id === 'string' && questions.some(q => q.id === id))) return bad('題目順序無效');
    const order = JSON.stringify(ids);
    await run('UPDATE questions SET position=(SELECT CAST(key AS INTEGER)+1 FROM json_each(?) WHERE value=questions.id) WHERE id IN (SELECT value FROM json_each(?))', order, order);
    return good({ ok: true });
  }
  if (type === 'quizNext') {
    const quiz = await setting('quiz', quizDefault);
    const count = await first('SELECT COUNT(*) AS count FROM questions');
    if (quiz.index + 1 >= Number(count?.count || 0)) return bad('已經是最後一題');
    if (quiz.open) return bad('請先截止目前這一題');
    const questions = await all('SELECT id FROM questions ORDER BY position,id');
    const result = await run(`INSERT INTO settings (key,value)
      SELECT 'quiz',json_object('index',?,'open',json('true'),'round',?,'questionId',?,
        'participants',json((SELECT json_group_array(g.id) FROM settings s JOIN guests g ON s.key='quizParticipant:'||g.id)))
      WHERE COALESCE(json_extract((SELECT value FROM settings WHERE key='quiz'),'$.open'),0)=0
        AND COALESCE(json_extract((SELECT value FROM settings WHERE key='quiz'),'$.index'),-1)=?
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`, quiz.index+1, crypto.randomUUID(), questions[quiz.index+1].id, quiz.index);
    if (!result.meta.changes) return bad('題目狀態已更新，請再確認');
    return good({ ok: true });
  }
  if (type === 'quizClose') {
    await run("UPDATE settings SET value=json_set(value,'$.open',json('false')) WHERE key='quiz'");
    return good({ ok: true });
  }
  if (type === 'quizReset') {
    await db().batch([db().prepare("DELETE FROM settings WHERE key LIKE 'quizTiming:%'"), db().prepare('DELETE FROM answers'), db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('quiz', JSON.stringify(quizDefault))]);
    return good({ ok: true });
  }
  if (type === 'blessingDelete') { await run('DELETE FROM blessings WHERE id=?', clean(body.id, 80)); return good({ ok: true }); }
  if (type === 'resetAll') {
    const photos = await all('SELECT id FROM photos');
    const avatars = await all("SELECT avatar_value AS value FROM guests WHERE avatar_kind='photo'");
    await db().batch(["DELETE FROM settings WHERE key LIKE 'photoPending:%'","DELETE FROM settings WHERE key LIKE 'quizParticipant:%'",'DELETE FROM answers','DELETE FROM tickets','DELETE FROM blessings','DELETE FROM photos','DELETE FROM guests','DELETE FROM questions'].map(sql => db().prepare(sql)));
    const keys = [...photos.flatMap(photo => ['photos/' + photo.id,'photo-previews/' + photo.id]), ...avatars.map(avatar => 'avatars/' + avatar.value)];
    for (let i = 0; i < keys.length; i += 500) await bucket().delete(keys.slice(i, i + 500));
    await run('DELETE FROM media');
    await setSetting('lottery', lotteryDefault);
    await setSetting('quiz', quizDefault);
    return good({ ok: true });
  }
  return bad('未知操作', 404);
}

function detectedPhotoType(bytes: Uint8Array): string | null {
  if (bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'image/png';
  const ascii = (from:number,to:number) => String.fromCharCode(...bytes.slice(from,to));
  if (ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP') return 'image/webp';
  if (ascii(4,8)==='ftyp') {
    for(let i=8;i+4<=bytes.length;i+=4)if(['heic','heix','hevc','hevx','heim','heis','hevm','hevs','mif1','msf1'].includes(ascii(i,i+4)))return 'image/heic';
  }
  return null;
}
async function cleanupPendingPhotos() {
  const expired=await all("SELECT p.id FROM photos p JOIN settings s ON s.key='photoPending:'||p.id WHERE CAST(s.value AS INTEGER)<? LIMIT 20",now()-30*60*1000);
  for(const p of expired){
    const [removed]=await db().batch([
      db().prepare("DELETE FROM photos WHERE id=? AND EXISTS(SELECT 1 FROM settings WHERE key=? AND CAST(value AS INTEGER)<?)").bind(p.id,'photoPending:'+p.id,now()-30*60*1000),
      db().prepare('DELETE FROM media WHERE id=? AND NOT EXISTS(SELECT 1 FROM photos WHERE id=?)').bind(p.id,p.id),
      db().prepare('DELETE FROM settings WHERE key=? AND NOT EXISTS(SELECT 1 FROM photos WHERE id=?)').bind('photoPending:'+p.id,p.id)
    ]);
    if(removed.meta.changes)await bucket().delete(['photos/'+p.id,'photo-previews/'+p.id]);
  }
}
export async function uploadWeddingPhoto(request:Request) {
  if(!sameOrigin(request))return bad('來源不符',403);
  const me=await guest(request);if(!me||!['preset','photo'].includes(me.avatarKind))return bad('請先完成報到',401);
  const announced=Number(request.headers.get('content-length')||0);
  if(announced>photoFileLimit+700*1024)return bad('單張原圖最多30MB',413);
  let original:Blob,preview:Blob|null=null,id=crypto.randomUUID(),filename='';
  if((request.headers.get('content-type')||'').startsWith('multipart/form-data')){
    const form=await request.formData(),file=form.get('original'),thumb=form.get('preview'),uploadId=form.get('uploadId');
    if(!(file instanceof Blob))return bad('請選擇照片');original=file;filename=typeof(file as File).name==='string'?(file as File).name:'';
    if(thumb instanceof Blob)preview=thumb;
    if(uploadId!==null){if(typeof uploadId!=='string'||!/^[0-9a-f-]{36}$/i.test(uploadId))return bad('上傳識別碼無效');id=uploadId as `${string}-${string}-${string}-${string}-${string}`;}
  }else{original=new Blob([await request.arrayBuffer()],{type:request.headers.get('content-type')||''});}
  if(original.size<12||original.size>photoFileLimit)return bad('單張原圖需為30MB以下的照片',413);
  const type=detectedPhotoType(new Uint8Array(await original.slice(0,64).arrayBuffer()));if(!type)return bad('照片需為JPG、PNG、WebP或HEIC／HEIF格式');
  if(preview&&(preview.size>600*1024||preview.size<12||detectedPhotoType(new Uint8Array(await preview.slice(0,16).arrayBuffer()))!=='image/jpeg'))return bad('預覽圖需為600KB以下的JPG');
  const existing=await first('SELECT guest_id AS guestId FROM photos WHERE id=?',id);
  if(existing){if(existing.guestId!==me.id)return bad('上傳識別碼已使用',409);const pending=await first('SELECT value FROM settings WHERE key=?','photoPending:'+id);if(pending){if(Number(pending.value)<now()-30*60*1000){await cleanupPendingPhotos();return bad('上傳已逾時，請再按上傳重試',410)}return bad('這張照片仍在處理，請稍後再試',409);}return good({ok:true,id,alreadyUploaded:true});}
  await cleanupPendingPhotos();
  const size=original.size+(preview?.size||0),time=now();
  const [reserved]=await db().batch([
    db().prepare(`INSERT INTO photos (id,guest_id,name,type,created_at) SELECT ?,?,?,?,?
      WHERE (SELECT COUNT(*) FROM photos WHERE guest_id=?)<? AND (SELECT COALESCE(SUM(size),0) FROM media)+?<=?
      ON CONFLICT(id) DO NOTHING`).bind(id,me.id,me.name,type,time,me.id,photoLimit,size,mediaLimit),
    db().prepare(`INSERT INTO media (id,data,size) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM photos WHERE id=? AND guest_id=?) ON CONFLICT(id) DO NOTHING`).bind(id,new Uint8Array(),size,id,me.id),
    db().prepare(`INSERT INTO settings (key,value) SELECT ?,? WHERE changes()>0 AND EXISTS(SELECT 1 FROM photos WHERE id=? AND guest_id=?) ON CONFLICT(key) DO NOTHING`).bind('photoPending:'+id,String(time),id,me.id)
  ]);
  if(!reserved.meta.changes){const saved=await first('SELECT guest_id AS guestId FROM photos WHERE id=?',id);if(saved?.guestId===me.id&&!await first('SELECT key FROM settings WHERE key=?','photoPending:'+id))return good({ok:true,id,alreadyUploaded:true});if(Number((await first('SELECT COUNT(*) AS count FROM photos WHERE guest_id=?',me.id))?.count||0)>=photoLimit)return bad('每位賓客最多可上傳20張照片');return bad('相簿容量已滿或同一張仍在處理，請稍後再試',409);}
  try{
    await bucket().put('photos/'+id,original,{httpMetadata:{contentType:type},customMetadata:{originalName:Array.from(filename.replace(/[\r\n/\\]/g,'_')).slice(0,160).join('')}});
    if(preview)await bucket().put('photo-previews/'+id,preview,{httpMetadata:{contentType:'image/jpeg'}});
    const published=await run("DELETE FROM settings WHERE key=? AND EXISTS(SELECT 1 FROM photos WHERE id=? AND guest_id=?)",'photoPending:'+id,id,me.id);
    if(!published.meta.changes)throw Error('上傳已取消，請重新選取照片');
    return good({ok:true,id});
  }catch(error){
    console.error(error);
    await db().batch([db().prepare('DELETE FROM photos WHERE id=? AND guest_id=?').bind(id,me.id),db().prepare('DELETE FROM media WHERE id=?').bind(id),db().prepare('DELETE FROM settings WHERE key=?').bind('photoPending:'+id)]);
    try{await bucket().delete(['photos/'+id,'photo-previews/'+id]);}catch(cleanupError){console.error(cleanupError)}
    return bad('上傳未完成，未占用張數；請稍後重試',500);
  }
}
