"""Every visual page carries the icon, the site name and data that parses.

Run from the repository root:
    python3 -m unittest discover -s tools -p "test_*.py"

Pure file checks with the standard library: no network, no generator run.
The Google verification file is left alone, always: Search Console re-reads
it, and it must stay exactly the one line Google gave.
"""
import json
import unittest
from html.parser import HTMLParser
from pathlib import Path

from build_public_pages import musician_page, song_page

ROOT = Path(__file__).resolve().parents[1]
VERIFICATION = 'google9d25000efa91451c.html'
ICONS = ('favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'logo-512.png')
ICON_LINKS = {
    ('icon', '/favicon.ico', None, '16x16 32x32 48x48'),
    ('icon', '/favicon.svg', 'image/svg+xml', None),
    ('apple-touch-icon', '/apple-touch-icon.png', None, None),
}
NEVER = ('aggregateRating', '"review"', 'interactionStatistic')


class Head(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.links = set()
        self.metas = []
        self.data = []
        self._script = None
        self._in_head = False
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'head':
            self._in_head = True
        if tag == 'link' and self._in_head and attrs.get('rel') in {'icon', 'apple-touch-icon'}:
            self.links.add((attrs.get('rel'), attrs.get('href'),
                            attrs.get('type'), attrs.get('sizes')))
        if tag == 'meta' and self._in_head:
            self.metas.append(attrs)
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self._script = ''

    def handle_data(self, data):
        if self._script is not None:
            self._script += data

    def handle_endtag(self, tag):
        if tag == 'head':
            self._in_head = False
        if tag == 'script' and self._script is not None:
            self.data.append(self._script)
            self._script = None


def pages():
    found = [p for p in ROOT.rglob('*.html')
             if p.name != VERIFICATION and '.git' not in p.parts]
    return sorted(found)


def generated():
    yield 'song', song_page({'id': '12345678-abcd', 'title': 'Example'})[1]
    yield 'musician', musician_page({'id': '87654321-abcd', 'display_name': 'Example',
                                     'city': 'Deltona, FL', 'plays': ['guitar']})[1]


def documents():
    for path in pages():
        yield str(path.relative_to(ROOT)), path.read_text(encoding='utf-8')
    for name, markup in generated():
        yield 'generated ' + name, markup


class HeadTest(unittest.TestCase):
    def test_the_inventory_covers_root_pages_and_records(self):
        names = [str(p.relative_to(ROOT)) for p in pages()]
        self.assertGreaterEqual(len(names), 21)
        self.assertIn('404.html', names)

    def test_the_four_icon_files_exist_and_are_what_they_say(self):
        for name in ICONS:
            self.assertTrue((ROOT / name).is_file(), name)
        png = b'\x89PNG\r\n\x1a\n'
        self.assertEqual((ROOT / 'favicon.ico').read_bytes()[:4], b'\x00\x00\x01\x00')
        for name, size in (('apple-touch-icon.png', 180), ('logo-512.png', 512)):
            data = (ROOT / name).read_bytes()
            self.assertEqual(data[:8], png, name)
            width = int.from_bytes(data[16:20], 'big')
            height = int.from_bytes(data[20:24], 'big')
            self.assertEqual((width, height), (size, size), name)
        self.assertIn('<svg', (ROOT / 'favicon.svg').read_text(encoding='utf-8'))

    def test_every_visual_page_names_the_icons_and_the_site(self):
        for name, markup in documents():
            with self.subTest(page=name):
                head = Head(markup)
                self.assertEqual(head.links, ICON_LINKS)
                names = [m.get('content') for m in head.metas
                         if m.get('property') == 'og:site_name']
                self.assertEqual(names, ['CoLabRoom'])

    def test_the_verification_file_is_untouched(self):
        self.assertEqual((ROOT / VERIFICATION).read_text(encoding='utf-8').strip(),
                         'google-site-verification: ' + VERIFICATION)

    def test_every_data_block_parses(self):
        for name, markup in documents():
            for block in Head(markup).data:
                with self.subTest(page=name):
                    self.assertIsInstance(json.loads(block), dict)

    def test_the_home_page_names_one_website_one_company_and_one_app(self):
        blocks = [json.loads(b) for b in Head((ROOT / 'index.html').read_text(encoding='utf-8')).data]
        nodes = [node for block in blocks for node in block.get('@graph', [block])]
        types = [node.get('@type') for node in nodes]
        self.assertEqual(types.count('WebSite'), 1)
        self.assertEqual(types.count('Organization'), 1)
        self.assertEqual(types.count('SoftwareApplication'), 1)
        site = next(n for n in nodes if n['@type'] == 'WebSite')
        company = next(n for n in nodes if n['@type'] == 'Organization')
        app = next(n for n in nodes if n['@type'] == 'SoftwareApplication')
        self.assertEqual(site['name'], 'CoLabRoom')
        self.assertEqual(site['url'], 'https://colabroom.com/')
        self.assertEqual(site['publisher'], {'@id': company['@id']})
        self.assertEqual(company['logo'], 'https://colabroom.com/logo-512.png')
        self.assertEqual(company['description'], 'An app for musicians.')
        self.assertNotIn('sameAs', company, 'only real company profiles, and none exist yet')
        self.assertEqual(app['url'], 'https://colabroom.com/')
        self.assertIs(app['isAccessibleForFree'], True)

    def test_no_page_invents_ratings_reviews_or_counts(self):
        for name, markup in documents():
            with self.subTest(page=name):
                for word in NEVER:
                    self.assertNotIn(word, markup)


if __name__ == '__main__':
    unittest.main()
