(() => {
  const panels=Array.from(document.querySelectorAll('dialog[data-popup-options]'));
  if(!panels.length)return;
  let active=null,clicks=0;
  const waiting=[],memory=new Map(),restore=new WeakMap();
  function count(key) {
    try{return Math.max(memory.get(key)||0,Number(sessionStorage.getItem(key))||0);}
    catch{return memory.get(key)||0;}
  }
  function next(){
    if(active || document.hidden)return;
    while(waiting.length){
      const {panel,opener,manual}=waiting.shift(), cfg=panel.settings;
      const device=matchMedia('(max-width:767px)').matches?'mobile':matchMedia('(max-width:1024px)').matches?'tablet':'desktop';
      if(!cfg.devices.includes(device))continue;
      const key='altnet-site-popup:'+panel.id;
      if(!manual && cfg.limit>0 && count(key)>=cfg.limit)continue;
      restore.set(panel,opener || document.activeElement);
      panel.showModal();active=panel;
      if(!manual){const n=count(key)+1;memory.set(key,n);try{sessionStorage.setItem(key,String(n));}catch{/* isolated preview */}}
      panel.querySelector('[data-popup-close]')?.focus();
      break;
    }
  }
  function request(panel,opener,manual=false){
    if((active===panel && panel.open) || waiting.some(row=>row.panel===panel))return;
    waiting.push({panel,opener,manual});next();
  }
  const byId=new Map();
  for(const panel of panels){
    let cfg;
    try{cfg=JSON.parse(panel.dataset.popupOptions);}catch{continue;}
    if(!cfg || !Array.isArray(cfg.triggers) || !Array.isArray(cfg.devices))continue;
    panel.settings=cfg;byId.set(panel.id,panel);
    panel.addEventListener('close',()=>{
      active=null;const prior=restore.get(panel);if(prior?.isConnected)prior.focus();
      queueMicrotask(next);
    });
    panel.addEventListener('click',e=>{
      if(e.target.closest('[data-popup-close]'))panel.close();
      else if(e.target===panel && cfg.backdropClose){
        const r=panel.getBoundingClientRect();
        if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)panel.close();
      }
    });
    if(cfg.triggers.includes('load'))setTimeout(()=>request(panel),cfg.delay*1000);
    if(cfg.triggers.includes('scroll')){
      const onScroll=()=>{const total=document.documentElement.scrollHeight-innerHeight;
        if(total>0 && scrollY*100/total>=cfg.scroll){removeEventListener('scroll',onScroll);request(panel);}};
      addEventListener('scroll',onScroll,{passive:true});onScroll();
    }
    if(cfg.triggers.includes('anchor') && cfg.anchor && 'IntersectionObserver' in window){
      const target=document.getElementById(cfg.anchor);
      if(target){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();request(panel);}});observer.observe(target);}
    }
    if(cfg.triggers.includes('exit')){
      const exit=e=>{if(!e.relatedTarget && e.clientY<=0){document.removeEventListener('mouseout',exit);request(panel);}};
      document.addEventListener('mouseout',exit);
    }
    if(cfg.triggers.includes('idle')){
      let timer;
      const events=['pointerdown','keydown','scroll','visibilitychange'];
      function reset(){clearTimeout(timer);if(!document.hidden)timer=setTimeout(()=>{events.forEach(name=>document.removeEventListener(name,reset));request(panel);},cfg.idle*1000);}
      events.forEach(name=>document.addEventListener(name,reset,{passive:true}));reset();
    }
  }
  document.addEventListener('click',e=>{
    if(!(e.target instanceof Element))return;
    const href=e.target.closest('a')?.getAttribute('href');
    if(href?.startsWith('#') && byId.has(href.slice(1))){
      e.preventDefault();request(byId.get(href.slice(1)),e.target.closest('a'),true);return;
    }
    if(active)return;
    clicks++;
    for(const panel of byId.values())if(panel.settings.triggers.includes('clicks') && clicks===panel.settings.clicks)request(panel);
  });
  document.addEventListener('visibilitychange',next);
})();
