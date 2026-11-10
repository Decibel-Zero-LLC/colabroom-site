"""Synthetic checks only: made-up rows, a throwaway folder, no RPC or production access."""
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from html.parser import HTMLParser
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urljoin, urlsplit

import build_public_pages as generator
from build_public_pages import json_for_script, musician_page, song_page

ROOT = Path(__file__).resolve().parents[1]
VERSION = '20261110-nav'
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
        person = schema['mainEntity']
        self.assertEqual(person['name'], self.attack)
        self.assertEqual(person['address']['addressLocality'], 'city ' + self.attack)
        self.assertNotIn('addressRegion', person['address'])
        self.assertNotIn(self.attack, markup)

    def test_musician_page_is_a_profile_page_about_one_person(self):
        url, markup = musician_page({'id': '87654321-abcd', 'display_name': 'Example',
                                     'city': 'Deltona, FL', 'plays': ['guitar']})
        schema = self.schema(markup)
        self.assertEqual(schema['@type'], 'ProfilePage')
        self.assertEqual(schema['mainEntity']['@type'], 'Person')
        self.assertEqual(schema['mainEntity']['url'], url)
        # Nothing the row does not carry: no dates until updated_at exists.
        for field in ('dateCreated', 'dateModified', 'description', 'image'):
            self.assertNotIn(field, schema)
            self.assertNotIn(field, schema['mainEntity'])

    def test_musician_city_and_state_are_separate_fields(self):
        _, markup = musician_page({'id': '87654321-abcd', 'display_name': 'Example',
                                   'city': 'Deltona, FL'})
        address = self.schema(markup)['mainEntity']['address']
        self.assertEqual(address, {'@type': 'PostalAddress',
                                   'addressLocality': 'Deltona', 'addressRegion': 'FL'})

    def test_musician_city_without_a_state_stays_whole_with_no_region(self):
        for city in ('Orlando', 'Paris, France'):
            with self.subTest(city=city):
                _, markup = musician_page({'id': '87654321-abcd', 'display_name': 'Example',
                                           'city': city})
                address = self.schema(markup)['mainEntity']['address']
                self.assertEqual(address, {'@type': 'PostalAddress', 'addressLocality': city})
        _, markup = musician_page({'id': '87654321-abcd', 'display_name': 'Example'})
        self.assertNotIn('address', self.schema(markup)['mainEntity'])

    def test_generated_share_image_states_its_size_and_alt(self):
        for render in (song_page, musician_page):
            with self.subTest(renderer=render.__name__):
                _, markup = render({'id': '12345678-abcd'})
                self.assertIn('<meta property="og:image:width" content="1200">', markup)
                self.assertIn('<meta property="og:image:height" content="630">', markup)
                self.assertIn('<meta property="og:image:alt" content="CoLabRoom">', markup)

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
            footer = markup[markup.index('<footer'):markup.index('</footer>')]
            self.assertEqual(footer.count('class="atmosphere-controls no-print" hidden'), 1)
            self.assertGreater(markup.index('class="atmosphere-controls'), markup.index('</main>'))
            self.assertNotIn('ex-motion-toggle', markup)

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


class NewPeoplePagesArePausedTest(unittest.TestCase):
    """The whole nightly run on made-up rows; no network, a throwaway folder.

    10 November 2026: no new musician pages until the app asks separately.
    """
    kept_id = 'aaaa1111-0000-4000-8000-000000000001'
    new_id = 'bbbb2222-0000-4000-8000-000000000002'
    kept_name = 'Keptperson Zyx'
    new_name = 'Newperson Qwv'

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.site = Path(self.folder.name) / 'site'
        self.site.mkdir()
        self.kept_slug = generator.slug(self.kept_name, self.kept_id)
        self.kept_file = Path(self.folder.name) / 'kept.txt'
        self.kept_file.write_text('# a comment line\n\n%s\n' % self.kept_slug,
                                  encoding='utf-8')
        self.people = []
        patches = [
            mock.patch.object(generator, 'KEPT_MUSICIANS', str(self.kept_file)),
            mock.patch.object(generator, 'rpc', self.fake_rpc),
            mock.patch.dict(os.environ, {'SUPABASE_PROJECT_REF': 'test',
                                         'SUPABASE_ANON_KEY': 'test',
                                         'SITE_DIR': str(self.site)}),
        ]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)
        self.addCleanup(self.folder.cleanup)

    def fake_rpc(self, ref, key, fn, payload):
        return {'public_songs': [], 'public_musicians': self.people}[fn]

    def row(self, unique, name, city='Townsville'):
        return {'id': unique, 'display_name': name, 'plays': ['guitar'],
                'sounds_like': ['jazz'], 'city': city, 'bio': None}

    def run_job(self):
        out = io.StringIO()
        with redirect_stdout(out):
            generator.main()
        return out.getvalue()

    def pages(self):
        folder = self.site / 'musician'
        return sorted(p.name for p in folder.iterdir()) if folder.is_dir() else []

    def sitemap(self):
        return (self.site / 'sitemap-pages.xml').read_text(encoding='utf-8')

    def test_a_newly_listed_person_gets_no_page_and_is_not_in_the_sitemap(self):
        self.people = [self.row(self.new_id, self.new_name)]
        log = self.run_job()
        self.assertEqual(self.pages(), [])
        self.assertNotIn('musician/', self.sitemap())
        self.assertIn('held: 1 (waiting for the web-page choice)', log)

    def test_a_person_on_the_list_still_gets_their_page(self):
        self.people = [self.row(self.kept_id, self.kept_name),
                       self.row(self.new_id, self.new_name)]
        log = self.run_job()
        self.assertEqual(self.pages(), [self.kept_slug + '.html'])
        self.assertIn('/musician/%s.html' % self.kept_slug, self.sitemap())
        self.assertEqual(self.sitemap().count('<loc>'), 1)
        self.assertIn('held: 1 (waiting for the web-page choice)', log)

    def test_a_person_on_the_list_who_unlists_loses_their_page(self):
        self.people = [self.row(self.kept_id, self.kept_name)]
        self.run_job()
        self.assertEqual(self.pages(), [self.kept_slug + '.html'])
        self.people = []  # no longer listed, so no longer a row
        log = self.run_job()
        self.assertEqual(self.pages(), [])
        self.assertNotIn('musician/', self.sitemap())
        self.assertIn('removed: 1', log)

    def test_a_held_persons_stray_page_is_removed_not_kept(self):
        stray = self.site / 'musician' / (generator.slug(self.new_name, self.new_id) + '.html')
        stray.parent.mkdir()
        stray.write_text('<p>old</p>', encoding='utf-8')
        self.people = [self.row(self.new_id, self.new_name)]
        self.run_job()
        self.assertEqual(self.pages(), [])

    def test_the_log_never_names_anybody(self):
        self.people = [self.row(self.kept_id, self.kept_name),
                       self.row(self.new_id, self.new_name)]
        log = self.run_job()
        for secret in (self.kept_name, self.new_name, 'Keptperson', 'Newperson',
                       'keptperson', 'newperson', self.kept_id[:8],
                       self.new_id[:8], 'Townsville'):
            self.assertNotIn(secret, log)

    def test_a_missing_list_stops_before_anything_is_written_or_removed(self):
        page = self.site / 'musician' / (self.kept_slug + '.html')
        page.parent.mkdir()
        page.write_text('<p>still here</p>', encoding='utf-8')
        self.kept_file.unlink()
        self.people = [self.row(self.new_id, self.new_name)]
        with self.assertRaises(SystemExit):
            self.run_job()
        self.assertEqual(self.pages(), [self.kept_slug + '.html'])
        self.assertFalse((self.site / 'sitemap-pages.xml').exists())


class TheRealListTest(unittest.TestCase):
    def test_the_list_only_ever_holds_pages_that_existed_on_10_november_2026(self):
        kept = generator.kept_musicians()
        self.assertTrue(kept <= {'musician/bam-98ecbf44.html',
                                 'musician/taylor-e01fede7.html'},
                        'adding a person here is the decision that was paused')

    def test_robots_does_not_point_crawlers_at_peoples_pages(self):
        lines = [line.strip() for line in
                 (ROOT / 'robots.txt').read_text(encoding='utf-8').splitlines()]
        sitemaps = [line for line in lines if line.lower().startswith('sitemap:')]
        self.assertEqual(sitemaps, ['Sitemap: https://colabroom.com/sitemap.xml'])
        self.assertTrue((ROOT / 'sitemap-pages.xml').is_file(), 'the file itself stays')


if __name__ == '__main__':
    unittest.main()
