import { readCatMedia } from '@/lib/cat-live';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return readCatMedia(request, (await context.params).id);
}
