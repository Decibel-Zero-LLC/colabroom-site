/* The arrival chain, tested.

   A flier code has to survive four hops — the address bar, localStorage,
   the beacon, and the link into the app — and it has never once made it
   all the way. Nothing here needs installing beyond Deno, and the site
   itself still has no build step: this file is run by hand, from the
   repository root.

       deno test --allow-read tools/count_test.js

   count.js is a plain script, not a module, so it is read as text and
   run with its globals handed in. That is deliberate — the test runs the
   same bytes the browser does, rather than a copy that can drift.

   No test library, for the same reason the site has no framework: three
   assertions written out here cost less than a dependency that has to
   still resolve in two years. */

function assertEquals(got, want, why) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) throw new Error(`${why || 'not equal'}\n  got  ${a}\n  want ${b}`);
}

function assertStringIncludes(got, needle, why) {
  if (!String(got).includes(needle)) {
    throw new Error(`${why || 'missing'}\n  ${got}\n  does not contain ${needle}`);
  }
}

function assertFalse(got, why) {
  if (got) throw new Error(why || 'expected false');
}

const SOURCE = await Deno.readTextFile(
  new URL('../count.js', import.meta.url));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 15, 12);
const record = (code, savedAt = NOW) => JSON.stringify({ code, savedAt });

/* Fake only the browser APIs: each test executes the real count.js bytes. */
function run({ href, stored = null, page = 'home', links = [], tools = [],
               storageThrows = false, denied = [], optOut = null,
               now = NOW, footer = true, failedReads = {} } = {}) {
  const sent = [], requests = [], store = new Map(), timers = [];
  if (stored !== null) store.set('colabroom_code', stored);
  if (optOut !== null) store.set('colabroom_flier_opt_out', optOut);
  let clock = now;
  const blocked = new Set(denied);
  const localStorage = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(method =>
    [method, (key, value) => {
      if (storageThrows || blocked.has(method)) throw new Error('blocked');
      if (method === 'getItem' && failedReads[key] > 0) {
        failedReads[key] -= 1; throw new Error('transient read failure');
      }
      if (method === 'getItem') return store.get(key) ?? null;
      if (method === 'setItem') store.set(key, value);
      if (method === 'removeItem') store.delete(key);
    }]));
  function element(href = '') {
    const handlers = {};
    return { href, style: {}, children: [], textContent: '',
      addEventListener(type, fn) { (handlers[type] ??= []).push(fn); },
      setAttribute(key, value) { this[key] = value; },
      appendChild(child) { this.children.push(child); },
      fire(type, event = { preventDefault() {} }) { for (const fn of handlers[type] ?? []) fn(event); },
      click() { this.fire('click'); },
    };
  }
  const nodes = links.map(element), toolNodes = tools.map(element);
  const foot = element(), docEvents = element(), winEvents = element();
  const location = { href };
  const document = {
    currentScript: { getAttribute: name => name === 'data-page' ? page : null },
    querySelector: selector => selector === 'footer' && footer ? foot : null,
    querySelectorAll: selector => selector === 'a[data-carry-code]' ? toolNodes : nodes,
    createElement: () => element(),
    addEventListener: docEvents.addEventListener,
  };
  const win = {
    history: { state: { chart: 'kept' }, replaceState(_, __, value) { location.href = value; } },
    addEventListener: winEvents.addEventListener,
    setTimeout(fn, delay) { timers.push({ fn, delay }); },
  };
  const fetchStub = (url, options) => {
    sent.push(url); requests.push(options); return Promise.resolve();
  };
  const fakeDate = { now: () => clock };
  new Function('window', 'document', 'location', 'localStorage', 'fetch', 'Date', SOURCE)(
    win, document, location, localStorage, fetchStub, fakeDate);
  return { sent, requests, nodes, toolNodes, store, api: win.CoLab, location,
    preference: foot.children[0], status: foot.children[1], blocked, timers,
    setTime(value) { clock = value; },
    focus() { winEvents.fire('focus'); },
    visible() { docEvents.fire('visibilitychange'); },
    storage(key) { winEvents.fire('storage', { key }); },
  };
}

const HOME = 'https://colabroom.com/';
const APP = 'https://app.colabroom.com/';
const MAIL = 'mailto:beta@colabroom.com?subject=CoLabRoom%20beta';

Deno.test('a code on the address is kept, sent, and carried to the app', () => {
  const { sent, nodes, store, api } = run({
    href: HOME + '?c=ORL-Alley',
    links: [APP, MAIL],
  });

  assertEquals(store.get('colabroom_code'), record('orl-alley'),
    'the code is remembered in lower case for the next visit');
  assertEquals(api.code, 'orl-alley');

  assertEquals(sent.length, 1, 'one beacon on load, and only one');
  assertStringIncludes(sent[0], 'step=opened');
  assertStringIncludes(sent[0], 'c=orl-alley');
  assertStringIncludes(sent[0], 'page=home');

  assertEquals(nodes[0].href, APP + '?from=orl-alley',
    'the app link carries the code onward — this is the hop that has '
    + 'never worked, because the button used to be a mailto');
  assertEquals(nodes[1].href, MAIL, 'a mailto is left exactly as it was');
});

Deno.test('every link towards the app counts as clicked_app', () => {
  const { sent, nodes } = run({ href: HOME, links: [APP, MAIL] });
  assertEquals(sent.length, 1);
  nodes[0].click();
  nodes[1].click();
  assertEquals(sent.length, 3);
  assertStringIncludes(sent[1], 'step=clicked_app');
  assertStringIncludes(sent[2], 'step=clicked_app');
});

Deno.test('a remembered code carries on, but the page load is not a second arrival', () => {
  const { sent, nodes } = run({
    href: HOME + 'takes.html',
    stored: record('yt-chords-01'),
    page: 'takes',
    links: [APP],
  });

  /* A step that carries a code is written to `arrivals`, and
     `arrival_report` sums those. So the second, third and sixth page
     this person reads must not each look like somebody new walking in
     off that video — or a board whose visitors browse beats a board
     whose visitors sign up. */
  assertStringIncludes(sent[0], 'step=opened');
  assertStringIncludes(sent[0], 'page=takes');
  assertFalse(sent[0].includes('c=yt-chords-01'),
    'a code read back out of storage is the same person still reading, '
    + 'not another arrival');

  /* Everything the visitor actually does still says where they came
     from, which is the half that makes the code worth keeping. */
  assertEquals(nodes[0].href, APP + '?from=yt-chords-01',
    'the link into the app still carries it');
  nodes[0].click();
  assertStringIncludes(sent[1], 'step=clicked_app');
  assertStringIncludes(sent[1], 'c=yt-chords-01',
    'going to the app is a thing they did, and it counts for the board');
});

Deno.test('a code on this load is an arrival, and counts as one', () => {
  const { sent, nodes } = run({
    href: HOME + '?c=orl-alley',
    page: 'home',
    links: [APP],
  });
  assertStringIncludes(sent[0], 'step=opened');
  assertStringIncludes(sent[0], 'c=orl-alley',
    'the one load where somebody really did walk through that door');
  nodes[0].click();
  assertStringIncludes(sent[1], 'c=orl-alley');
});

Deno.test('no code means no code — nothing is invented', () => {
  const { sent, nodes, api } = run({ href: HOME, links: [APP] });
  assertEquals(api.code, '');
  assertFalse(sent[0].includes('&c='));
  assertStringIncludes(sent[0], 'step=opened');
  assertEquals(nodes[0].href, APP, 'the link is untouched');
});

Deno.test('anything that is not a plain code is ignored', () => {
  for (const bad of ['../etc', 'a b', 'x'.repeat(33), 'code!', '']) {
    const { sent, store } = run({
      href: HOME + '?c=' + encodeURIComponent(bad),
      links: [],
    });
    assertEquals(store.has('colabroom_code'), false,
      'refused rather than stored: ' + JSON.stringify(bad));
    assertFalse(sent[0].includes('&c='),
      'refused rather than sent: ' + JSON.stringify(bad));
  }
});

Deno.test('a page name that is not a plain slug is dropped', () => {
  const { sent } = run({ href: HOME, page: 'not a slug', links: [] });
  assertFalse(sent[0].includes('page='));
});

Deno.test('a browser with storage blocked still counts and still works', () => {
  const { sent, nodes, api } = run({
    href: HOME + '?c=flier-orl',
    storageThrows: true,
    links: [APP],
  });
  assertEquals(api.code, '', 'no code survives, and nothing throws');
  assertStringIncludes(sent[0], 'step=opened');
  assertEquals(nodes[0].href, APP);
});

Deno.test('the beacon is a GET with no identifier on it', () => {
  const { sent } = run({ href: HOME + '?c=hn-tool', page: 'home', links: [] });
  const url = new URL(sent[0]);
  assertEquals(url.pathname.endsWith('/note'), true);
  assertEquals([...url.searchParams.keys()].sort(),
    ['c', 'page', 'step'],
    'three parameters and no fourth: a step, a place and a page. '
    + 'Nothing here names a person.');
});

Deno.test('thirty days is a strict boundary and reading never refreshes it', () => {
  for (const age of [30 * DAY - 1, 30 * DAY, 30 * DAY + 1]) {
    const original = record('board', NOW - age);
    const result = run({ href: HOME, stored: original });
    assertEquals(result.api.code, age < 30 * DAY ? 'board' : '');
    assertEquals(result.store.get('colabroom_code'), age < 30 * DAY ? original : undefined);
  }
});

Deno.test('legacy and malformed storage have unknown age and are discarded', () => {
  for (const stored of ['old-board', '"old-board"', '{', 'null', '[]',
    '{}', record('bad code'), record('board', NOW + 1),
    record('board', -1), record('board', 'yesterday'), record('board', NOW + 0.5),
    JSON.stringify({ code: 123, savedAt: NOW })]) {
    const result = run({ href: HOME, stored });
    assertEquals(result.api.code, '', stored);
    assertFalse(result.store.has('colabroom_code'), stored);
  }
});

Deno.test('stored codes are validated and normalized without extending their life', () => {
  const result = run({ href: HOME, stored: record('BOARD', NOW - DAY) });
  assertEquals(result.api.code, 'board');
  assertEquals(JSON.parse(result.store.get('colabroom_code')).savedAt, NOW - DAY);
});

Deno.test('a new code replaces an old one while a carried code keeps its age', () => {
  const carried = run({ href: HOME + '?c=BOARD', stored: record('board', NOW - DAY) });
  assertEquals(carried.store.get('colabroom_code'), record('board', NOW - DAY));
  const fresh = run({ href: HOME + '?c=new-board', stored: record('board', NOW - DAY) });
  assertEquals(fresh.store.get('colabroom_code'), record('new-board'));
});

Deno.test('consumed address code cannot restart its lifetime on reload', () => {
  const result = run({ href: HOME + '?chart=Am%20F&c=board#sheet' });
  const address = new URL(result.location.href);
  assertEquals(address.searchParams.has('c'), false);
  assertEquals(address.searchParams.get('chart'), 'Am F');
  assertEquals(address.hash, '#sheet');
  const reloaded = run({ href: result.location.href,
    stored: result.store.get('colabroom_code'), now: NOW + 30 * DAY });
  assertEquals(reloaded.api.code, '');
});

Deno.test('refusal clears memory, storage and already rewritten app/tool links', () => {
  const result = run({ href: HOME + '?c=board',
    links: [APP + '?song=demo#take', MAIL],
    tools: [HOME + 'chords.html?chart=Am%20F#sheet'] });
  assertStringIncludes(result.nodes[0].href, 'from=board');
  assertStringIncludes(result.toolNodes[0].href, 'c=board');
  result.preference.click();
  assertEquals(result.api.code, '');
  assertFalse(result.store.has('colabroom_code'));
  assertEquals(result.store.get('colabroom_flier_opt_out'), JSON.stringify({ savedAt: NOW }));
  assertEquals(result.nodes[0].href, APP + '?song=demo#take');
  assertEquals(result.nodes[1].href, MAIL);
  const tool = new URL(result.toolNodes[0].href);
  assertEquals(tool.searchParams.get('chart'), 'Am F');
  assertEquals(tool.searchParams.has('c'), false);
  assertEquals(tool.hash, '#sheet');
  result.api.note('analyzed_ok'); result.nodes[0].click();
  assertFalse(result.sent.at(-1).includes('&c='));
  assertFalse(result.sent.at(-2).includes('&c='));
  assertStringIncludes(result.status.textContent, 'for a year');
});

Deno.test('refusal is offered without a code and suppresses explicit URL codes for one year', () => {
  assertEquals(run({ href: HOME }).preference.textContent, "Don't remember my flier");
  for (const age of [365 * DAY - 1, 365 * DAY, 365 * DAY + 1]) {
    const result = run({ href: HOME + '?c=board',
      optOut: JSON.stringify({ savedAt: NOW - age }) });
    assertEquals(result.api.code, age < 365 * DAY ? '' : 'board');
    assertEquals(result.sent[0].includes('&c='), age >= 365 * DAY);
  }
});

Deno.test('malformed and future refusal dates do not make a permanent preference', () => {
  for (const optOut of ['true', '{}', '{', JSON.stringify({ savedAt: NOW + 1 })]) {
    assertEquals(run({ href: HOME + '?c=board', optOut }).api.code, 'board');
  }
});

Deno.test('separately denied reads writes and removes never break counting or refusal', () => {
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    const result = run({ href: HOME + '?c=board', denied: [method], links: [APP] });
    assertStringIncludes(result.sent[0], 'step=opened');
    result.preference.click();
    assertEquals(result.api.code, '');
    assertFalse(result.nodes[0].href.includes('from='));
    assertStringIncludes(result.status.textContent,
      method === 'removeItem' ? 'for a year' : 'confirm this choice');
    result.api.note('analyzed_ok');
    assertFalse(result.sent.at(-1).includes('&c='));
  }
});

Deno.test('failed persistence cannot restore attribution on the current page', () => {
  const result = run({ href: HOME + '?c=board', links: [APP] });
  result.blocked.add('setItem'); result.blocked.add('removeItem');
  result.preference.click(); result.focus(); result.storage('colabroom_code');
  assertEquals(result.api.code, '');
  assertFalse(result.nodes[0].href.includes('from='));
  assertStringIncludes(result.status.textContent, 'confirm this choice');
});

Deno.test('another tab opting out or clearing storage clears existing carried links', () => {
  for (const key of ['colabroom_flier_opt_out', 'colabroom_code', null]) {
    const result = run({ href: HOME + '?c=board', links: [APP], tools: [HOME + 'chords.html'] });
    if (key === 'colabroom_flier_opt_out') result.store.set(key, JSON.stringify({ savedAt: NOW }));
    else result.store.delete('colabroom_code');
    result.storage(key);
    assertEquals(result.api.code, '');
    assertFalse(result.nodes[0].href.includes('from='));
    assertFalse(result.toolNodes[0].href.includes('c='));
    result.store.set('colabroom_code', record('board'));
    result.storage('colabroom_code');
    assertEquals(result.api.code, '', 'a stale tab never adopts a later stored code');
  }
});

Deno.test('long-open pages expire before note, focus, visibility and every link navigation', () => {
  for (const action of ['note', 'focus', 'visible', 'click', 'auxclick', 'contextmenu', 'timer']) {
    const result = run({ href: HOME + '?c=board', links: [APP], tools: [HOME + 'chords.html'] });
    result.setTime(NOW + 30 * DAY);
    if (action === 'note') result.api.note('analyzed_ok');
    else if (action === 'focus' || action === 'visible') result[action]();
    else if (action === 'timer') result.timers[0].fn();
    else result.toolNodes[0].fire(action);
    assertFalse(result.nodes[0].href.includes('from='), action);
    assertFalse(result.toolNodes[0].href.includes('c='), action);
    assertFalse(result.store.has('colabroom_code'), action);
    assertEquals(result.api.code, '', action);
  }
});

Deno.test('timer delay respects the browser cap and missing footer is harmless', () => {
  const result = run({ href: HOME + '?c=board', footer: false });
  assertEquals(result.timers[0].delay, 2147483647);
  assertEquals(result.api.code, 'board');
});

Deno.test('requests remain credential-free GETs with only public counting fields', () => {
  const result = run({ href: HOME + '?c=board' });
  result.preference.click(); result.api.note('analyzed_ok');
  for (const options of result.requests) {
    assertEquals(options, { cache: 'no-store', keepalive: true });
  }
  assertEquals([...new URL(result.sent.at(-1)).searchParams.keys()].sort(), ['page', 'step']);
});

Deno.test('Privacy links directly to the refusal action without loading counters', async () => {
  const privacy = await Deno.readTextFile(new URL('../privacy.html', import.meta.url));
  assertStringIncludes(privacy, 'href="index.html#flier-preference">Don\'t remember my flier</a>');
  assertFalse(/<script[^>]+src=["']count\.js["']/.test(privacy));
  assertEquals(run({ href: HOME }).preference.id, 'flier-preference');
});


Deno.test('an unread refusal is preserved and suppresses new attribution through recovery', () => {
  const refusal = JSON.stringify({ savedAt: NOW - DAY });
  const result = run({ href: HOME + '?c=new-board',
    stored: record('old-board'), optOut: refusal,
    failedReads: { colabroom_flier_opt_out: 1 },
    links: [APP], tools: [HOME + 'chords.html'] });
  assertEquals(result.api.code, '');
  assertEquals(result.store.get('colabroom_flier_opt_out'), refusal,
    'a read error must not delete a valid refusal');
  assertFalse(result.sent[0].includes('&c='));
  assertFalse(result.nodes[0].href.includes('from='));
  assertFalse(result.toolNodes[0].href.includes('c='));
  result.focus(); result.storage('colabroom_flier_opt_out');
  result.api.note('analyzed_ok');
  assertEquals(result.api.code, '', 'later successful reads do not restore a code');
  assertEquals(result.store.get('colabroom_flier_opt_out'), refusal);
  assertFalse(result.sent.at(-1).includes('&c='));
  const reloaded = run({ href: HOME + '?c=new-board', optOut: refusal });
  assertEquals(reloaded.api.code, '');
  const allowed = run({ href: HOME + '?c=new-board' });
  assertEquals(allowed.api.code, 'new-board', 'absence of refusal still accepts a valid arrival');
});

Deno.test('a transient code read failure preserves unread storage and drops only this page code', () => {
  const stored = record('board');
  const result = run({ href: HOME, stored, failedReads: { colabroom_code: 1 } });
  assertEquals(result.api.code, '');
  assertEquals(result.store.get('colabroom_code'), stored);
  result.focus();
  assertEquals(result.api.code, '', 'recovery does not silently adopt a remembered code');
});


Deno.test('unread code age cannot restart through a carried URL and later reads recover original age', () => {
  for (const incoming of ['board', 'new-board']) {
    const stored = record('board', NOW - 29 * DAY);
    const result = run({ href: HOME + '?c=' + incoming, stored,
      failedReads: { colabroom_code: 1 }, links: [APP] });
    assertEquals(result.api.code, '', 'unknown stored age suppresses this load');
    assertEquals(result.store.get('colabroom_code'), stored, 'timestamp is untouched');
    assertFalse(result.nodes[0].href.includes('from='));
    assertFalse(result.sent[0].includes('&c='));
    const recovered = run({ href: HOME + '?c=board', stored: result.store.get('colabroom_code') });
    assertEquals(recovered.api.code, 'board');
    assertEquals(recovered.store.get('colabroom_code'), stored);
    recovered.setTime(NOW + DAY);
    assertEquals(recovered.api.code, '', 'original thirty-day boundary still expires');
  }
});
