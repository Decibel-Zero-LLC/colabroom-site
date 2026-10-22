/* Native details works without JavaScript. Escape and outside click are
   small conveniences; no tracking, routing or application state. */
(() => {
  const menu = document.querySelector('.site-menu');
  if (!menu) return;
  const trigger = menu.querySelector('summary');
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !menu.open) return;
    menu.open = false;
    trigger.focus();
  });
  document.addEventListener('click', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener('focusin', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
})();
