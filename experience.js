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
