(function(){
 if(!/Line\//i.test(navigator.userAgent))return;
 const params=new URLSearchParams(location.search);if(['display','screen','host'].some(key=>params.get(key)==='1'))return;
 try{if(localStorage.getItem('wedding_1212_guest_token'))return}catch{}
 const url=new URL(location.href);url.searchParams.set('openExternalBrowser','1');
 const notice=document.createElement('aside');notice.className='line-browser-notice';notice.setAttribute('role','note');
 const text=document.createElement('span');text.textContent='報到前建議先用 Safari／Chrome 開啟，整晚可沿用同一個瀏覽器參加。';
 const link=document.createElement('a');link.href=url.href;link.textContent='用外部瀏覽器開啟';
 const hint=document.createElement('small');hint.textContent='若仍留在 LINE，請從右上角選單選擇用預設瀏覽器開啟。';
 notice.append(text,link,hint);document.body.prepend(notice);
})();
