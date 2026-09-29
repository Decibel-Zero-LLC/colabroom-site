/* One nav on every page, held to it.

   The nav is copied into each page by hand, because the site has no build
   step and no includes. Copies drift: when Practise and Learn came in
   (September 2026), 404.html kept the old nav for a round of review
   because nothing noticed. This notices.

   Run from the repository root:

       deno test --allow-read tools/nav_test.js

   Every page at the root with a <nav class="pages"> must list the same
   places, in the same order, with the same words, as index.html. 404.html
   is served at any depth, so its links are absolute ("/takes.html"); the
   test reads them without the slash. A page marks itself as the current
   one when it is in the nav, and never marks another. The generated
   musician pages carry their own short nav and are not held to this. */

function eq(actual, expected, because) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${because}\n  got  ${a}\n  want ${b}`);
}

const ROOT = new URL('../', import.meta.url);

function navOf(html) {
  const block = html.match(/<nav class="pages">([\s\S]*?)<\/nav>/);
  if (!block) return null;
  const body = block[1].replace(/<!--[\s\S]*?-->/g, '');
  return [...body.matchAll(/<a\s+href="([^"]+)"([^>]*)>([^<]*)<\/a>/g)].map(
    ([, href, rest, label]) => ({
      href: href.replace(/^\//, ''),
      label: label.trim(),
      current: /aria-current="page"/.test(rest),
    }),
  );
}

async function pages() {
  const found = [];
  for await (const entry of Deno.readDir(ROOT)) {
    if (!entry.isFile || !entry.name.endsWith('.html')) continue;
    const html = await Deno.readTextFile(new URL(entry.name, ROOT));
    const nav = navOf(html);
    if (nav) found.push({ name: entry.name, html, nav });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

const all = await pages();
const index = all.find((p) => p.name === 'index.html');
const places = index.nav.map(({ href, label }) => ({ href, label }));

Deno.test('the front page has a nav to hold the others to', () => {
  if (places.length === 0) throw new Error('index.html has no nav links');
});

for (const page of all) {
  Deno.test(`${page.name} lists the same places as the front page`, () => {
    eq(page.nav.map(({ href, label }) => ({ href, label })), places,
      `${page.name} has drifted from index.html's nav`);
  });

  Deno.test(`${page.name} marks only itself as the current page`, () => {
    const marked = page.nav.filter((a) => a.current).map((a) => a.href);
    const inNav = places.some((p) => p.href === page.name);
    eq(marked, inNav ? [page.name] : [],
      `${page.name} marks the wrong place as current`);
  });
}

Deno.test('404.html links from the root, since it answers at any depth', async () => {
  const html = await Deno.readTextFile(new URL('404.html', ROOT));
  const block = html.match(/<nav class="pages">([\s\S]*?)<\/nav>/)[1];
  const hrefs = [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  eq(hrefs.filter((h) => !h.startsWith('/')), [],
    '404.html has a relative link in its nav');
});
