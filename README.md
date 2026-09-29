# colabroom.com

The marketing and account-deletion page for CoLabRoom, a songwriting app for
bands, published by Decibel Zero.

Hand-written HTML, no build step, no framework, no npm. GitHub Pages serves it
from `main`; `CNAME` points it at the custom domain. Merging is publishing.

What is in here:

- Eleven marketing pages, three free tool pages (transpose, capo, Nashville
  numbers), three legal pages, a printable flier, and `404.html`.
- The tests, run by hand from the root with Deno and nothing else:
  `deno test --allow-read tools.test.js tools/chords_test.js tools/count_test.js tools/nav_test.js`.
  `tools/nav_test.js` holds every page's nav to the front page's.
- `site.css` — the look. `fonts.css` plus `fonts/` — the three faces, served
  from this domain rather than Google's, under the OFL (see `fonts/README.md`).
- `count.js` — the arrival code and the anonymous step counters, on every
  marketing page. `chords.js` — the free chord tool. `stage.js`, `reveal.js` —
  a little motion, skipped when reduced motion is asked for.
- `tools/build_public_pages.py` — the nightly job that writes a page per
  showcased song and discoverable musician, and `sitemap-pages.xml` for them.

The division of labour with the app is fixed and should not be relitigated:
**the app is the product, this site is the index.** Nothing on
`app.colabroom.com` is indexable — it is a canvas app behind `Disallow: /` —
so everything that can ever be found has to be real HTML here.

Deliberately a separate repository from the app: the app repo carries working
notes in `docs/` that have no business being served as a website.

The account-deletion section is not decoration — Google Play and the App Store
both require a publicly reachable deletion route, and this page is it. Keep it
reachable and keep the support address live.
