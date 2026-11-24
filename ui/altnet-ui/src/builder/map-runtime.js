document.addEventListener('click', event => {
  const button = event.target instanceof Element && event.target.closest('button[data-map-open]');
  if (!button) return;
  const root = button.closest('.sb-map'), view = root?.querySelector('.sb-map-view');
  if (!view) return;
  let url;
  try { url = new URL(button.dataset.mapOpen); } catch { return; }
  if (url.origin !== 'https://www.openstreetmap.org' || url.pathname !== '/export/embed.html') return;
  const frame = document.createElement('iframe');
  frame.title = 'Подробная карта OpenStreetMap';
  frame.referrerPolicy = 'no-referrer';
  frame.setAttribute('sandbox','allow-scripts allow-same-origin');
  frame.src = url.href;
  view.replaceChildren(frame);
  button.remove();
  frame.focus();
});
