import { uploadWeddingPhoto, bad } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { try { return await uploadWeddingPhoto(request); } catch(error) { console.error(error);return bad('照片上傳失敗，請稍後重試',500); } }
