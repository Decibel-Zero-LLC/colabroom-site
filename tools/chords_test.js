/* The free tool's page, tested where it talks to a person.

   Four things a visitor reads were wrong on 22 September 2026 (the human
   test): choosing the same file again after "try that again" did nothing,
   the gate never said how many songs or when they come back, a day whose
   budget was spent showed the problem box and counted a failure, and a key
   the finder was torn about was drawn as though it were sure. Each is
   asserted here. Nothing needs installing beyond Deno and the site still
   has no build step; run by hand from the repository root:

       deno test --allow-read tools/chords_test.js

   chords.js is a plain script, not a module, so it is read as text and run
   with a small stand-in for the page handed in. The test runs the same
   bytes the browser does, rather than a copy that can drift. No test
   library, for the reason the site has no framework. */

function assertEquals(got, want, why) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) throw new Error(`${why || 'not equal'}\n  got  ${a}\n  want ${b}`);
}

function assert(got, why) {
  if (!got) throw new Error(why || 'expected true');
}

const SOURCE = await Deno.readTextFile(new URL('../chords.js', import.meta.url));

/* One element, with only the parts chords.js touches. Setting textContent
   drops the children, the way a browser does. */
class Node {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.hidden = false;
    this.children = [];
    this.own = '';
    this.className = '';
    this.value = '';
    this.files = null;
    this.attributes = {};
    this.markup = '';
    this.disabled = false;
    this.handlers = {};
    this.classList = {
      add: (name) => { this.className = (this.className + ' ' + name).trim(); },
      remove: (name) => {
        this.className = this.className.split(' ').filter((c) => c !== name).join(' ');
      },
    };
  }
  get textContent() {
    return this.own + this.children.map((child) => child.textContent).join('');
  }
  set textContent(text) { this.own = String(text); this.children = []; }
  get innerHTML() { return this.markup; }
  set innerHTML(value) { this.markup = value; this.own = ''; this.children = []; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  fire(type, extra = {}) {
    for (const fn of this.handlers[type] || []) {
      fn({ target: this, preventDefault() {}, ...extra });
    }
  }
  click() { this.fire('click'); }
  scrollIntoView() {}
  querySelector(selector) { return (this.found || {})[selector] || null; }
}

const IDS = ['drop', 'file', 'pick', 'working', 'working-note', 'problem',
  'result', 'key', 'prog', 'chart', 'copy', 'share', 'again', 'gate',
  'shared-note', 'gate-back', 'tool', 'daily-limit'];

/* A page with chords.js running on it.

   `replies` are what the endpoint answers to each upload in turn: a status
   and a body, or 'offline' for a request that never arrives. */
function open({ hash = '', search = '', replies = [], writeClipboard = null, streams = globalThis } = {}) {
  const els = Object.fromEntries(IDS.map((id) => [id, new Node()]));
  for (const id of ['working', 'problem', 'result', 'gate', 'shared-note']) {
    els[id].hidden = true;
  }
  const lead = new Node('p');
  lead.textContent = "That's all your free songs for today.";
  els.gate.found = { '.gate-lead': lead };
  /* What the line under the heading is written with. */
  els['daily-limit'].textContent = '25';

  const uploads = [];
  const steps = [];
  const copied = [];
  const queue = [...replies];

  const fetchStub = async (url, init = {}) => {
    const text = String(url);
    if (text.includes('/note?')) {
      steps.push(new URL(text).searchParams.get('step'));
      return new Response(null, { status: 204 });
    }
    assertEquals(init.method, 'POST', 'the only other request is an upload');
    uploads.push(init.body.get('file'));
    const next = await queue.shift();
    if (!next || next === 'offline') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'content-type': 'application/json' },
    });
  };

  const heading = new Node('h1');
  heading.innerHTML = 'Drop in a song.<br>Get the chords back.';
  const sub = new Node('p');
  sub.innerHTML = 'Your original <b>recording</b> stays yours.';
  const document = {
    getElementById: (id) => els[id] || null,
    createElement: (tag) => new Node(tag),
    querySelector: (selector) => ({ '.hero h1': heading, '.hero p': sub })[selector] || null,
    querySelectorAll: () => [],
  };
  const location = {
    href: 'https://colabroom.com/chords.html' + search + hash,
    origin: 'https://colabroom.com',
    pathname: '/chords.html',
    search,
    hash,
  };
  const history = { replaceState(_state, _title, path) {
    const url = new URL(path, location.href);
    Object.assign(location, { href: url.href, pathname: url.pathname,
      search: url.search, hash: url.hash });
  } };
  const navigator = { clipboard: { writeText: async (text) => {
    copied.push(text);
    if (writeClipboard) await writeClipboard(text);
  } } };
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, v); },
  };
  /* After the site's count.js lands, chords.js counts through
     window.CoLab.note instead of its own beacon. Both land in `steps`. */
  const window = { CoLab: { note: (step) => steps.push(step) } };
  const setInterval = () => 0;
  const clearInterval = () => {};

  new Function('document', 'location', 'history', 'navigator', 'localStorage',
    'fetch', 'window', 'setInterval', 'clearInterval', 'setTimeout', 'globalThis', SOURCE)(
    document, location, history, navigator, localStorage, fetchStub, window,
    setInterval, clearInterval, () => 0, streams);

  /* What a browser does when somebody picks a file: nothing at all when
     the input already holds that same file, which is the whole bug. */
  function choose(file) {
    const path = 'C:\\fakepath\\' + file.name;
    if (els.file.value === path) return false;
    els.file.value = path;
    els.file.files = [file];
    els.file.fire('change');
    return true;
  }

  return { els, lead, uploads, steps, copied, choose, location, heading, sub };
}

/* Long enough for a reply that is already there to be read and drawn. */
async function settle() {
  for (let i = 0; i < 20; i += 1) await new Promise((done) => setTimeout(done, 0));
}

function song(name = 'demo.mp3') {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'audio/mpeg' });
}

const WAKING = {
  status: 503,
  body: {
    error: 'The chord finder was still waking up. Try that again — it is quick once it is awake.',
    try_again: true,
    counted: true,
  },
};

const CHORDS = {
  status: 200,
  body: {
    chords: [
      { start: 0, end: 2, chord: 'G:maj' },
      { start: 2, end: 4, chord: 'E:min' },
      { start: 4, end: 6, chord: 'C:maj' },
      { start: 6, end: 8, chord: 'D:maj' },
    ],
    key: 'G major',
    key_runner_up: null,
    key_is_estimated: true,
    counted: true,
  },
};

function tornChords() {
  return { ...CHORDS, body: { ...CHORDS.body, key_runner_up: 'E minor' } };
}

/** The local midnight coming next, as the server would send it. */
function nextLocalMidnight() {
  const at = new Date();
  at.setHours(24, 0, 0, 0);
  return at.toISOString();
}

function tryAgainIn(problem) {
  return problem.children.find((child) => child.textContent === 'Try again') || null;
}

Deno.test('choosing the same file again after "try that again" sends it again', async () => {
  const page = open({ replies: [WAKING, CHORDS] });
  const file = song();

  assert(page.choose(file));
  await settle();
  assertEquals(page.uploads.length, 1);
  assertEquals(page.els.problem.hidden, false, 'the problem is said');
  assert(page.els.problem.textContent.startsWith('The chord finder was still waking up.'));
  assertEquals(page.els.file.value, '', 'the picker is emptied as soon as the file is taken');

  assert(page.choose(file), 'the browser sees a change, because the picker was emptied');
  await settle();
  assertEquals(page.uploads.length, 2, 'the same song goes again');
  assertEquals(page.uploads[1].name, 'demo.mp3');
  assertEquals(page.els.result.hidden, false);
  assertEquals(page.els.problem.hidden, true);
});

Deno.test('Try again, when the server asks for it, resends the same file', async () => {
  const page = open({ replies: [WAKING, CHORDS] });
  page.choose(song('first take.m4a'));
  await settle();

  const again = tryAgainIn(page.els.problem);
  assert(again, 'the problem box carries a Try again button');
  again.click();
  await settle();

  assertEquals(page.uploads.length, 2);
  assertEquals(page.uploads[1].name, 'first take.m4a', 'the same file, not a new pick');
  assertEquals(page.uploads[1].size, page.uploads[0].size);
  assertEquals(page.els.result.hidden, false);
  assertEquals(page.els.key.textContent, 'G major');
  assertEquals(page.steps.filter((step) => step === 'chose_file').length, 1,
    'one file was chosen; sending it again is not a second one');
});

Deno.test('a double tap on Try again sends the song once', async () => {
  const page = open({ replies: [WAKING, CHORDS, CHORDS] });
  page.choose(song());
  await settle();

  const again = tryAgainIn(page.els.problem);
  again.click();
  again.click();
  await settle();

  assertEquals(page.uploads.length, 2, 'one try, then one retry, never two');
});

Deno.test('the number under the heading follows the server once it has said one', async () => {
  const raised = { ...CHORDS, body: { ...CHORDS.body, daily_limit: 60 } };
  const page = open({ replies: [raised] });
  assertEquals(page.els['daily-limit'].textContent, '25', 'what the page is written with');
  page.choose(song());
  await settle();
  assertEquals(page.els['daily-limit'].textContent, '60');

  /* The gate puts it right too, so the line above it cannot say another. */
  const gated = open({
    replies: [{ status: 429, body: { limit_reached: true, daily_limit: 40 } }],
  });
  gated.choose(song());
  await settle();
  assertEquals(gated.els['daily-limit'].textContent, '40');
  assert(gated.lead.textContent.startsWith("That's your 40 songs for today."), gated.lead.textContent);

  /* A reply with no number in it, or not a number, leaves the line alone. */
  const older = open({ replies: [CHORDS, { status: 429, body: { limit_reached: true, daily_limit: '99' } }] });
  older.choose(song('one.mp3'));
  await settle();
  older.choose(song('two.mp3'));
  await settle();
  assertEquals(older.els['daily-limit'].textContent, '25');
});

Deno.test('a connection that dropped offers Try again too, and a bad recording does not', async () => {
  const offline = open({ replies: ['offline'] });
  offline.choose(song());
  await settle();
  assert(offline.els.problem.textContent.startsWith('That upload did not reach us.'));
  assert(tryAgainIn(offline.els.problem), 'the file is still in hand, so going again is one tap');

  const unreadable = open({
    replies: [{
      status: 502,
      body: { error: 'The chord detector could not read that recording.', counted: true },
    }],
  });
  unreadable.choose(song());
  await settle();
  assertEquals(unreadable.els.problem.hidden, false);
  assertEquals(tryAgainIn(unreadable.els.problem), null,
    'sending the same unreadable file again would only spend another song');
});

Deno.test('the gate says how many songs, from the reply, and when they come back', async () => {
  const page = open({
    replies: [{
      status: 429,
      body: {
        error: "That's your 25 songs for today. They come back at midnight UTC.",
        limit_reached: true,
        daily_limit: 25,
        reset_at: nextLocalMidnight(),
      },
    }],
  });
  page.choose(song());
  await settle();

  assertEquals(page.els.gate.hidden, false, 'the gate, not an error');
  assertEquals(page.els.problem.hidden, true);
  assertEquals(page.lead.textContent,
    "That's your 25 songs for today. They come back at midnight, your time.");
  assert(page.steps.includes('limit_reached'), 'counted once, by the page, as the server does not');
  assert(!page.steps.includes('analyzed_fail'));
});

Deno.test('the number is whatever the server says, and so is the time', async () => {
  const tomorrowMorning = new Date();
  tomorrowMorning.setHours(24 + 9, 0, 0, 0);
  const page = open({
    replies: [{
      status: 429,
      body: { limit_reached: true, daily_limit: 60, reset_at: tomorrowMorning.toISOString() },
    }],
  });
  page.choose(song());
  await settle();
  const lead = page.lead.textContent;
  assert(lead.startsWith("That's your 60 songs for today. They come back at "), lead);
  assert(lead.endsWith(' tomorrow, your time.'), lead);
  assert(!lead.includes('UTC'), lead);

  /* A reply with no instant in it (a function older than reset_at) still
     says something true. */
  const older = open({ replies: [{ status: 429, body: { limit_reached: true, daily_limit: 25 } }] });
  older.choose(song());
  await settle();
  assertEquals(older.lead.textContent,
    "That's your 25 songs for today. They come back at midnight UTC.");

  /* And one with no number says no number, rather than a wrong one. */
  const noNumber = open({ replies: [{ status: 429, body: { limit_reached: true } }] });
  noNumber.choose(song());
  await settle();
  assertEquals(noNumber.lead.textContent,
    "That's all your free songs for today. They come back at midnight UTC.");
});

Deno.test('a spent day is the gate at rest, not the problem box, and is not a failure', async () => {
  const page = open({
    replies: [{
      status: 429,
      body: {
        error: 'The free tool is resting until midnight UTC. Your song is fine; try it again then.',
        budget_reached: true,
        counted: true,
        reset_at: nextLocalMidnight(),
      },
    }],
  });
  page.choose(song());
  await settle();

  assertEquals(page.els.gate.hidden, false);
  assertEquals(page.els.problem.hidden, true, 'nothing went wrong with their song');
  assertEquals(page.lead.textContent,
    'The free tool is resting until midnight, your time. Your song is fine; try it again then.');
  assert(!page.steps.includes('analyzed_fail'), 'it is not a failed analysis');
  assert(!page.steps.includes('budget_reached'),
    'the server already counted it (counted: true), so the page does not count it twice');
});

Deno.test('a torn key is drawn as both, and a link to the chart carries both', async () => {
  const page = open({ replies: [tornChords()] });
  page.choose(song());
  await settle();
  assertEquals(page.els.key.textContent, 'G major, or E minor');

  page.els.share.click();
  await settle();
  assertEquals(page.copied.length, 1);
  const link = page.copied[0];
  assert(link.startsWith('https://colabroom.com/chords.html#s='), link);

  const received = open({ hash: link.slice(link.indexOf('#')) });
  await settle();
  assertEquals(received.els.result.hidden, false, 'the chart opens for whoever it was sent to');
  assertEquals(received.els.key.textContent, 'G major, or E minor');
});

Deno.test('a key the finder was sure of is drawn alone', async () => {
  const page = open({ replies: [CHORDS] });
  page.choose(song());
  await settle();
  assertEquals(page.els.key.textContent, 'G major');
});


function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Wait for the actual UI/request condition, with a bounded failure if it never happens.
async function until(predicate, why) {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((done) => setTimeout(done, 0));
  }
  assert(predicate(), why);
}

function shared(sheet) {
  const bytes = new TextEncoder().encode(JSON.stringify(sheet));
  return '#s=j' + btoa(String.fromCharCode(...bytes));
}

const SHEET = { k: 'G major', r: 'E minor', c: [['G', 0, 2], ['Em', 2, 4]] };

Deno.test('malformed shared charts leave the ordinary upload usable without partial arrival UI', async () => {
  const invalid = [null, {}, { ...SHEET, k: null }, { ...SHEET, k: [] },
    { ...SHEET, r: {} }, { ...SHEET, c: [] }, { ...SHEET, c: [null] },
    { ...SHEET, c: [['G', 0]] }, { ...SHEET, c: [[null, 0, 2]] },
    { ...SHEET, c: [[' ', 0, 2]] }, { ...SHEET, c: [['G', '0', 2]] },
    { ...SHEET, c: [['G', -1, 2]] }, { ...SHEET, c: [['G', 3, 2]] },
    { ...SHEET, c: [['G', 0, Infinity]] },
    { ...SHEET, c: [['G', 0, 2], null] }];
  for (const hash of [...invalid.map(shared), '#s=jtruncated!', '#s=%broken']) {
    const page = open({ hash, replies: [CHORDS] });
    await settle();
    assertEquals(page.els.drop.hidden, false, hash);
    assertEquals(page.els['shared-note'].hidden, true, hash);
    assertEquals(page.els.result.hidden, true, hash);
    assertEquals(page.steps.includes('opened_shared'), false, hash);
    assertEquals(page.heading.innerHTML, 'Drop in a song.<br>Get the chords back.');
    page.choose(song());
    await until(() => !page.els.result.hidden && !page.els.file.disabled, 'upload after bad link');
    assertEquals(page.els.key.textContent, 'G major');
  }
});

Deno.test('valid and older shared charts open without any upload; reset restores original page and query', async () => {
  for (const sheet of [SHEET, { k: '', c: [['N.C.', 0, 0]] }]) {
    const page = open({ hash: shared(sheet), search: '?from=local' });
    await until(() => !page.els.result.hidden, 'valid shared result');
    assertEquals(page.uploads.length, 0);
    assertEquals(page.els.drop.hidden, true);
    assert(page.heading.innerHTML.includes('Somebody sent you'));
    page.els.again.click();
    assertEquals(page.location.pathname, '/chords.html');
    assertEquals(page.location.search, '?from=local');
    assertEquals(page.location.hash, '');
    assertEquals(page.heading.innerHTML, 'Drop in a song.<br>Get the chords back.');
    assertEquals(page.sub.innerHTML, 'Your original <b>recording</b> stays yours.');
    assertEquals(page.els.drop.hidden, false);
    assertEquals(page.els['shared-note'].hidden, true);
  }
});

Deno.test('one upload owns picker, drop and retry routes until completion', async () => {
  const first = deferred();
  const page = open({ replies: [first.promise, { ...CHORDS, body: { ...CHORDS.body, key: 'A major' } }] });
  let pickerClicks = 0;
  page.els.file.addEventListener('click', () => { pickerClicks += 1; });
  page.choose(song('first.mp3'));
  assertEquals(page.els.pick.disabled, true);
  assertEquals(page.els.file.disabled, true);
  assertEquals(page.els.drop.getAttribute('aria-busy'), 'true');
  assertEquals(page.els.drop.getAttribute('aria-disabled'), 'true');
  page.choose(song('second.mp3'));
  page.els.pick.click();
  page.els.drop.click();
  page.els.drop.fire('dragenter');
  page.els.drop.fire('drop', { dataTransfer: { files: [song('dropped.mp3')] } });
  assertEquals(page.uploads.length, 1);
  assertEquals(pickerClicks, 0);
  assert(!page.els.drop.className.includes('over'));
  assertEquals(page.steps.filter((step) => step === 'chose_file').length, 1);
  first.resolve(CHORDS);
  await until(() => !page.els.file.disabled, 'upload lock released');
  assertEquals(page.els.key.textContent, 'G major');
  assertEquals(page.els.drop.getAttribute('aria-busy'), 'false');
  assertEquals(page.els.drop.getAttribute('aria-disabled'), 'false');
  page.choose(song('second.mp3'));
  await until(() => !page.els.file.disabled, 'next upload complete');
  assertEquals(page.uploads.length, 2);
  assertEquals(page.els.key.textContent, 'A major');
});

Deno.test('upload lock releases on quota, budget, invalid body, network, retry and size refusal', async () => {
  const outcomes = [{ status: 429, body: { limit_reached: true } },
    { status: 429, body: { budget_reached: true } }, { status: 200, body: null },
    'offline', WAKING, { status: 502, body: { error: 'Unreadable' } }];
  for (const outcome of outcomes) {
    const page = open({ replies: [outcome, CHORDS] });
    page.choose(song());
    await until(() => !page.els.file.disabled, 'failure/gate unlock');
    assertEquals(page.els.pick.disabled, false);
    page.choose(song());
    await until(() => !page.els.result.hidden && !page.els.file.disabled, 'successful next file');
    assertEquals(page.uploads.length, 2);
  }
  const page = open({ replies: [CHORDS] });
  page.choose(new File([new Uint8Array(24 * 1024 * 1024 + 1)], 'large.mp3'));
  assertEquals(page.uploads.length, 0);
  assertEquals(page.els.file.disabled, false);
  page.choose(song());
  await until(() => !page.els.result.hidden, 'after size refusal');
});

Deno.test('own-result share resets its fragment and new upload keeps query without a stale chart', async () => {
  const page = open({ replies: [CHORDS, CHORDS], search: '?from=local' });
  page.choose(song());
  await until(() => !page.els.result.hidden, 'own chart');
  page.els.share.click();
  await until(() => page.location.hash.startsWith('#s='), 'shared URL');
  assert(page.copied[0].startsWith('https://colabroom.com/chords.html#s='));
  assert(!page.copied[0].includes('from=local'), 'attribution is not copied into chart link');
  page.els.again.click();
  assertEquals(page.location.hash, '');
  assertEquals(page.location.search, '?from=local');
  page.els.share.click();
  await settle();
  assertEquals(page.copied.length, 1, 'reset no longer shares the old result');
  page.choose(song('new.mp3'));
  await until(() => !page.els.result.hidden, 'new result');
  assertEquals(page.location.hash, '');
});

Deno.test('deferred shared decoder cannot replace a chosen upload or a reset page', async () => {
  for (const action of ['upload', 'reset']) {
    const response = deferred();
    const page = open({ hash: shared(SHEET), replies: [response.promise] });
    if (action === 'upload') page.choose(song());
    else page.els.again.click();
    await settle();
    assertEquals(page.steps.includes('opened_shared'), false);
    assertEquals(page.els.drop.hidden, false);
    assertEquals(page.els['shared-note'].hidden, true);
    assertEquals(page.location.hash, '');
    if (action === 'upload') {
      assertEquals(page.els.result.hidden, true);
      response.resolve(CHORDS);
      await until(() => !page.els.result.hidden, 'own response wins');
    }
  }
});

Deno.test('reset or new upload invalidates deferred share packing and clipboard completion', async () => {
  for (const action of ['reset', 'upload']) {
    const clipboard = deferred();
    const page = open({ replies: [CHORDS, CHORDS], search: '?keep=yes',
      writeClipboard: () => clipboard.promise });
    page.choose(song());
    await until(() => !page.els.result.hidden, 'own result');
    page.els.share.click();
    await until(() => page.copied.length === 1, 'clipboard is pending');
    if (action === 'reset') page.els.again.click();
    else page.choose(song('next.mp3'));
    clipboard.resolve();
    await settle();
    assertEquals(page.location.hash, '');
    assertEquals(page.location.search, '?keep=yes');
    assertEquals(page.els.share.textContent, 'Copy a link to this');
  }
  const page = open({ replies: [CHORDS] });
  page.choose(song());
  await until(() => !page.els.result.hidden, 'result before packing');
  page.els.share.click();
  page.els.again.click();
  await settle();
  assertEquals(page.copied.length, 0, 'invalidated packing does not write clipboard');
  assertEquals(page.location.hash, '');
});

Deno.test('reset during a pending upload ignores its result and keeps a single request until settlement', async () => {
  const response = deferred();
  const page = open({ replies: [response.promise, CHORDS] });
  page.choose(song());
  page.els.again.click();
  page.choose(song('new.mp3'));
  assertEquals(page.uploads.length, 1);
  response.resolve(CHORDS);
  await until(() => !page.els.file.disabled, 'old upload settles');
  assertEquals(page.els.result.hidden, true, 'old response cannot repopulate reset page');
  page.choose(song('new.mp3'));
  await until(() => !page.els.result.hidden, 'next intentional upload');
  assertEquals(page.uploads.length, 2);
});


Deno.test('a newly packed chart roundtrips through the actual available compression streams', async () => {
  const page = open({ replies: [CHORDS] });
  page.choose(song());
  await until(() => !page.els.result.hidden, 'source chart');
  page.els.share.click();
  await until(() => page.location.hash.startsWith('#s='), 'packed chart');
  const recipient = open({ hash: page.location.hash });
  await until(() => !recipient.els.result.hidden, 'recipient decodes chart');
  assertEquals(recipient.els.key.textContent, 'G major');
  assertEquals(recipient.els.prog.textContent, 'G  ·  Em  ·  C  ·  D');
  assertEquals(recipient.uploads.length, 0);
});
