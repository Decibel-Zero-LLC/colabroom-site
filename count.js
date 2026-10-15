/* Anonymous step totals, plus an optional code naming a board, venue or video.
   Codes are never made for one person. Browser storage, app attribution and
   hosting logs have different lifetimes; privacy.html describes each. */
(function () {
  var ENDPOINT =
    'https://gzcoclsfvazfhcheefhz.supabase.co/functions/v1/analyze-public';
  // A code gets thirty days from arrival, never thirty more on each read.
  var CODE_LIFE = 30 * 24 * 60 * 60 * 1000;
  // Remember a refusal for one year without sending that preference anywhere.
  var REFUSAL_LIFE = 365 * 24 * 60 * 60 * 1000;
  var CODE_KEY = 'colabroom_code';
  var REFUSAL_KEY = 'colabroom_flier_opt_out';
  var refused = false;
  var current = null;
  var page = (function () {
    var tag = document.currentScript
      || document.querySelector('script[data-page]');
    var name = (tag && tag.getAttribute('data-page')) || '';
    return /^[a-z0-9-]{1,24}$/.test(name) ? name : '';
  })();

  function remove(key) {
    try { localStorage.removeItem(key); } catch (_) { /* Storage is optional. */ }
  }
  function read(key, life) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return null;
      var value = JSON.parse(raw);
      var now = Date.now();
      if (!value || typeof value.savedAt !== 'number'
          || !Number.isSafeInteger(value.savedAt) || value.savedAt < 0
          || value.savedAt > now || now - value.savedAt >= life
          || (key === CODE_KEY && (typeof value.code !== 'string'
            || !/^[a-z0-9-]{1,32}$/i.test(value.code)))) {
        remove(key);
        return null;
      }
      if (key === CODE_KEY) value.code = value.code.toLowerCase();
      return value;
    } catch (_) {
      remove(key); // Includes old raw strings whose age cannot be established.
      return null;
    }
  }
  function write(key, value) {
    try {
      var raw = JSON.stringify(value);
      localStorage.setItem(key, raw);
      return localStorage.getItem(key) === raw;
    } catch (_) { return false; }
  }
  function optedOut() { return refused || read(REFUSAL_KEY, REFUSAL_LIFE) !== null; }

  var fresh = false;
  try {
    var address = new URL(location.href);
    var incoming = address.searchParams.get('c');
    var remembered = read(CODE_KEY, CODE_LIFE);
    if (!optedOut()) {
      current = remembered;
      if (incoming && /^[a-z0-9-]{1,32}$/i.test(incoming)) {
        var code = incoming.toLowerCase();
        // Internal tool links carry the same code. They are arrivals for the
        // step counter, but do not give the browser copy a new lifetime.
        var next = remembered && remembered.code === code
          ? remembered : { code: code, savedAt: Date.now() };
        current = write(CODE_KEY, next) ? next : null;
        fresh = current !== null;
      }
    } else { remove(CODE_KEY); }
    // Consumed once: reloading a long-open page cannot revive an expired code.
    // Leave chart parameters, fragments and every other part of navigation alone.
    if (address.searchParams.has('c')) {
      address.searchParams.delete('c');
      window.history.replaceState(window.history.state, '', address.toString());
    }
  } catch (_) { current = null; }

  var appLinks = document.querySelectorAll(
    'a[href*="app.colabroom.com"], a[href^="mailto:beta@"]');
  var toolLinks = document.querySelectorAll('a[data-carry-code]');
  function rewrite(links, parameter, code, appOnly) {
    for (var i = 0; i < links.length; i += 1) {
      var link = links[i];
      try {
        var url = new URL(link.href, location.href);
        if (appOnly && url.hostname !== 'app.colabroom.com') continue;
        if (code) url.searchParams.set(parameter, code);
        else url.searchParams.delete(parameter);
        if (url.toString() !== link.href) link.href = url.toString();
      } catch (_) { /* A link that cannot be rewritten still navigates. */ }
    }
  }
  function linksFor(code) {
    rewrite(appLinks, 'from', code, true);
    rewrite(toolLinks, 'c', code, false);
  }
  function effectiveCode() {
    if (current) {
      var stored = read(CODE_KEY, CODE_LIFE);
      if (optedOut() || !stored || stored.code !== current.code
          || stored.savedAt !== current.savedAt) current = null;
    }
    var code = current ? current.code : '';
    linksFor(code);
    return code;
  }
  function send(step, code) {
    try {
      // GET stays harmless against older endpoints; never send the preference.
      fetch(ENDPOINT + '/note?step=' + encodeURIComponent(step)
          + (code ? '&c=' + encodeURIComponent(code) : '')
          + (page ? '&page=' + encodeURIComponent(page) : ''), {
        cache: 'no-store', keepalive: true,
      }).catch(function () {});
    } catch (_) { /* Measurement never breaks the page it measures. */ }
  }
  function note(step) { send(step, effectiveCode()); }
  send('opened', fresh ? effectiveCode() : '');
  effectiveCode();
  for (var i = 0; i < appLinks.length; i += 1) {
    appLinks[i].addEventListener('click', function () { note('clicked_app'); });
  }
  // Recheck before normal, keyboard, middle-click and context-menu navigation.
  function watchLinks(links) {
    for (var i = 0; i < links.length; i += 1) {
      ['click', 'auxclick', 'contextmenu'].forEach(function (event) {
        links[i].addEventListener(event, effectiveCode, true);
      });
    }
  }
  watchLinks(appLinks);
  watchLinks(toolLinks);
  window.addEventListener('storage', function (event) {
    if (event.key === null || event.key === CODE_KEY || event.key === REFUSAL_KEY) {
      effectiveCode();
    }
  });
  window.addEventListener('focus', effectiveCode);
  document.addEventListener('visibilitychange', effectiveCode);
  function expireLater() {
    effectiveCode();
    if (current) {
      // Browser timers cap at a signed 32-bit delay, shorter than thirty days.
      window.setTimeout(expireLater,
        Math.min(2147483647, Math.max(1, current.savedAt + CODE_LIFE - Date.now())));
    }
  }
  expireLater();

  var footer = document.querySelector('footer');
  if (footer) {
    var choice = document.createElement('button');
    choice.type = 'button';
    choice.id = 'flier-preference';
    choice.textContent = "Don't remember my flier";
    // The existing quiet footer-link treatment, with native button semantics.
    choice.style.cssText = 'font:inherit;color:inherit;background:none;border:0;'
      + 'padding:0;cursor:pointer;text-align:left;max-width:100%;white-space:normal';
    var status = document.createElement('span');
    status.setAttribute('role', 'status');
    choice.addEventListener('click', function () {
      refused = true;
      current = null;
      var saved = write(REFUSAL_KEY, { savedAt: Date.now() });
      remove(CODE_KEY);
      effectiveCode();
      status.textContent = saved
        ? "This browser won’t remember flier codes for a year. The code on this page is cleared."
        : "The code on this page is cleared. Your browser blocked saving this choice; another visit may remember a flier again.";
    });
    footer.appendChild(choice);
    footer.appendChild(status);
  }
  window.CoLab = { get code() { return effectiveCode(); }, page: page, note: note };
}());
