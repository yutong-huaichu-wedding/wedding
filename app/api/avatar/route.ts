import { bucket, guest, bad, good, run, sameOrigin } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return bad('來源不符', 403);
    const me = await guest(request);
    if (!me) return bad('請先報到', 401);
    if ((request.headers.get('content-type') || '').split(';')[0] !== 'image/jpeg') return bad('頭像請使用 JPG 格式');
    const size = Number(request.headers.get('content-length') || 0);
    if (size > 1024 * 1024) return bad('頭像請縮小至 1MB 以下');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length < 16 || bytes.length > 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return bad('頭像圖片無效');
    const id = crypto.randomUUID();
    await bucket().put('avatars/' + id, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
    try { await run('UPDATE guests SET avatar_kind=?,avatar_value=? WHERE id=?', 'photo', id, me.id); }
    catch (error) { await bucket().delete('avatars/' + id); throw error; }
    if (me.avatarKind === 'photo' && me.avatarValue) {
      try { await bucket().delete('avatars/' + me.avatarValue); } catch (error) { console.error(error); }
    }
    return good({ ok: true, id });
  } catch (error) { console.error(error); return bad('頭像上傳失敗', 500); }
}
