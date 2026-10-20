import { bucket, first } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const row = await first('SELECT type FROM photos WHERE id=?', id);
  if (!row) return new Response('Not found', { status: 404 });
  const object = await bucket().get('photos/' + id);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: { 'content-type': row.type, 'cache-control': 'public,max-age=3600', 'x-content-type-options': 'nosniff' } });
}
