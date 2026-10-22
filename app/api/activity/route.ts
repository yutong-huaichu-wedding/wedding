import { readActivity, bad } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function GET() { try { return await readActivity(); } catch { return bad('活動連線暫時中斷', 500); } }
