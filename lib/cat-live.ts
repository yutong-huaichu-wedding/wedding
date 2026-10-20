import { bad, good, isAdmin, sameOrigin, setting, db, bucket, setSetting } from './wedding';

const roomPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mediaPattern = /^\/api\/cat-media\/[0-9a-f]{64}$/;
const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const videoTypes = ['video/mp4', 'video/webm'];
const roomKey = (room: string) => 'catLive:' + room;
const empty = { revision: '', state: null, playAt: 0, updatedAt: 0, screenAt: 0 };
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;

type ProjectionState = {
  key: string; prompt: string; total: number; index: number; revealed: boolean; ready: boolean;
  serial: number; volume: number; image: string; answer?: string; name?: string; note?: string;
  answerMedia?: string; answerMediaType?: string; sound?: string; soundType?: string; preloadMedia?: string;
};
export function validProjection(value: unknown): value is ProjectionState {
  if (!value || typeof value !== 'object') return false;
  const s = value as ProjectionState;
  return !!s && text(s.key, 100) && text(s.prompt, 160)
    && Number.isInteger(s.total) && s.total >= 0 && s.total <= 40
    && Number.isInteger(s.index) && s.index >= 0 && (s.total === 0 ? s.index === 0 : s.index < s.total)
    && typeof s.revealed === 'boolean' && typeof s.ready === 'boolean'
    && Number.isSafeInteger(s.serial) && s.serial >= 0
    && typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1
    && (s.image === '' || mediaPattern.test(s.image))
    && (!s.preloadMedia || (typeof s.preloadMedia === 'string' && mediaPattern.test(s.preloadMedia)))
    && (!s.revealed || (text(s.answer, 160) && text(s.name, 80) && text(s.note, 300)
      && (!s.answerMedia || mediaPattern.test(s.answerMedia))
      && (!s.sound || mediaPattern.test(s.sound))
      && (!s.answerMediaType || videoTypes.includes(s.answerMediaType))
      && (!s.soundType || videoTypes.includes(s.soundType))));
}
export async function catLive(request: Request) {
  try {
    const url = new URL(request.url);
    let room = url.searchParams.get('session') || '';
    if (request.method === 'GET' && url.searchParams.get('follow') === '1') {
      const active = await setting('projection', { mode: 'waiting', session: '' });
      if (active.mode !== 'cat' || !roomPattern.test(active.session || '')) return good({ ...empty, active: false, serverNow: Date.now() });
      room = active.session;
    }
    if (!roomPattern.test(room)) return bad('投影連結不完整，請重新複製', 400);
    const key = roomKey(room), time = Date.now();
    if (request.method === 'GET') {
      // Screen presence is scoped to this random room and cannot change game state.
      if (url.searchParams.get('screen') === '1') await db().prepare(
        "UPDATE settings SET value=json_set(value,'$.screenAt',?) WHERE key=? AND COALESCE(json_extract(value,'$.screenAt'),0)<?"
      ).bind(time, key, time - 5000).run();
      const value = await setting(key, empty);
      return good({ ...(time - value.updatedAt > 86400000 ? empty : value), session: room, active: true, serverNow: time });
    }
    if (!sameOrigin(request)) return bad('來源不符', 403);
    if (!await isAdmin(request)) return bad('請先在這支手機登入婚禮主持人控制台，再回來啟用同步', 401);
    if (Number(request.headers.get('content-length')) > 12000) return bad('投影資料太大', 413);
    const raw = await request.text();
    if (raw.length > 12000) return bad('投影資料太大', 413);
    let body; try { body = JSON.parse(raw); } catch { return bad('資料格式錯誤'); }
    const s = body.state;
    if (!validProjection(s)) return bad('投影資料無效');
    // Hidden answer text is excluded. A durable video URL may be sent early
    // solely to preload silently; the player stays hidden until reveal.
    const state = { key: s.key, prompt: s.prompt, total: s.total, index: s.index, revealed: s.revealed,
      ready: s.ready, image: s.image, serial: s.serial, volume: s.volume,
      ...(!s.revealed && s.preloadMedia ? { preloadMedia: s.preloadMedia } : {}),
      ...(s.revealed ? { answer: s.answer, name: s.name, note: s.note, answerMedia: s.answerMedia || '',
        answerMediaType: s.answerMediaType || '', sound: s.sound || '', soundType: s.soundType || '' } : {}) };
    const revision = crypto.randomUUID();
    // Atomic update retains screen heartbeat; no migration and no other wedding settings touched.
    await db().prepare(`INSERT INTO settings (key,value) VALUES (?,json_object('revision',?,'state',json(?),'playAt',?,'updatedAt',?,'screenAt',0))
      ON CONFLICT(key) DO UPDATE SET value=json_set(settings.value,'$.revision',?,'$.state',json(?),
        '$.playAt',CASE WHEN ? THEN ? ELSE COALESCE(json_extract(settings.value,'$.playAt'),0) END,'$.updatedAt',?)`
    ).bind(key, revision, JSON.stringify(state), body.autoplay ? time : 0, time, revision, JSON.stringify(state), body.autoplay ? 1 : 0, time, time).run();
    await setSetting('projection', { mode: 'cat', session: room });
    return good({ ok: true, revision });
  } catch (error) { console.error(error); return bad('投影同步暫時中斷，將自動重連', 500); }
}

export async function uploadCatMedia(request: Request) {
  try {
    if (!sameOrigin(request)) return bad('來源不符', 403);
    if (!await isAdmin(request)) return bad('請先登入婚禮主持人控制台', 401);
    const type = (request.headers.get('content-type') || '').split(';')[0];
    if (![...imageTypes, ...videoTypes].includes(type)) return bad('僅接受圖片及 MP4／WebM 影片');
    const limit = imageTypes.includes(type) ? 8 * 1024 * 1024 : 50 * 1024 * 1024;
    if (Number(request.headers.get('content-length')) > limit) return bad('素材檔案太大', 413);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > limit) return bad('素材檔案大小無效', 413);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const id = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
    const key = 'cat-memes/' + id;
    if (!await bucket().head(key)) await bucket().put(key, bytes, { httpMetadata: { contentType: type } });
    return good({ url: '/api/cat-media/' + id });
  } catch (error) { console.error(error); return bad('素材上傳失敗，請確認連線後重試', 500); }
}

export async function readCatMedia(request: Request, id: string) {
  if (!/^[0-9a-f]{64}$/.test(id)) return new Response('Not found', { status: 404 });
  if (request.method === 'HEAD') {
    const object = await bucket().head('cat-memes/' + id);
    return new Response(null, { status: object ? 200 : 404, headers: { 'cache-control': 'no-store' } });
  }
  // R2 handles byte ranges for Safari and seeking; do not load entire videos into Worker memory.
  const object = await bucket().get('cat-memes/' + id, { range: request.headers });
  if (!object) return new Response('Not found', { status: 404 });
  const headers = new Headers({ 'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
    'cache-control': 'public,max-age=31536000,immutable', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' });
  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range) {
    const offset = range.suffix !== undefined ? Math.max(0, object.size - range.suffix) : range.offset || 0;
    const length = Math.min(range.suffix ?? range.length ?? object.size - offset, object.size - offset);
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
}
