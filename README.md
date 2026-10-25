# colabroom.com

The marketing and account-deletion page for CoLabRoom, a songwriting app for
bands, published by Decibel Zero.

Hand-written HTML, no build step, no framework, no npm. GitHub Pages serves it
from `main`; `CNAME` points it at the custom domain. Merging is publishing.

What is in here:

- Ten marketing pages, five free tool pages (chords, key, transpose, capo,
  Nashville numbers), four legal pages, public musician/song records, a
  printable flier, and `404.html`.
- The tests, run by hand from the root with Deno and nothing else:
  `deno test --allow-read tools.test.js tools/chords_test.js tools/count_test.js tools/nav_test.js`.
  `tools/nav_test.js` holds every page's nav to the front page's.
  Footer coverage, generated-page links and child-safety contact routes use
  Python’s standard library: `python3 -m unittest discover -s tools -p "test_*.py"`.
- `site.css` — the look. `fonts.css` plus `fonts/` — the three faces, served
  from this domain rather than Google's, under the OFL (see `fonts/README.md`).
- `count.js` — the arrival code and the anonymous step counters, on every
  marketing page. `chords.js` — the free chord tool. `story.css` retains the
  Teams page's finished drawings; the older decorative stage/reveal/story
  scripts are no longer loaded by the product chapters.
- `experience.css` and `experience.js` — the home product tour. Its four
  scenes and notation control are clearly labelled illustrations; they do
  not record, upload or play audio. Without JavaScript all scenes are visible.
- `chrome.css` and `site-menu.js` — shared marketing/tool navigation and
  presentation; the native Explore disclosure also works without JavaScript.
  `editorial.css` gives each product chapter its layout.
- `atmosphere.css` and `atmosphere.js` — blue light and restrained movement
  across every visual page. Two layers of the approved blue texture drift
  slowly through the viewport; legal, public-record and flier pages use a
  quieter treatment. Pause/Resume, reduced motion, hidden tabs and printing
  stop movement. Without JavaScript, content stays visible and the fog is
  still. Tool inputs, charts, captures and printed output stay clear.
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

The completion pass adds actual native Account, Profile and Team captures to
their relevant pages, with example-content and in-testing captions. Their
unchanged source paths and hashes are in `assets/app-screens.json`; these are
Flutter render fixtures, not store-release or physical-device evidence. Learn
describes the real chosen-song practice and deliberate take-sharing flow.

PR #42 remains the single website redesign review. Publication is still held.
Terms and Child safety now follow the approved age rules, with an unpublished
25 October change note. The normal owner/legal launch review is still owed;
this wording reconciliation is not counsel clearance or permission to publish.
The subsequent page-by-page visual pass leaves all four legal pages' wording
unchanged. The public account-deletion section retains its closure, room and
shared-music explanation, corrected settings path and existing legal/safety
preservation exception. Public-page generation retains consent, visibility and deletion behavior. Its
shared presentation shell now includes the fog, and JSON-LD safely escapes
user-supplied text before embedding it in HTML. Pure local tests cover this;
the live generator has not been run.

The final walkthrough also repairs malformed shared-chart links, overlapping
uploads and stale chart URLs. The chord tool permits one upload at a time,
restores its normal starting view for another song and ignores stale deferred
link work. Provider limits and data handling remain unchanged; browser checks
use synthetic responses, not paid or live uploads.
