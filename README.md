# colabroom.com

The marketing and account-deletion page for CoLabRoom, a songwriting app for
bands, published by Decibel Zero.

Hand-written HTML, no build step, no framework, no npm. GitHub Pages serves it
from `main`; `CNAME` points it at the custom domain. Merging is publishing.

What is in here:

- Twelve marketing pages, three free tool pages (transpose, capo, Nashville
  numbers), four legal pages, a printable flier, and `404.html`.
- The tests, run by hand from the root with Deno and nothing else:
  `deno test --allow-read tools.test.js tools/chords_test.js tools/count_test.js tools/nav_test.js`.
  `tools/nav_test.js` holds every page's nav to the front page's.
  Footer coverage, generated-page links and child-safety contact routes use
  Python’s standard library: `python3 -m unittest discover -s tools -p "test_*.py"`.
- `site.css` — the look. `fonts.css` plus `fonts/` — the three faces, served
  from this domain rather than Google's, under the OFL (see `fonts/README.md`).
- `count.js` — the arrival code and the anonymous step counters, on every
  marketing page. `chords.js` — the free chord tool. `stage.js`, `reveal.js` —
  a little motion, skipped when reduced motion is asked for. `story.css` and
  `story.js` retain the Teams page's drawings and motion.
- `experience.css` and `experience.js` — the home product tour. Its four
  scenes and notation control are clearly labelled illustrations; they do
  not record, upload or play audio. Without JavaScript all scenes are visible.
- `chrome.css` and `site-menu.js` — shared marketing/tool navigation and
  presentation; the native Explore disclosure also works without JavaScript.
  `editorial.css` gives each product chapter its layout. Legal and generated
  public-record pages retain their original presentation.
- `assets/` — compressed original campaign images and their provenance.
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

## Reviewing the visual redesign locally

From the checkout, run `python3 -m http.server 8780 --bind 127.0.0.1` and open
`http://127.0.0.1:8780/`. Explore the four song scenes, switch the sheet from
letters to numbers, open the grouped navigation, and try a chart tool. Product
illustrations are distinct from the working free tools. Existing age and beta
availability notices still apply. Local review does not publish the site.
