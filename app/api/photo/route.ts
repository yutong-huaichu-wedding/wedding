import { bucket, guest, bad, good, now, run, sameOrigin } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return bad('來源不符', 403);
    const me = await guest(request); if (!me) return bad('請先報到', 401);
    const type = (request.headers.get('content-type') || '').split(';')[0];
    if (!['image/jpeg','image/png','image/webp'].includes(type)) return bad('僅接受 JPG、PNG 或 WebP');
    const size = Number(request.headers.get('content-length') || 0);
    if (size > 2*1024*1024) return bad('照片請壓縮至 2MB 以下');
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 2*1024*1024) return bad('照片大小無效');
    const id = crypto.randomUUID();
    await bucket().put('photos/' + id, bytes, { httpMetadata: { contentType: type } });
    try { await run('INSERT INTO photos (id,guest_id,name,type,created_at) VALUES (?,?,?,?,?)', id, me.id, me.name, type, now()); }
    catch (error) { await bucket().delete('photos/' + id); throw error; }
    return good({ ok: true, id });
  } catch (error) { console.error(error); return bad('照片上傳失敗', 500); }
}
