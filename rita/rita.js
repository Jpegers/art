(function() {
  const bg = document.querySelector('.rita-bg');
  if (!bg) return;

  const els = Array.from(document.querySelectorAll('.floaty'));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function onMove(e) {
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    const x = (e.clientX / w) * 2 - 1;
    const y = (e.clientY / h) * 2 - 1;

    els.forEach((el, i) => {
      const depth = (i + 1) * 6; // px
      const tx = clamp(x * depth, -24, 24);
      const ty = clamp(y * depth, -24, 24);
      el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    });
  }

  // Desktop pointer
  window.addEventListener('mousemove', onMove, { passive: true });

  // Mobile subtle drift: animate via requestAnimationFrame
  let t = 0;
  function tick() {
    t += 0.004;
    const x = Math.sin(t) * 0.45;
    const y = Math.cos(t * 0.9) * 0.35;
    els.forEach((el, i) => {
      const depth = (i + 1) * 5;
      el.dataset.base = el.dataset.base || el.style.transform || '';
      const tx = clamp(x * depth, -18, 18);
      const ty = clamp(y * depth, -18, 18);
      // If user moves pointer, it overrides; but mobile keeps drifting.
      if (!('onmousemove' in window)) {
        el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      }
    });
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();