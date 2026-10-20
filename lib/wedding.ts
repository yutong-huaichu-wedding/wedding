
import { env } from 'cloudflare:workers';

type Row = Record<string, any>;
export const db = () => { if (!env.DB) throw new Error('Database unavailable'); return env.DB; };
export const bucket = () => { if (!env.BUCKET) throw new Error('Photo storage unavailable'); return env.BUCKET; };
export const mediaLimit = 1024 * 1024 * 1024;
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
export const lotteryDefault = { status: 'open', result: [] as number[], startedAt: 0 };
export const quizDefault = { index: -1, open: false };
export const mahjongDefault = { phase: 'guess' };
export const kahootDefault = { url: 'https://kahoot.it/', pin: '' };
export function validKahootUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && ['kahoot.it','www.kahoot.it'].includes(url.hostname) && !url.username && !url.password && (!url.port || url.port === '443') ? url.href : null; } catch { return null; }
}
export const avatarPresets = ['cat','rabbit','bear','panda','fox','chick','frog','penguin','dog','koala','hamster','tiger','lion','pig','monkey','owl','unicorn','butterfly','sunflower','cherry','heart','star','cake'];

// Participation and each question's roster live in settings; no migration or data reset.
const participantKey = (id: string) => 'quizParticipant:' + id;
const closeCompletedQuiz = () => db().prepare(`
  UPDATE settings SET value=json_set(value,'$.open',json('false'))
  WHERE key='quiz' AND json_extract(value,'$.open')=1
    AND json_array_length(value,'$.participants')>0
    AND NOT EXISTS (
      SELECT 1 FROM json_each(settings.value,'$.participants') p
      WHERE NOT EXISTS (SELECT 1 FROM answers a WHERE a.guest_id=p.value
        AND a.question_id=json_extract(settings.value,'$.questionId'))
    )`);

export async function state(request: Request) {
  const admin = await isAdmin(request);
  const me = await guest(request);
  const [blessings, photos, questions, tickets, guests, lotto, quiz, mahjong, kahoot] = await Promise.all([
    all('SELECT b.id,b.name,b.text,b.created_at AS time,g.avatar_kind AS avatarKind,g.avatar_value AS avatarValue FROM blessings b LEFT JOIN guests g ON g.id=b.guest_id ORDER BY b.created_at DESC LIMIT 150'),
    all('SELECT id,name,created_at AS time FROM photos ORDER BY created_at DESC LIMIT 150'),
    all('SELECT id,text,options,correct,position FROM questions ORDER BY position,id'),
    all('SELECT id,guest_id AS guestId,name,numbers,created_at AS time FROM tickets ORDER BY created_at'),
    admin ? all('SELECT id,name,avatar_kind AS avatarKind,avatar_value AS avatarValue,created_at AS time FROM guests ORDER BY created_at') : Promise.resolve([]),
    setting('lottery', lotteryDefault),
    setting('quiz', quizDefault),
    setting('mahjong', mahjongDefault),
    setting('kahoot', kahootDefault)
  ]);
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
  const myScore = me ? await first('SELECT COUNT(*) AS score FROM answers WHERE guest_id=? AND correct=1', me.id) : null;
  const scores = admin ? await all('SELECT g.name,g.avatar_kind AS avatarKind,g.avatar_value AS avatarValue,COUNT(a.id)*10 AS score FROM guests g JOIN answers a ON a.guest_id=g.id AND a.correct=1 GROUP BY g.id ORDER BY score DESC,g.created_at LIMIT 30') : [];
  return good({
    mahjong, kahoot,
    admin, me: me ? { id: me.id, name: me.name, avatarKind: me.avatarKind, avatarValue: me.avatarValue } : null,
    blessings: blessings.reverse(), photos: photos.reverse().map(p => ({ ...p, url: '/api/photo/' + p.id })),
    lottery: { ...lotto, winners, ticketCount: parsedTickets.length },
    myTicket: me ? parsedTickets.find(t => t.guestId === me.id) || null : null,
    quiz: { ...publicQuiz, joined, eligible: !!me && roster.includes(me.id), participantCount: Number(participantCount?.count || 0), answeredCount: Number(answeredCount?.count || 0), totalParticipants: roster.length, question: currentQuestion, total: questions.length, myAnswer: myAnswer?.choice ?? null, myScore: Number(myScore?.score || 0) * 10 },
    ...(admin ? { guests, tickets: parsedTickets, questions: questions.map(q => ({ ...q, options: JSON.parse(q.options) })), scores } : {})
  });
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
  if (type === 'profileUpdate') {
    if (!me) return bad('請先報到', 401);
    const name = clean(body.name, 25);
    if (name.length < 2) return bad('請輸入至少兩個字的姓名');
    if (name === me.name) return good({ ok: true });
    await db().batch([
      db().prepare('UPDATE guests SET name=? WHERE id=?').bind(name, me.id),
      db().prepare('UPDATE blessings SET name=? WHERE guest_id=?').bind(name, me.id),
      db().prepare('UPDATE photos SET name=? WHERE guest_id=?').bind(name, me.id),
      db().prepare('UPDATE tickets SET name=? WHERE guest_id=?').bind(name, me.id)
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
    const target = type === 'ticket' ? me : await first('SELECT id,name FROM guests WHERE id=?', clean(body.guestId, 80));
    if (!target) return bad('找不到報到賓客');
    const sorted = [...numbers].sort((a,b) => a-b);
    const result = await run("INSERT INTO tickets (id,guest_id,name,numbers,created_at) SELECT ?,?,?,?,? WHERE COALESCE(json_extract((SELECT value FROM settings WHERE key='lottery'),'$.status'),'open')='open' ON CONFLICT(guest_id) DO NOTHING", crypto.randomUUID(), target.id, target.name, JSON.stringify(sorted), now());
    if (!result.meta.changes) return bad('投注已截止，或該賓客已投注');
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
    if (!quiz.open || !q) return bad('目前未開放作答');
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return bad('答案無效');
    if (body.round !== quiz.round || body.questionId !== q.id) return bad('題目已更新，請重新確認後作答');
    if (!Array.isArray(quiz.participants) || !quiz.participants.includes(me.id)) return bad('請先按「我要參賽」，從下一題開始作答');
    const [result] = await db().batch([
      db().prepare(`INSERT INTO answers (id,question_id,guest_id,choice,correct,created_at)
        SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM settings WHERE key='quiz'
          AND json_extract(value,'$.open')=1 AND json_extract(value,'$.round')=?
          AND json_extract(value,'$.questionId')=?
          AND EXISTS (SELECT 1 FROM json_each(settings.value,'$.participants') WHERE value=?))
        ON CONFLICT(question_id,guest_id) DO NOTHING`).bind(crypto.randomUUID(), q.id, me.id, choice, choice === q.correct ? 1 : 0, now(), quiz.round, q.id, me.id),
      closeCompletedQuiz()
    ]);
    if (!result.meta.changes) return bad('已作答，或作答已結束');
    return good({ ok: true });
  }
  if (!admin) return bad('請先登入主持人控制台', 403);
  if (type === 'kahootUpdate') {
    const url = validKahootUrl(body.url), pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!url) return bad('請貼上 https://kahoot.it/ 開頭的遊戲加入連結');
    if (pin && !/^\d{4,10}$/.test(pin)) return bad('PIN 請填 4～10 位數字，或留空');
    await setSetting('kahoot', { url, pin });
    return good({ ok: true });
  }
  if (type === 'mahjongPhase') {
    if (!['guess', 'correct', 'wrong'].includes(body.phase)) return bad('請選擇猜牌、答對或答錯畫面');
    await setSetting('mahjong', { phase: body.phase });
    return good({ ok: true });
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
    const lottery = await setting('lottery', lotteryDefault);
    if (lottery.status !== 'closed') return bad(lottery.status === 'open' ? '請先截止選號，再開始開獎' : '本輪已開獎');
    await setSetting('lottery', { ...lottery, status: 'drawing' });
    const tickets = await all('SELECT numbers FROM tickets ORDER BY created_at');
    if (!tickets.length) { await setSetting('lottery', { ...lottery, status: 'closed' }); return bad('至少要有一張有效彩券'); }
    const random = new Uint32Array(1);
    const limit = Math.floor(4294967296 / tickets.length) * tickets.length;
    do { crypto.getRandomValues(random); } while (random[0] >= limit);
    const picked = tickets[random[0] % tickets.length];
    await setSetting('lottery', { status: 'drawn', result: JSON.parse(picked.numbers), startedAt: now() });
    return good({ ok: true });
  }
  if (type === 'lottoReset') {
    await run('DELETE FROM tickets');
    await setSetting('lottery', lotteryDefault);
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
    await db().batch([db().prepare('DELETE FROM answers'), db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('quiz', JSON.stringify(quizDefault))]);
    return good({ ok: true });
  }
  if (type === 'blessingDelete') { await run('DELETE FROM blessings WHERE id=?', clean(body.id, 80)); return good({ ok: true }); }
  if (type === 'photoDelete') {
    const id = clean(body.id, 80);
    await run('DELETE FROM photos WHERE id=?', id);
    await bucket().delete('photos/' + id);
    await run('DELETE FROM media WHERE id=?', id);
    return good({ ok: true });
  }
  if (type === 'resetAll') {
    const photos = await all('SELECT id FROM photos');
    const avatars = await all("SELECT avatar_value AS value FROM guests WHERE avatar_kind='photo'");
    await db().batch(["DELETE FROM settings WHERE key LIKE 'quizParticipant:%'",'DELETE FROM answers','DELETE FROM tickets','DELETE FROM blessings','DELETE FROM photos','DELETE FROM guests','DELETE FROM questions'].map(sql => db().prepare(sql)));
    const keys = [...photos.map(photo => 'photos/' + photo.id), ...avatars.map(avatar => 'avatars/' + avatar.value)];
    for (let i = 0; i < keys.length; i += 500) await bucket().delete(keys.slice(i, i + 500));
    await run('DELETE FROM media');
    await setSetting('lottery', lotteryDefault);
    await setSetting('quiz', quizDefault);
    return good({ ok: true });
  }
  return bad('未知操作', 404);
}
