document.addEventListener('click',event=>{
  const button=event.target instanceof Element && event.target.closest('button[data-soundcloud-player]');
  if(!button)return;
  let url;
  try{url=new URL(button.dataset.soundcloudPlayer);}catch{return;}
  if(url.origin!=='https://w.soundcloud.com' || url.pathname!=='/player/' || url.username || url.password)return;
  const frame=document.createElement('iframe');
  frame.title=button.closest('figure')?.querySelector('figcaption')?.textContent || 'SoundCloud';
  frame.referrerPolicy='no-referrer';
  frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups');
  frame.setAttribute('allow','autoplay');
  frame.width='100%';
  frame.height=url.searchParams.get('visual')==='true'?'400':'166';
  frame.src=url.href;
  button.replaceWith(frame);frame.focus();
});
