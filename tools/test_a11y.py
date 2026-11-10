"""The basic accessibility rules every page keeps.

Run from the repository root:
    python3 -m unittest discover -s tools -p "test_*.py"

Every <img> has an alt (empty is right for a decoration); every rendered
input, select and textarea has a label (a <label for>, a wrapping <label>,
aria-label or aria-labelledby); <html lang> is set; each page has exactly
one <h1>; no tabindex is above 0. Pure file checks with the standard
library, on every page and on the generator's rendered templates.
"""
import unittest
from html.parser import HTMLParser
from pathlib import Path

from build_public_pages import musician_page, song_page

ROOT = Path(__file__).resolve().parents[1]
VERIFICATION = 'google9d25000efa91451c.html'
UNLABELLED_TYPES = {'hidden', 'submit', 'button', 'reset', 'image'}


class Page(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.lang = None
        self.h1 = 0
        self.images_without_alt = []
        self.fields = []
        self.label_for = set()
        self.ids = set()
        self.positive_tabindex = []
        self._labels = 0
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        if tag == 'html':
            self.lang = attrs.get('lang')
        if tag == 'h1':
            self.h1 += 1
        if tag == 'img' and 'alt' not in attrs:
            self.images_without_alt.append(attrs.get('src'))
        if tag == 'label':
            self._labels += 1
            if attrs.get('for'):
                self.label_for.add(attrs['for'])
        if tag in {'input', 'select', 'textarea'}:
            kind = (attrs.get('type') or 'text').lower() if tag == 'input' else tag
            # A field with the hidden attribute is not rendered and not in
            # the accessibility tree (chords.html's file input, opened by a
            # labelled button), so it needs no label of its own.
            if kind not in UNLABELLED_TYPES and 'hidden' not in attrs:
                self.fields.append((tag, attrs, self._labels > 0))
        tabindex = attrs.get('tabindex')
        if tabindex is not None and tabindex.strip().lstrip('-').isdigit() \
                and int(tabindex) > 0:
            self.positive_tabindex.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == 'label' and self._labels:
            self._labels -= 1

    def unlabelled(self):
        missing = []
        for tag, attrs, wrapped in self.fields:
            if wrapped or attrs.get('aria-label', '').strip():
                continue
            if attrs.get('id') in self.label_for:
                continue
            labelled_by = attrs.get('aria-labelledby', '').split()
            if labelled_by and all(i in self.ids for i in labelled_by):
                continue
            missing.append('%s#%s' % (tag, attrs.get('id') or attrs.get('name') or '?'))
        return missing


def documents():
    for path in sorted(ROOT.rglob('*.html')):
        if path.name == VERIFICATION or '.git' in path.parts:
            continue
        yield path.relative_to(ROOT).as_posix(), path.read_text(encoding='utf-8')
    yield 'generated song', song_page({'id': '12345678-abcd', 'title': 'Example'})[1]
    yield 'generated musician', musician_page({'id': '87654321-abcd', 'display_name': 'Example'})[1]


class AccessibilityTest(unittest.TestCase):
    def test_every_page(self):
        checked = 0
        for name, markup in documents():
            page = Page(markup)
            checked += 1
            with self.subTest(page=name):
                self.assertTrue((page.lang or '').strip(), 'html lang is missing')
                self.assertEqual(page.h1, 1, 'one <h1> per page')
                self.assertEqual(page.images_without_alt, [], 'img without alt')
                self.assertEqual(page.unlabelled(), [], 'field without a label')
                self.assertEqual(page.positive_tabindex, [], 'tabindex above 0')
        self.assertGreaterEqual(checked, 23)


if __name__ == '__main__':
    unittest.main()
