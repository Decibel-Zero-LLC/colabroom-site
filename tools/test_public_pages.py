"""Pure synthetic rendering checks; no RPC, file generation or production access."""
import json
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit

from build_public_pages import json_for_script, musician_page, song_page

ROOT = Path(__file__).resolve().parents[1]
VERSION = '20261025-layout'
PREVIEW = 'https://site-preview.invalid/'


class Scripts(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.scripts = []
        self.current = None
        self.body_classes = set()
        self.ids = []
        self.skip_links = []
        self.styles = []
        self.nav = []
        self.nav_count = 0
        self.menu_count = 0
        self.summaries = []
        self._in_nav = False
        self._anchor = None
        self._in_menu = False
        self._summary = None
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set(attrs.get('class', '').split())
        if tag == 'body':
            self.body_classes = classes
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'link' and attrs.get('rel') == 'stylesheet':
            self.styles.append(attrs['href'])
        if tag == 'details' and 'site-menu' in classes:
            self._in_menu = True
            self.menu_count += 1
        if tag == 'summary' and self._in_menu:
            self._summary = ''
        if tag == 'nav' and 'pages' in classes:
            self._in_nav = True
            self.nav_count += 1
        if tag == 'a':
            if 'skip-content' in classes:
                self.skip_links.append(attrs.get('href'))
            if self._in_nav:
                self._anchor = {'href': attrs.get('href'), 'text': '',
                                'current': attrs.get('aria-current')}
        if tag == 'script':
            self.current = {'attrs': attrs, 'text': ''}
            self.scripts.append(self.current)

    def handle_data(self, data):
        if self.current is not None:
            self.current['text'] += data
        if self._anchor is not None:
            self._anchor['text'] += data
        if self._summary is not None:
            self._summary += data

    def handle_endtag(self, tag):
        if tag == 'script':
            self.current = None
        if tag == 'a' and self._anchor is not None:
            self._anchor['text'] = ' '.join(self._anchor['text'].split())
            self.nav.append(self._anchor)
            self._anchor = None
        if tag == 'nav':
            self._in_nav = False
        if tag == 'summary' and self._summary is not None:
            self.summaries.append(self._summary.strip())
            self._summary = None
        if tag == 'details':
            self._in_menu = False


class PublicPagesTest(unittest.TestCase):
    attack = '</script><script>void 0</script><img src=x onerror=void(0)> & <雪>'

    def schema(self, markup):
        scripts = Scripts(markup).scripts
        schemas = [script for script in scripts
                   if script['attrs'].get('type') == 'application/ld+json']
        self.assertEqual(len(schemas), 1)
        others = [script for script in scripts if script not in schemas]
        self.assertEqual(len(others), 2, 'only the intended external presentation scripts')
        paths = []
        for script in others:
            attrs = script['attrs']
            source = attrs.get('src', '')
            url = urlsplit(source)
            self.assertEqual(url.scheme, '')
            self.assertEqual(url.netloc, '')
            self.assertTrue(source.startswith('/') and not source.startswith('//'))
            self.assertIn(url.path, {'/atmosphere.js', '/site-menu.js'})
            self.assertEqual(parse_qs(url.query), {'v': [VERSION]})
            self.assertEqual(url.fragment, '')
            self.assertEqual(attrs, {'src': source, 'defer': None})
            self.assertEqual(script['text'], '', 'no inline executable payload')
            paths.append(url.path)
        self.assertCountEqual(paths, ['/atmosphere.js', '/site-menu.js'])
        self.assertNotIn('<', schemas[0]['text'])
        return json.loads(schemas[0]['text'])

    def test_song_schema_cannot_close_script_and_roundtrips_all_authored_values(self):
        value = self.attack
        _, markup = song_page({'id': '12345678-abcd', 'title': value,
                               'owner_name': 'owner ' + value,
                               'musical_key': 'key ' + value,
                               'players': [{'name': 'player ' + value}]})
        schema = self.schema(markup)
        self.assertEqual(schema['name'], value)
        self.assertEqual(schema['byArtist']['name'], 'owner ' + value)
        self.assertEqual(schema['musicalKey'], 'key ' + value)
        self.assertEqual(schema['contributor'][0]['name'], 'player ' + value)
        self.assertNotIn(value, markup, 'visible/attribute HTML is escaped too')

    def test_musician_schema_cannot_close_script_and_roundtrips_name_and_city(self):
        _, markup = musician_page({'id': '87654321-abcd', 'display_name': self.attack,
                                   'city': 'city ' + self.attack,
                                   'plays': ['guitar'], 'sounds_like': ['jazz']})
        schema = self.schema(markup)
        self.assertEqual(schema['name'], self.attack)
        self.assertEqual(schema['address']['addressLocality'], 'city ' + self.attack)
        self.assertNotIn(self.attack, markup)

    def test_serializer_preserves_unicode_and_nested_json(self):
        value = {'x': [self.attack, '\u2028\u2029', {'quotes': '" and \\'}]}
        self.assertEqual(json.loads(json_for_script(value)), value)
        self.assertNotIn('<', json_for_script(value))
        self.assertNotIn('>', json_for_script(value))
        self.assertNotIn('&', json_for_script(value))

    def test_both_record_templates_include_the_motion_control_and_shared_fog_shell(self):
        for render in (song_page, musician_page):
            _, markup = render({'id': '12345678-abcd'})
            document = Scripts(markup)
            self.assertTrue({'site-redesign', 'record-polish', 'support-site',
                             'site-fog-page'}.issubset(document.body_classes))
            self.assertEqual(markup.count('<div class="site-fog" aria-hidden="true"></div>'), 1)
            self.assertEqual(markup.count('class="atmosphere-controls no-print" hidden'), 1)
            self.assertEqual(markup.count('data-atmosphere-label>Pause motion</span>'), 1)
            self.assertIn('aria-pressed="false"', markup)
            self.assertLess(markup.index('</h1>'), markup.index('class="atmosphere-controls'))

    def test_both_record_templates_keep_the_same_fourteen_explore_links_and_skip_target(self):
        reference = Scripts((ROOT / 'index.html').read_text())
        expected = [(urljoin(PREVIEW, link['href']), link['text'])
                    for link in reference.nav]
        self.assertEqual(len(expected), 14)
        for render in (song_page, musician_page):
            with self.subTest(renderer=render.__name__):
                _, markup = render({'id': '12345678-abcd'})
                document = Scripts(markup)
                self.assertEqual(document.menu_count, 1)
                self.assertEqual(document.summaries, ['Explore'])
                self.assertEqual(document.nav_count, 1)
                self.assertTrue(all(link['href'].startswith('/')
                                    and not link['href'].startswith('//')
                                    for link in document.nav))
                self.assertEqual([(urljoin(PREVIEW + 'record/example.html', link['href']),
                                   link['text']) for link in document.nav], expected)
                self.assertTrue(all(link['current'] is None for link in document.nav))
                self.assertEqual(document.skip_links, ['#main-content'])
                self.assertEqual(document.ids.count('main-content'), 1)

    def test_generated_stylesheets_stay_on_preview_host_and_use_the_current_version(self):
        for render in (song_page, musician_page):
            with self.subTest(renderer=render.__name__):
                _, markup = render({'id': '12345678-abcd'})
                document = Scripts(markup)
                paths = []
                for source in document.styles:
                    url = urlsplit(source)
                    self.assertEqual(url.scheme, '')
                    self.assertEqual(url.netloc, '')
                    self.assertTrue(source.startswith('/') and not source.startswith('//'))
                    self.assertEqual(parse_qs(url.query), {'v': [VERSION]})
                    self.assertEqual(url.fragment, '')
                    self.assertTrue((ROOT / url.path.lstrip('/')).is_file())
                    paths.append(url.path)
                self.assertTrue({'/fonts.css', '/site.css', '/chrome.css',
                                 '/atmosphere.css'}.issubset(paths))


if __name__ == '__main__':
    unittest.main()
