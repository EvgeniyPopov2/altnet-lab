(() => {
  function update(root, requested) {
    const perPage = Math.max(1,Number(root.dataset.loopSize)||6);
    const grid = root.querySelector(':scope > [data-loop-list]');
    if (!grid) return;
    const filter = root.querySelector(':scope > label > [data-loop-filter]')?.value || '';
    const cards = Array.from(grid.children);
    const matches = cards.filter(card => {
      if (!filter) return true;
      try { const tags = JSON.parse(card.dataset.loopTerms || '[]'); return Array.isArray(tags) && tags.includes(filter); }
      catch { return false; }
    });
    const pages = Math.ceil(matches.length / perPage);
    const page = Math.max(0,Math.min(pages-1,requested));
    root.dataset.loopPage = String(page);
    const visible = new Set(matches.slice(page*perPage,(page+1)*perPage));
    cards.forEach(card => { card.hidden = !visible.has(card); });
    const nav = root.querySelector(':scope > nav'), empty = root.querySelector(':scope > [data-loop-empty]');
    if (empty) empty.hidden = !!matches.length;
    if (nav) {
      nav.hidden = pages < 2;
      nav.querySelector('[data-loop-previous]').disabled = page < 1;
      nav.querySelector('[data-loop-next]').disabled = page+1 >= pages;
      nav.querySelector('[role=status]').textContent = (page+1) + ' / ' + pages;
    }
  }
  document.addEventListener('change', event => {
    if (!(event.target instanceof HTMLSelectElement) || !event.target.hasAttribute('data-loop-filter')) return;
    const root=event.target.closest('[data-loop-size]');
    if (root) update(root,0);
  });
  document.addEventListener('click', event => {
    const button=event.target instanceof Element && event.target.closest('button[data-loop-next],button[data-loop-previous]');
    if (!button) return;
    const root=button.closest('[data-loop-size]');
    if (root) update(root,Number(root.dataset.loopPage||0)+(button.hasAttribute('data-loop-next')?1:-1));
  });
})();
