(function(root){
 const $=id=>document.getElementById(id);
 let config={},uploading=false,loading=false,ready=false;
 const completed=new WeakSet(),ids=new WeakMap();
 function render(){const album=config.album?.()||{};if($('photoQuota'))$('photoQuota').textContent='已上傳 '+(album.mine||0)+' / 20 張｜每張原圖最多 30MB，可一次選多張';for(const id of ['photoUpload','photoFile'])if($(id))$(id).disabled=uploading;if($('photoMore')){$('photoMore').hidden=!album.hasMore;$('photoMore').disabled=loading;$('photoMore').textContent=loading?'載入中…':'載入更多照片'}if($('managePhotoMore')){$('managePhotoMore').hidden=!album.hasMore;$('managePhotoMore').disabled=loading}}
 function kind(file){return file.type||(/\.hei[cf]$/i.test(file.name)?'image/heic':/\.jpe?g$/i.test(file.name)?'image/jpeg':/\.png$/i.test(file.name)?'image/png':/\.webp$/i.test(file.name)?'image/webp':'')}
 async function preview(file){
  const source=URL.createObjectURL(file),image=new Image();
  try{
   try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('照片預覽逾時')),25000);image.onload=()=>{clearTimeout(timer);resolve()};image.onerror=()=>{clearTimeout(timer);reject(Error('無法預覽這張照片'))};image.src=source})}
   catch(error){if(!/^image\/hei[cf]/.test(kind(file)))throw error;const canvas=document.createElement('canvas');canvas.width=600;canvas.height=450;const ctx=canvas.getContext('2d');ctx.fillStyle='#e5f2f8';ctx.fillRect(0,0,600,450);ctx.fillStyle='#215b79';ctx.textAlign='center';ctx.font='bold 36px sans-serif';ctx.fillText('HEIC / HEIF',300,200);ctx.font='24px sans-serif';ctx.fillText('下載查看原圖',300,260);return await config.fitJpeg(canvas,600*1024)}
   const scale=Math.min(1,1200/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return await config.fitJpeg(canvas,600*1024);
  }finally{URL.revokeObjectURL(source)}
 }
 async function upload(){
  if(uploading||!config.requireGuest?.())return;const files=[...($('photoFile')?.files||[])].filter(file=>!completed.has(file));if(!files.length)return config.notice?.('請先選擇照片');const remaining=20-(config.album?.().mine||0);if(files.filter(file=>!ids.has(file)).length>remaining)return config.notice?.('目前最多還可上傳 '+Math.max(0,remaining)+' 張，請重新選取');
  uploading=true;render();let success=0;const failed=[];
  try{
   for(const [i,file] of files.entries()){
    $('photoUploadStatus').textContent='正在上傳 '+(i+1)+' / '+files.length+'：'+file.name;
    try{
     if(!['image/jpeg','image/png','image/webp','image/heic','image/heif','image/heic-sequence','image/heif-sequence'].includes(kind(file))||file.size>30*1024*1024)throw Error('需為30MB以下的JPG、PNG、WebP或HEIC／HEIF');
     const thumb=await preview(file),form=new FormData();if(!ids.has(file))ids.set(file,crypto.randomUUID());form.append('original',file,file.name);form.append('preview',thumb,'preview.jpg');form.append('uploadId',ids.get(file));
     const response=await fetch('/api/photo',{method:'POST',credentials:'same-origin',headers:config.authHeaders?.()||{},body:form,signal:AbortSignal.timeout(180000)}),result=await response.json();if(!response.ok){if(response.status===410)ids.delete(file);throw Error(result.error||'上傳失敗')};completed.add(file);success++;
    }catch(error){failed.push(file.name+'：'+error.message)}
   }
   if(!failed.length)$('photoFile').value='';
  }finally{
   uploading=false;await config.refresh?.();render();$('photoUploadStatus').textContent='成功 '+success+' 張'+(failed.length?'；失敗 '+failed.length+' 張。'+failed.join('／'):'，已保留選取的原圖。');config.notice?.(failed.length?'部分照片未完成，可按上傳重試失敗項目':'照片已上傳，謝謝你的分享！');
  }
 }
 async function more(){if(loading)return;loading=true;render();try{config.increaseLimit?.();await config.refresh?.()}finally{loading=false;render()}}
 function init(options){config=options;if(ready)return;ready=true;if($('photoUpload'))$('photoUpload').onclick=upload;if($('photoMore'))$('photoMore').onclick=more;if($('managePhotoMore'))$('managePhotoMore').onclick=more;render()}
 root.WeddingAlbum={init,upload,more,render};
})(window);
