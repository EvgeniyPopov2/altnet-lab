(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-alt-animation]').forEach(root => {
    const source = root.querySelector('template[data-animation-json]');
    const stage = root.querySelector('[data-animation-stage]');
    const button = root.querySelector('[data-animation-command]');
    if (!source || !stage || !button || !window.lottie) return;
    let options;
    try { options = JSON.parse(root.dataset.altAnimation); } catch { return; }
    let player, ready = false, visible = false, wanted = options.trigger === 'viewport', direction = options.reverse ? -1 : 1;
    let frames = 1, from = 0, to = 0, scrollFrame = 0;
    function error() {
      button.disabled = true;
      button.textContent = 'Не удалось воспроизвести анимацию';
    }
    function scrollPosition() {
      scrollFrame = 0;
      if (!ready || !visible || document.hidden || motion.matches) return;
      const rect = root.getBoundingClientRect();
      const progress = Math.min(1,Math.max(0,(innerHeight - rect.top) / (innerHeight + rect.height)));
      player.goToAndStop((options.reverse ? 1-progress : progress) * (to-from), true);
    }
    function scroll() {
      if (visible && !scrollFrame && !document.hidden && !motion.matches) scrollFrame = requestAnimationFrame(scrollPosition);
    }
    function update() {
      if (!ready) return;
      const play = visible && !document.hidden && wanted;
      if (play) { player.setDirection(direction); player.play(); } else player.pause();
      button.setAttribute('aria-pressed', String(play));
      button.textContent = play ? 'Приостановить' : 'Воспроизвести';
      if (options.trigger === 'scroll' && !wanted) scroll();
    }
    function load() {
      if (player || button.disabled) return;
      try {
        player = window.lottie.loadAnimation({ container: stage, renderer: 'svg', autoplay: false, loop: options.loop,
          animationData: JSON.parse(source.content.textContent), rendererSettings: { progressiveLoad: false, preserveAspectRatio: 'xMidYMid meet' } });
        player.addEventListener('data_failed', error);
        player.addEventListener('error', error);
        player.addEventListener('DOMLoaded', () => {
          frames = player.getDuration(true);
          from = Math.max(0,Math.floor(frames*options.start/100));
          to = Math.max(from+1,Math.ceil(frames*options.end/100));
          player.setSegment(from+player.firstFrame,to+player.firstFrame);
          player.goToAndStop(options.reverse ? to-from-1 : 0, true);
          player.setSpeed(options.speed);
          root.querySelector('[data-animation-poster]')?.remove();
          ready = true;
          if (motion.matches) wanted = false;
          update();
        });
        player.addEventListener('complete', () => { wanted = false; direction = options.reverse ? -1 : 1; update(); });
      } catch { error(); }
    }
    button.addEventListener('click', () => {
      load();
      wanted = !wanted;
      direction = options.reverse ? -1 : 1;
      if (wanted && ready && (direction === 1 ? player.currentFrame >= player.totalFrames-1 : player.currentFrame <= 0))
        player.goToAndStop(direction === 1 ? 0 : player.totalFrames-1, true);
      update();
    });
    if (options.trigger === 'hover') {
      const enter = () => { if (motion.matches) return; load(); wanted = true; direction = options.reverse ? -1 : 1; update(); };
      const leave = () => {
        if (!ready || options.hoverOut === 'continue') return;
        if (options.hoverOut === 'reverse') { direction = options.reverse ? 1 : -1; }
        else { wanted = false; if (options.hoverOut === 'stop') player.goToAndStop(options.reverse ? to-from-1 : 0,true); }
        update();
      };
      stage.addEventListener('pointerenter',enter); stage.addEventListener('pointerleave',leave);
    }
    if (options.trigger === 'scroll') window.addEventListener('scroll',scroll,{passive:true});
    if (options.trigger === 'click') stage.addEventListener('click', () => button.click());
    document.addEventListener('visibilitychange',update);
    motion.addEventListener('change', () => { wanted = !motion.matches && options.trigger === 'viewport'; update(); });
    if ('IntersectionObserver' in window) {
      const threshold = options.threshold/100;
      const observer = new IntersectionObserver(entries => {
        const entry = entries[entries.length-1];
        visible = entry.isIntersecting && entry.intersectionRatio >= threshold;
        if (visible) load();
        update();
      },{threshold:[threshold]});
      observer.observe(stage);
    } else { visible = true; load(); }
    if (!options.lazy) load();
  });
})();
