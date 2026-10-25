/* Decorative light and one-time entrances only. No scroll driver, storage,
   analytics or tool behavior. The complete page is the unenhanced state. */
(() => {
  'use strict';
  const page = document.querySelector('.site-atmosphere');
  if (!page || typeof window.IntersectionObserver !== 'function' || !window.matchMedia) return;
  const hero = page.querySelector('.hero');
  if (!hero) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const printPreference = window.matchMedia('print');
  const sections = [...page.querySelectorAll('.hero, .close')];
  const active = new Map();
  const observers = [];
  let dead = false;
  let paused = false;
  let printing = printPreference.matches;
  let controls;
  let toggle;
  let label;

  const canMove = () => !dead && !paused && !preference.matches && !document.hidden && !printing;
  const finishEntrances = target => {
    for (const [element, animation] of active) {
      if (target && element !== target) continue;
      animation.cancel();
      active.delete(element);
    }
  };
  const sync = () => {
    page.classList.toggle('atmosphere-motion', canMove());
    if (controls) controls.hidden = dead || preference.matches || printing;
    if (toggle) toggle.setAttribute('aria-pressed', String(paused));
    if (label) label.textContent = paused ? 'Resume motion' : 'Pause motion';
    if (!canMove()) finishEntrances();
  };
  const failQuietly = () => {
    dead = true;
    page.classList.remove('atmosphere-motion');
    for (const observer of observers) observer.disconnect();
    finishEntrances();
    controls?.remove();
  };

  try {
    const fogObserver = new IntersectionObserver(entries => {
      if (dead) return;
      for (const entry of entries) entry.target.classList.toggle('atmosphere-in-view', entry.isIntersecting);
    });
    observers.push(fogObserver);
    for (const section of sections) fogObserver.observe(section);

    const entered = new WeakSet();
    const entranceObserver = new IntersectionObserver(entries => {
      try {
        if (dead) return;
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
      } catch (_) { failQuietly(); }
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
    observers.push(entranceObserver);
    // Tool controls, results and charts are deliberately outside this set.
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

    controls = document.createElement('div');
    controls.className = 'atmosphere-controls no-print';
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'atmosphere-toggle';
    toggle.setAttribute('aria-pressed', 'false');
    const icon = document.createElement('span');
    icon.className = 'atmosphere-toggle-icon';
    icon.setAttribute('aria-hidden', 'true');
    label = document.createElement('span');
    label.setAttribute('data-atmosphere-label', '');
    label.textContent = 'Pause motion';
    toggle.append(icon, label);
    controls.append(toggle);
    hero.append(controls);
    toggle.addEventListener('click', () => { paused = !paused; sync(); });
    document.addEventListener('visibilitychange', sync);
    const watch = (query, callback) => {
      if (query.addEventListener) query.addEventListener('change', callback);
      else if (query.addListener) query.addListener(callback);
    };
    watch(preference, sync);
    watch(printPreference, () => { printing = printPreference.matches; sync(); });
    window.addEventListener('beforeprint', () => { printing = true; sync(); });
    window.addEventListener('afterprint', () => { printing = printPreference.matches; sync(); });
    sync();
  } catch (_) { failQuietly(); }
})();
