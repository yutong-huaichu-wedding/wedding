import { readBuzzer, bad } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function GET() { try { return await readBuzzer(); } catch { return bad('搶答連線暫時中斷', 500); } }
