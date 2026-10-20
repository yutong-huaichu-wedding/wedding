import { readProjection, bad } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function GET() { try { return await readProjection(); } catch { return bad('投影連線暫時中斷', 500); } }
