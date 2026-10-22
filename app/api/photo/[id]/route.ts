import { bucket, first } from '@/lib/wedding';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
  const row = await first("SELECT type FROM photos WHERE id=? AND NOT EXISTS(SELECT 1 FROM settings WHERE key='photoPending:'||photos.id)", id);
  if (!row) return new Response('Not found', { status: 404 });
  const params=new URL(request.url).searchParams,preview=params.get('preview')==='1'&&params.get('download')!=='1',download=params.get('download')==='1';
  let object=preview?await bucket().get('photo-previews/'+id):null;const isPreview=!!object;
  if(!object)object=await bucket().get('photos/'+id);
  if (!object) return new Response('Not found', { status: 404 });
  const headers:Record<string,string>={'content-type':isPreview?'image/jpeg':row.type,'cache-control':'public,max-age=3600','x-content-type-options':'nosniff'};
  if(download){const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic'} as Record<string,string>)[row.type]||'jpg';const name=object.customMetadata?.originalName||'wedding-'+id+'.'+ext;headers['content-disposition']='attachment; filename="wedding-'+id+'.'+ext+'"; filename*=UTF-8\'\''+encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());}
  return new Response(object.body,{headers});
}
