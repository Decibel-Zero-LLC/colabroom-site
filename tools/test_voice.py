"""The site's voice, held: "Where music lives." says a lot in three words.

Feature and tool pages highlight what the app does. Ages, consent steps,
privacy mechanics and test-phase talk live in Terms and Privacy, which every
footer reaches. This holds the words people see and the words search shows;
the legal pages and the testers' door have their own rules and are left out.

Run: python3 -m unittest discover -s tools -p "test_*.py"
"""
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

OUTSIDE = {'terms.html', 'privacy.html', 'child-safety.html', 'copyright.html',
           'test.html', 'google9d25000efa91451c.html'}

# Said nowhere a visitor or a search result can read it.
GONE = ('beta', 'test build', 'in testing', 'new in october', 'not yet',
        'your build may differ', 'songwriting for musicians',
        '18 and over', '18 or over', '18+', 'from 13', '13 and over',
        'under 18', 'under-18', 'consent', 'free during')

TAGLINE = 'Where music lives.'


class Seen(HTMLParser):
    """The words on the glass, and the words handed to search and sharing."""

    def __init__(self, markup):
        super().__init__()
        self.words = []
        self.search = []
        self.footer = []
        self._skip = 0
        self._footer = 0
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('script', 'style'):
            self._skip += 1
        if tag == 'footer':
            self._footer += 1
        if tag == 'meta' and (attrs.get('name') or attrs.get('property') or '') \
                in ('description', 'og:title', 'og:description', 'og:image:alt',
                    'twitter:title', 'twitter:description'):
            self.search.append(attrs.get('content', ''))
        for name in ('alt', 'aria-label', 'placeholder'):
            if attrs.get(name):
                self.words.append(attrs[name])

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self._skip -= 1
        if tag == 'footer':
            self._footer -= 1

    def handle_data(self, data):
        if self._skip:
            return
        self.words.append(data)
        if self._footer:
            self.footer.append(data)


def pages():
    found = sorted(ROOT.glob('*.html')) + sorted((ROOT / 'musician').glob('*.html'))
    return [p for p in found if p.name not in OUTSIDE]


def flat(parts):
    return ' '.join(' '.join(parts).split())


class Voice(unittest.TestCase):
    def test_pages_say_nothing_about_betas_ages_or_consent(self):
        for page in pages():
            markup = page.read_text(encoding='utf-8')
            seen = Seen(markup)
            title = re.search(r'<title>(.*?)</title>', markup, re.S)
            said = flat(seen.words + seen.search + [title.group(1) if title else ''])
            data = ' '.join(re.findall(
                r'<script type="application/ld\+json">(.*?)</script>', markup, re.S))
            for phrase in GONE:
                with self.subTest(page=page.name, phrase=phrase):
                    self.assertNotIn(phrase, said.lower())
                    self.assertNotIn(phrase, data.lower())

    def test_no_em_dash_in_a_sentence(self):
        # A lone dash is the empty value a tool shows before it has an answer.
        for page in pages():
            markup = page.read_text(encoding='utf-8')
            seen = Seen(markup)
            title = re.search(r'<title>(.*?)</title>', markup, re.S)
            for part in seen.words + seen.search + [title.group(1) if title else '']:
                if part.strip() == '—':
                    continue
                with self.subTest(page=page.name, text=part.strip()[:60]):
                    self.assertNotIn('—', part)

    def test_one_tagline_in_every_footer(self):
        for page in pages():
            with self.subTest(page=page.name):
                footer = flat(Seen(page.read_text(encoding='utf-8')).footer)
                self.assertIn('CoLabRoom · ' + TAGLINE, footer)

    def test_the_generator_writes_the_same_footer_and_voice(self):
        source = (ROOT / 'tools' / 'build_public_pages.py').read_text(encoding='utf-8')
        self.assertIn('CoLabRoom · ' + TAGLINE, source)
        self.assertNotIn('songwriting for musicians', source.lower())
        self.assertNotIn('%20beta', source)

    def test_a_feature_page_closes_with_one_ask(self):
        for name in ('openmic', 'bands', 'teams', 'learn', 'takes', 'analysis',
                     'practise', 'songbook'):
            markup = (ROOT / (name + '.html')).read_text(encoding='utf-8')
            close = re.search(r'<div class="close">(.*?)\n  </div>', markup, re.S)
            with self.subTest(page=name):
                self.assertIsNotNone(close)
                self.assertNotIn('<p>', close.group(1))
                self.assertIn('Ask for an invite', close.group(1))

    def test_account_deletion_stays_where_the_stores_look(self):
        home = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertIn('<details class="legal" id="beta">', home)
        self.assertIn('To delete your account', home)
        self.assertIn('support@colabroom.com', home)

    def test_what_must_stay_beside_a_thing_stays(self):
        for name in ('chords.html', 'what-key.html'):
            said = flat(Seen((ROOT / name).read_text(encoding='utf-8')).words)
            with self.subTest(page=name):
                self.assertIn('songs a day · No account · We never keep your recording', said)
        learn = flat(Seen((ROOT / 'learn.html').read_text(encoding='utf-8')).words)
        self.assertIn('Clef is an AI guide.', learn)
        guess = flat(Seen((ROOT / 'analysis.html').read_text(encoding='utf-8')).words)
        self.assertIn('It tells you when it is guessing.', guess)


if __name__ == '__main__':
    unittest.main()
