/* Local illustration controls only. No audio, uploads, storage or analytics. */
(() => {
  'use strict';
  const demo = document.querySelector('[data-song-demo]');
  if (!demo) return;
  const nav = demo.querySelector('.ex-scene-nav');
  const tabs = [...demo.querySelectorAll('[data-scene]')];
  const panels = [...demo.querySelectorAll('[data-panel]')];
  if (!nav || tabs.length !== panels.length || !tabs.length) return;
  function show(name, focus = false) {
    const active = tabs.find(tab => tab.dataset.scene === name);
    if (!active) return;
    for (const tab of tabs) {
      const selected = tab === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
    if (focus) active.focus();
  }
  nav.setAttribute('role', 'tablist');
  for (const tab of tabs) {
    tab.setAttribute('role', 'tab');
    tab.id = `ex-tab-${tab.dataset.scene}`;
    const panel = panels.find(item => item.dataset.panel === tab.dataset.scene);
    tab.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    tab.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      show(tab.dataset.scene);
    });
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else if (event.key === ' ') next = index;
      else return;
      event.preventDefault();
      show(tabs[next].dataset.scene, true);
    });
  }
  const hashTarget = () => {
    try { return document.getElementById(decodeURIComponent(location.hash.slice(1))); }
    catch (_) { return null; }
  };
  const fromHash = () => {
    const panel = hashTarget()?.closest('[data-panel]');
    return panels.includes(panel) ? panel : null;
  };
  show(fromHash()?.dataset.panel || 'capture');
  window.addEventListener('hashchange', () => {
    const panel = fromHash();
    if (panel) {
      show(panel.dataset.panel);
      hashTarget().scrollIntoView();
    }
  });
  const reading = demo.querySelector('[data-reading-controls]');
  if (reading) {
    reading.hidden = false;
    reading.addEventListener('click', event => {
      const button = event.target.closest('button[data-reading]');
      if (!button) return;
      const numbers = button.dataset.reading === 'numbers';
      for (const chord of demo.querySelectorAll('[data-letter]')) {
        chord.textContent = numbers ? chord.dataset.number : chord.dataset.letter;
      }
      for (const choice of reading.querySelectorAll('button')) choice.setAttribute('aria-pressed', String(choice === button));
    });
  }
})();

/* Atmospheric movement and one-time entrances are progressive enhancements. */
(() => {
  'use strict';
  const page = document.querySelector('.home-experience');
  if (!page) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = page.querySelector('.ex-motion-toggle');
  const label = toggle?.querySelector('[data-motion-label]');
  const fog = [...page.querySelectorAll('.ex-atmosphere')];
  const entrances = new Set();
  let paused = false;

  const finishEntrances = () => {
    for (const animation of entrances) animation.cancel();
    entrances.clear();
  };
  const syncMotion = () => {
    page.classList.toggle('ex-motion-enabled', !paused && !preference.matches && !document.hidden);
    if (toggle) {
      toggle.hidden = preference.matches;
      toggle.setAttribute('aria-pressed', String(paused));
      if (label) label.textContent = paused ? 'Resume motion' : 'Pause motion';
    }
    if (paused || preference.matches || document.hidden) finishEntrances();
  };
  toggle?.addEventListener('click', () => {
    paused = !paused;
    syncMotion();
  });
  document.addEventListener('visibilitychange', syncMotion);
  preference.addEventListener('change', syncMotion);

  // With no observer support the light remains still, and every section is visible.
  if ('IntersectionObserver' in window) {
    // Observe the section: its clipped fog layer can extend beyond its bounds.
    const sectionObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.querySelector('.ex-atmosphere')?.classList.toggle('is-in-view', entry.isIntersecting);
      }
    });
    for (const layer of fog) sectionObserver.observe(layer.parentElement);

    const revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        revealObserver.unobserve(entry.target);
        if (paused || preference.matches || document.hidden || !entry.target.animate) continue;
        const animation = entry.target.animate([
          {opacity: .38, translate: '0 22px'},
          {opacity: 1, translate: '0 0'}
        ], {duration: 850, easing: 'cubic-bezier(.2,.65,.3,1)'});
        entrances.add(animation);
        animation.onfinish = () => entrances.delete(animation);
      }
    }, {threshold: 0, rootMargin: '0px 0px -32px 0px'});
    for (const item of page.querySelectorAll('.ex-editorial-head, .ex-workspace, .ex-tools-layout, .ex-openmic-head, .ex-social-scene, .ex-room-copy, .ex-room-visual, .ex-stage-head, .ex-stands, .ex-practice-link, .ex-ownership>div, .ex-account-copy, .ex-app-capture, .ex-availability, .ex-invitation>.ex-container')) {
      revealObserver.observe(item);
    }
  }
  syncMotion();
})();
