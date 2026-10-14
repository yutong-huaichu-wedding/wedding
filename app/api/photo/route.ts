import { bucket, db, guest, bad, good, now, first, sameOrigin, mediaBytes, mediaLimit } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return bad('來源不符', 403);
    const me = await guest(request); if (!me) return bad('請先報到', 401);
    const type = (request.headers.get('content-type') || '').split(';')[0];
    if (!['image/jpeg','image/png','image/webp'].includes(type)) return bad('僅接受 JPG、PNG 或 WebP');
    const size = Number(request.headers.get('content-length') || 0);
    if (size > 600*1024) return bad('照片請壓縮至 600KB 以下');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > 600*1024) return bad('照片大小無效');
    const count = Number((await first('SELECT COUNT(*) AS total FROM photos WHERE guest_id=?', me.id))?.total || 0);
    if (count >= 4) return bad('每位賓客最多可上傳 4 張照片');
    if (await mediaBytes() + bytes.length > mediaLimit) return bad('相簿儲存空間已滿');
    const id = crypto.randomUUID();
    await bucket().put('photos/' + id, bytes, { httpMetadata: { contentType: type } });
    try {
      await db().batch([
        db().prepare('INSERT INTO media (id,data,size) VALUES (?,?,?)').bind(id, new Uint8Array(), bytes.length),
        db().prepare('INSERT INTO photos (id,guest_id,name,type,created_at) VALUES (?,?,?,?,?)').bind(id, me.id, me.name, type, now())
      ]);
    } catch (error) { await bucket().delete('photos/' + id); throw error; }
    return good({ ok: true, id });
  } catch (error) { console.error(error); return bad('照片上傳失敗', 500); }
}
