/* Shared decorative motion only. The full page is the unenhanced state;
   tools, audio, navigation, storage and analytics are outside this controller. */
(() => {
  'use strict';
  const page = document.querySelector('.site-fog-page');
  if (!page || !page.querySelector('.site-fog') || !window.matchMedia) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const printPreference = window.matchMedia('print');
  const controls = page.querySelector('.atmosphere-controls');
  const toggle = page.querySelector('.ex-motion-toggle, .atmosphere-toggle');
  const label = toggle?.querySelector('[data-motion-label], [data-atmosphere-label]');
  const active = new Map();
  let paused = false;
  let suspended = false;
  let printing = printPreference.matches;
  let entranceObserver;
  const canMove = () => !paused && !suspended && !preference.matches && !document.hidden && !printing;
  const finishEntrances = target => {
    for (const [element, animation] of active) {
      if (target && target !== element) continue;
      animation.cancel();
      active.delete(element);
    }
  };
  const sync = () => {
    // Removing this class pauses CSS animation at its current time.
    page.classList.toggle('fog-motion', canMove());
    const hideControl = preference.matches || printing;
    if (controls) controls.hidden = hideControl;
    if (toggle) {
      toggle.hidden = hideControl;
      toggle.setAttribute('aria-pressed', String(paused));
    }
    if (label) label.textContent = paused ? 'Resume motion' : 'Pause motion';
    if (!canMove()) finishEntrances();
  };
  toggle?.addEventListener('click', () => { paused = !paused; sync(); });
  document.addEventListener('visibilitychange', sync);
  const watch = (query, callback) => {
    if (query.addEventListener) query.addEventListener('change', callback);
    else if (query.addListener) query.addListener(callback);
  };
  watch(preference, sync);
  watch(printPreference, () => { printing = printPreference.matches; sync(); });
  window.addEventListener('beforeprint', () => { printing = true; sync(); });
  window.addEventListener('afterprint', () => { printing = printPreference.matches; sync(); });
  window.addEventListener('pagehide', () => { suspended = true; sync(); });
  window.addEventListener('pageshow', () => { suspended = false; sync(); });
  sync();

  // Entrances are optional and one-time. A failed/missing observer leaves all
  // copy visible, and does not interrupt the independently bounded fog layer.
  if (typeof window.IntersectionObserver !== 'function') return;
  const entered = new WeakSet();
  const stopEntrances = () => { entranceObserver?.disconnect(); finishEntrances(); };
  try {
    entranceObserver = new IntersectionObserver(entries => {
      try {
        for (const entry of entries) {
          const target = entry.target;
          if (!entry.isIntersecting) {
            finishEntrances(target);
            if (entered.has(target)) entranceObserver.unobserve(target);
            continue;
          }
          if (entered.has(target)) continue;
          entered.add(target);
          if (!canMove() || typeof target.animate !== 'function') {
            entranceObserver.unobserve(target);
            continue;
          }
          const animation = target.animate([
            { opacity: .48, translate: '0 18px' },
            { opacity: 1, translate: '0 0' }
          ], { duration: 800, easing: 'cubic-bezier(.2,.65,.3,1)' });
          active.set(target, animation);
          animation.onfinish = () => {
            active.delete(target);
            entranceObserver.unobserve(target);
          };
        }
      } catch (_) { stopEntrances(); }
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
    const targets = new Set(page.querySelectorAll('.hero h1, .hero > p:not(.kicker), .editorial-copy, .moment > .art, .moment > .native-capture, .close > h2, .close > p, .onwards > .onward-row'));
    for (const section of page.querySelectorAll('.moment')) {
      if (!section.querySelector('.editorial-copy')) {
        for (const target of targets) if (section.contains(target)) targets.delete(target);
        targets.add(section);
      }
    }
    for (const target of targets) {
      if (!target.closest('.tool') && !target.querySelector('input, textarea, select, button')) entranceObserver.observe(target);
    }
    for (const target of page.querySelectorAll('.ex-editorial-head, .ex-workspace, .ex-tools-layout, .ex-openmic-head, .ex-social-scene, .ex-room-copy, .ex-room-visual, .ex-stage-head, .ex-stands, .ex-practice-link, .ex-ownership>div, .ex-account-copy, .ex-app-capture, .ex-availability, .ex-invitation>.ex-container')) {
      entranceObserver.observe(target);
    }
  } catch (_) { stopEntrances(); }
})();
