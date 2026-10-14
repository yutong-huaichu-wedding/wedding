import { action, bad } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { try { return await action(request); } catch (error) { console.error(error); return bad('操作失敗，請稍後再試', 500); } }
