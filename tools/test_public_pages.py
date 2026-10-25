"""Pure synthetic rendering checks; no RPC, file generation or production access."""
import json
import unittest
from html.parser import HTMLParser

from build_public_pages import json_for_script, musician_page, song_page


class Scripts(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.scripts = []
        self.current = None
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.current = {'attrs': dict(attrs), 'text': ''}
            self.scripts.append(self.current)

    def handle_data(self, data):
        if self.current is not None:
            self.current['text'] += data

    def handle_endtag(self, tag):
        if tag == 'script':
            self.current = None


class PublicPagesTest(unittest.TestCase):
    attack = '</script><script>void 0</script><img src=x onerror=void(0)> & <雪>'

    def schema(self, markup):
        scripts = Scripts(markup).scripts
        schemas = [script for script in scripts
                   if script['attrs'].get('type') == 'application/ld+json']
        self.assertEqual(len(schemas), 1)
        others = [script for script in scripts if script not in schemas]
        self.assertEqual(len(others), 1, 'only the intended external atmosphere script')
        self.assertEqual(others[0]['attrs'],
                         {'src': 'https://colabroom.com/atmosphere.js', 'defer': None})
        self.assertEqual(others[0]['text'], '')
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
            self.assertIn('<body class="record-polish site-fog-page">', markup)
            self.assertEqual(markup.count('<div class="site-fog" aria-hidden="true"></div>'), 1)
            self.assertEqual(markup.count('class="atmosphere-controls no-print" hidden'), 1)
            self.assertEqual(markup.count('data-atmosphere-label>Pause motion</span>'), 1)
            self.assertIn('aria-pressed="false"', markup)
            self.assertLess(markup.index('</h1>'), markup.index('class="atmosphere-controls'))


if __name__ == '__main__':
    unittest.main()
