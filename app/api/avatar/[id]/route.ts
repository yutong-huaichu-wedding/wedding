import { bucket, first } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const row = await first('SELECT id FROM guests WHERE avatar_kind=? AND avatar_value=?', 'photo', id);
  if (!row) return new Response('Not found', { status: 404 });
  const object = await bucket().get('avatars/' + id);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public,max-age=3600', 'x-content-type-options': 'nosniff' } });
}
