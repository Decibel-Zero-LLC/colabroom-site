"""Page data says what the page is, in schema.org's own words, and no more.

Run from the repository root:
    python3 -m unittest discover -s tools -p "test_*.py"

- No HowTo anywhere: Google retired the result in 2023 and the markup earns
  nothing. No new FAQ data either (the existing FAQPage blocks repeat
  answers that are visible on their pages).
- Each of the five tool pages has exactly one WebApplication.
- A musician page is a ProfilePage whose mainEntity is a Person.
- Every type and property used on a page or in the musician template is in
  VOCABULARY, which was checked against schema.org's type pages on
  10 November 2026 (inherited properties included). A new type or property
  goes in here only after the same check.
"""
import json
import re
import unittest
from pathlib import Path

from build_public_pages import musician_page

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ('chords.html', 'what-key.html', 'transpose.html', 'capo.html',
         'nashville-numbers.html')
BLOCK = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)

THING = {'name', 'url', 'description', 'alternateName', 'sameAs', 'image'}
CREATIVE_WORK = THING | {'publisher', 'inLanguage', 'isAccessibleForFree', 'offers',
                         'mainEntity', 'contributor'}
SOFTWARE = CREATIVE_WORK | {'applicationCategory', 'operatingSystem', 'featureList'}
VOCABULARY = {
    'WebSite': CREATIVE_WORK,
    'Organization': THING | {'logo', 'email', 'parentOrganization'},
    'SoftwareApplication': SOFTWARE,
    'WebApplication': SOFTWARE | {'browserRequirements'},
    'Offer': THING | {'price', 'priceCurrency'},
    'FAQPage': CREATIVE_WORK,
    'Question': CREATIVE_WORK | {'acceptedAnswer'},
    'Answer': CREATIVE_WORK | {'text'},
    'BreadcrumbList': THING | {'itemListElement'},
    'ListItem': THING | {'item', 'position'},
    'ProfilePage': CREATIVE_WORK,
    'Person': THING | {'address'},
    'PostalAddress': THING | {'addressLocality', 'addressRegion'},
}


def blocks(markup):
    return [json.loads(text) for text in BLOCK.findall(markup)]


def nodes(value):
    """Every object with an @type, at any depth."""
    if isinstance(value, list):
        for item in value:
            yield from nodes(item)
    elif isinstance(value, dict):
        if '@type' in value:
            yield value
        for key, item in value.items():
            if not key.startswith('@'):
                yield from nodes(item)


def top_level(markup):
    found = []
    for block in blocks(markup):
        found += block.get('@graph', [block])
    return found


def documents():
    for path in sorted(ROOT.rglob('*.html')):
        if '.git' in path.parts:
            continue
        yield path.relative_to(ROOT).as_posix(), path.read_text(encoding='utf-8')
    yield 'generated musician', musician_page(
        {'id': '87654321-abcd', 'display_name': 'Example', 'city': 'Deltona, FL',
         'plays': ['guitar'], 'sounds_like': ['folk']})[1]


class StructuredDataTest(unittest.TestCase):
    def test_no_page_carries_howto(self):
        for name, markup in documents():
            with self.subTest(page=name):
                self.assertNotIn('"HowTo', markup)

    def test_each_tool_page_has_exactly_one_web_application(self):
        for page in TOOLS:
            markup = (ROOT / page).read_text(encoding='utf-8')
            with self.subTest(page=page):
                apps = [n for n in top_level(markup) if n.get('@type') == 'WebApplication']
                self.assertEqual(len(apps), 1)
                app = apps[0]
                self.assertEqual(app['url'], 'https://colabroom.com/' + page)
                self.assertEqual(app['applicationCategory'], 'MusicApplication')
                self.assertEqual(app['operatingSystem'], 'Web')
                self.assertIs(app['isAccessibleForFree'], True)
                self.assertEqual(app['offers'], {'@type': 'Offer', 'price': '0',
                                                 'priceCurrency': 'USD'})

    def test_chords_and_key_name_their_apps_with_their_own_headings(self):
        for page, heading in (('chords.html', 'What chords is this?'),
                              ('what-key.html', 'What key is this song?')):
            markup = (ROOT / page).read_text(encoding='utf-8')
            h1 = re.search(r'<h1[^>]*>(.*?)</h1>', markup, re.S).group(1)
            self.assertEqual(' '.join(re.sub(r'<br\s*/?>', ' ', h1).split()), heading)
            app = next(n for n in top_level(markup) if n.get('@type') == 'WebApplication')
            self.assertEqual(app['name'], heading)

    def test_existing_records_and_the_template_are_profile_pages(self):
        records = [(n, m) for n, m in documents()
                   if n.startswith('musician/') or n == 'generated musician']
        self.assertGreaterEqual(len(records), 1)
        for name, markup in records:
            with self.subTest(page=name):
                data = top_level(markup)
                self.assertEqual([n['@type'] for n in data], ['ProfilePage'])
                self.assertEqual(data[0]['mainEntity']['@type'], 'Person')

    def test_every_type_and_property_is_schema_org_vocabulary(self):
        for name, markup in documents():
            for node in (n for block in blocks(markup) for n in nodes(block)):
                kind = node['@type']
                with self.subTest(page=name, type=kind):
                    self.assertIn(kind, VOCABULARY)
                    unknown = {k for k in node if not k.startswith('@')} - VOCABULARY[kind]
                    self.assertEqual(unknown, set())


if __name__ == '__main__':
    unittest.main()
