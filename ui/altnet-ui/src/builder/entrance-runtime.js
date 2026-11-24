(()=>{
  const nodes=Array.from(document.querySelectorAll('[data-entrance]'));
  if(!nodes.length||!('IntersectionObserver' in window))return;
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  if(preference.matches)return;
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    const node=entry.target;
    if(entry.isIntersecting){
      node.dataset.entranceState='shown';
      if(getComputedStyle(node).getPropertyValue('--sb-entry-repeat').trim()!=='1')observer.unobserve(node);
    }else if(node.dataset.entranceState==='shown')node.dataset.entranceState='waiting';
  }),{threshold:0});
  nodes.forEach(node=>{node.dataset.entranceState='waiting';observer.observe(node)});
  if(preference.addEventListener)preference.addEventListener('change',event=>{
    if(event.matches){observer.disconnect();nodes.forEach(node=>delete node.dataset.entranceState)}
  });
})();
