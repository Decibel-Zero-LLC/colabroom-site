/* Every visual page, including nested public records, shares the same doors.
   Run: deno test --allow-read tools/nav_test.js
   Verification-only HTML is deliberately excluded. Asset query versions keep
   a fresh shell from silently loading an earlier cached layout or controller. */

const ROOT = new URL('../', import.meta.url);
const PREVIEW = 'https://site-preview.invalid/';
const VERSION = '20261025-layout';

function eq(actual, expected, because) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${because}\n  got  ${a}\n  want ${b}`);
}

function attributes(source) {
  return Object.fromEntries([...source.matchAll(
    /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )].map(([, key, double, single, bare]) => [key, double ?? single ?? bare ?? '']));
}

function hasClass(attrs, name) {
  return (attrs.class ?? '').split(/\s+/).includes(name);
}

function tags(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))]
    .map(([, source]) => attributes(source));
}

function route(href, page) {
  const target = new URL(href, new URL(page, PREVIEW));
  if (target.origin !== new URL(PREVIEW).origin) {
    throw new Error(`${page} leaves its preview host through ${href}`);
  }
  return target.pathname.slice(1) + target.search + target.hash;
}

function navOf(html, page) {
  const blocks = [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/g)]
    .filter(([, attrs]) => hasClass(attributes(attrs), 'pages'));
  if (blocks.length !== 1) return null;
  return [...blocks[0][2].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    .map(([, source, text]) => {
      const attrs = attributes(source);
      return { href: route(attrs.href, page), rawHref: attrs.href,
        label: text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
        current: attrs['aria-current'] === 'page' };
    });
}

async function pages(folder = '') {
  const found = [];
  for await (const entry of Deno.readDir(new URL(folder, ROOT))) {
    if (entry.name.startsWith('.')) continue;
    const name = folder + entry.name;
    if (entry.isDirectory) found.push(...await pages(name + '/'));
    if (!entry.isFile || !name.endsWith('.html')
        || name === 'google9d25000efa91451c.html') continue;
    const html = (await Deno.readTextFile(new URL(name, ROOT)))
      .replace(/<!--[\s\S]*?-->/g, '');
    found.push({ name, html });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

const all = await pages();
const index = all.find((p) => p.name === 'index.html');
const reference = navOf(index.html, index.name) ?? [];
const places = reference.map(({ href, label }) => ({ href, label }));

Deno.test('the inventory includes all visual root pages and nested public records', () => {
  if (all.length < 23 || !all.some((page) => page.name.includes('/'))) {
    throw new Error('visual page inventory was narrowed or lost nested records');
  }
  eq(places.length, 14, 'the shared Explore must retain all fourteen destinations');
});

for (const page of all) {
  Deno.test(`${page.name} has the shared Explore and its fourteen destinations`, () => {
    const menus = [...page.html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)]
      .filter(([, attrs]) => hasClass(attributes(attrs), 'site-menu'));
    eq(menus.length, 1, `${page.name} needs one native Explore disclosure`);
    const summary = menus[0][2].match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1];
    eq(summary?.replace(/<[^>]*>/g, '').trim(), 'Explore', 'the navigation door keeps its name');
    const nav = navOf(menus[0][2], page.name);
    eq(nav?.map(({ href, label }) => ({ href, label })), places,
      `${page.name} has drifted from index.html's destinations`);
  });

  Deno.test(`${page.name} marks only itself as the current page`, () => {
    const nav = navOf(page.html, page.name);
    if (!nav) throw new Error(`${page.name} is missing its shared navigation`);
    const marked = nav.filter((a) => a.current).map((a) => a.href);
    const inNav = places.some((p) => p.href === page.name);
    eq(marked, inNav ? [page.name] : [], `${page.name} marks the wrong place as current`);
  });

  Deno.test(`${page.name} has a local skip link and one content target`, () => {
    const skips = tags(page.html, 'a').filter((attrs) => hasClass(attrs, 'skip-content'));
    eq(skips.length, 1, `${page.name} needs one skip-content link`);
    eq(skips[0].href, '#main-content', 'skip stays on the current page');
    const targets = [...page.html.matchAll(/<[^/!][^>]*\bid=["']main-content["'][^>]*>/g)];
    eq(targets.length, 1, `${page.name} needs exactly one main-content target`);
  });

  Deno.test(`${page.name} loads current local presentation and tool assets`, async () => {
    const assets = [
      ...tags(page.html, 'link').filter((a) => a.rel === 'stylesheet').map((a) => a.href),
      ...tags(page.html, 'script').filter((a) => a.src).map((a) => a.src),
    ];
    const paths = [];
    for (const href of assets) {
      const url = new URL(href, new URL(page.name, PREVIEW));
      // The existing QR library is external; local presentation never escapes
      // to production merely because the preview runs on a different host.
      if (url.origin !== new URL(PREVIEW).origin) {
        if (url.hostname === 'colabroom.com') throw new Error(`${page.name} loads production asset ${href}`);
        continue;
      }
      eq(url.searchParams.get('v'), VERSION, `${page.name}: stale asset reference ${href}`);
      const stat = await Deno.stat(new URL(url.pathname.slice(1), ROOT));
      eq(stat.isFile, true, `${page.name}: missing local asset ${href}`);
      paths.push(url.pathname);
    }
    for (const expected of ['/fonts.css', '/chrome.css', '/atmosphere.css', '/site-menu.js', '/atmosphere.js']) {
      if (!paths.includes(expected)) throw new Error(`${page.name} is missing ${expected}`);
    }
    if (page.name.includes('/') || ['privacy.html', 'terms.html', 'copyright.html',
      'child-safety.html', 'flier.html'].includes(page.name)) {
      eq(paths.includes('/count.js'), false, `${page.name} must not gain page counters`);
    }
  });
}

Deno.test('404 and nested records resolve shared navigation from their own location', () => {
  for (const page of all.filter((p) => p.name === '404.html' || p.name.includes('/'))) {
    const nav = navOf(page.html, page.name);
    if (!nav) throw new Error(`${page.name} lacks navigation`);
    eq(nav.filter((a) => !a.rawHref.startsWith('/') || a.rawHref.startsWith('//')), [],
      `${page.name} must use same-host root-relative navigation`);
  }
});
