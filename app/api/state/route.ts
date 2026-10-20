import { state, bad } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { try { return await state(request); } catch (error) { console.error(error); return bad('讀取資料失敗', 500); } }
