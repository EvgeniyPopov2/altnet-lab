(() => {
  let dialog, photo, caption, counter, previous, next, zoom, stage, opener;
  let group = [], index = 0;
  function button(label, action) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', action);
    return element;
  }
  function setZoom(on) {
    stage.dataset.zoomed = String(on);
    zoom.setAttribute('aria-pressed', String(on));
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
  }
  function show(position) {
    index = (position + group.length) % group.length;
    const image = group[index].querySelector('img');
    photo.src = image.currentSrc || image.getAttribute('src');
    photo.alt = image.alt;
    caption.textContent = group[index].closest('figure')?.querySelector('figcaption')?.textContent || '';
    counter.textContent = group.length > 1 ? (index + 1) + ' / ' + group.length : '';
    previous.hidden = next.hidden = group.length < 2;
    setZoom(false);
  }
  function createDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'sb-lightbox';
    dialog.setAttribute('aria-label', 'Просмотр изображения');
    const toolbar = document.createElement('div');
    toolbar.className = 'sb-lightbox-toolbar';
    counter = document.createElement('span');
    counter.setAttribute('role', 'status');
    previous = button('Предыдущее', () => show(index - 1));
    next = button('Следующее', () => show(index + 1));
    zoom = button('Масштаб 100%', () => setZoom(stage.dataset.zoomed !== 'true'));
    const close = button('Закрыть', () => dialog.close());
    close.autofocus = true;
    toolbar.append(counter, previous, next, zoom, close);
    stage = document.createElement('div');
    stage.className = 'sb-lightbox-stage';
    photo = document.createElement('img');
    photo.referrerPolicy = 'no-referrer';
    stage.append(photo);
    caption = document.createElement('p');
    caption.className = 'sb-lightbox-caption';
    dialog.append(toolbar, stage, caption);
    dialog.addEventListener('keydown', event => {
      if (group.length < 2 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      event.preventDefault();
      show(index + (event.key === 'ArrowRight' ? 1 : -1));
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog || event.target === stage) dialog.close();
    });
    dialog.addEventListener('close', () => {
      photo.removeAttribute('src');
      group = [];
      if (opener?.isConnected) opener.focus();
    });
    document.body.append(dialog);
  }
  document.addEventListener('click', event => {
    const target = event.target instanceof Element && event.target.closest('[data-lightbox-open]');
    if (!target || !target.querySelector('img[src]:not([src=""])')) return;
    if (!dialog) createDialog();
    if (dialog.open) return;
    opener = target;
    const gallery = target.closest('[data-lightbox-group]');
    group = gallery ? Array.from(gallery.querySelectorAll('[data-lightbox-open]')).filter(item =>
      item.closest('[data-lightbox-group]') === gallery && item.querySelector('img[src]:not([src=""])')) : [target];
    show(group.indexOf(target));
    dialog.showModal();
  });
})();
