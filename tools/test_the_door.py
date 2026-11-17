"""The testers' door (test.html, served at /test) keeps its own rules.

Run from the repository root:
    python3 -m unittest discover -s tools -p "test_*.py"

The page is private and this repository is public, so these are the things
that must stay true of it: no search engine is asked in, nothing leads to it,
it talks to one address and nothing else, and neither the password nor
anything made from it is anywhere in these files. Pure file checks with the
standard library.
"""
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'test.html'
STYLE = ROOT / 'the-door.css'
SCRIPT = ROOT / 'the-door.js'
OWN = (PAGE, STYLE, SCRIPT)
STILLS = [ROOT / 'assets' / 'the-door' / ('%s-%s.webp' % (state, cut))
          for state in ('waiting', 'open') for cut in ('tall', 'mid', 'wide')]

# Every word a visitor can be shown or read aloud. Adding one is a decision.
SEEN = {'CoLab', 'Room', 'Where music lives.', 'Password', 'Come in',
        'iPhone', 'Android', 'This page needs JavaScript.'}
SAID = {'You’re in.', 'Where music lives.', 'The password first.',
        'Not that one. Try again.', 'The doors are closed for now.',
        'The door didn’t answer. Try again.', 'Too many tries. Try again later.',
        'Too many tries. Try again after ', 'The password again.', 'One moment.',
        'Show password', 'Hide password', 'Get CoLabRoom for iPhone',
        'Get CoLabRoom for Android'}


def text(path):
    return path.read_text(encoding='utf-8')


class Page(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.metas, self.urls, self.words, self.tags = [], [], [], []
        self._quiet = 0
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if tag == 'meta':
            self.metas.append(attrs)
        for name in ('href', 'src', 'action', 'poster', 'data', 'srcset'):
            if attrs.get(name):
                self.urls.append((tag, name, attrs[name]))
        if tag in ('script', 'style', 'title'):
            self._quiet += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'title'):
            self._quiet -= 1

    def handle_data(self, data):
        if not self._quiet and data.strip():
            self.words.append(' '.join(data.split()))


def strings(source):
    """The string literals of a script, comments left out."""
    source = re.sub(r'/\*.*?\*/', '', source, flags=re.S)
    source = re.sub(r'(^|[^:\'"])//[^\n]*', r'\1', source)
    return re.findall(r"'((?:[^'\\\n]|\\.)*)'", source)


class TheDoorTest(unittest.TestCase):
    def setUp(self):
        self.page = Page(text(PAGE))
        self.script = text(SCRIPT)
        self.endpoint = re.search(r"var ENDPOINT = '([^']+)';", self.script).group(1)

    def test_no_search_engine_is_asked_in(self):
        robots = [m.get('content', '') for m in self.page.metas if m.get('name') == 'robots']
        self.assertEqual(len(robots), 1)
        self.assertIn('noindex', robots[0])
        self.assertIn('nofollow', robots[0])
        self.assertFalse([m for m in self.page.metas if m.get('rel') == 'canonical'])

    def test_it_is_in_no_sitemap_and_robots_txt_does_not_point_at_it(self):
        for name in ('sitemap.xml', 'sitemap-pages.xml', 'robots.txt'):
            listing = text(ROOT / name)
            # A Disallow line would announce the address to anyone who reads it.
            self.assertNotRegex(listing, r'(?i)colabroom\.com/test\b|/test(\.html)?\s*$|the-door', name)
            for line in listing.splitlines():
                self.assertNotRegex(line, r'/test(\.html)?(\s|<|$)', name)

    def test_no_search_engine_is_told_it_changed(self):
        # The IndexNow workflow announces every changed root page; not this one.
        workflow = text(ROOT / '.github' / 'workflows' / 'indexnow.yml')
        skip = re.search(r"SKIP = \{([^}]*)\}", workflow).group(1)
        self.assertIn("'test.html'", skip)
        self.assertIn('if name in SKIP or not', workflow)

    def test_without_script_or_inside_a_frame_there_is_no_form(self):
        html = [a for t, a in self.page.tags if t == 'html'][0]
        self.assertIn('no-js', html.get('class', '').split())
        self.assertIn("root.classList.remove('no-js');", self.script)
        self.assertIn("if (framed) root.classList.add('framed');", self.script)
        self.assertIn("if (framed) { no('unreachable'); return; }", self.script)
        self.assertRegex(text(STYLE), r'\.no-js \.floor, \.framed \.floor \{ display: none; \}')
        # Even with the policy gone, what is typed could never reach an address bar.
        self.assertEqual([a.get('method') for t, a in self.page.tags if t == 'form'], ['post'])
        self.assertNotIn('action', [a for t, a in self.page.tags if t == 'form'][0])

    def test_a_door_that_does_not_answer_is_given_up_on(self):
        js = self.script
        self.assertIn('new AbortController()', js)
        self.assertRegex(js, r"setTimeout\(function \(\) \{\s*if \(done\) return;\s*done = true;\s*if \(stop\) stop\.abort\(\);\s*no\('unreachable'\);\s*\}, PATIENCE\);")
        self.assertIn('signal: stop ? stop.signal : undefined', js)

    def test_it_rests(self):
        js, css = self.script, text(STYLE)
        # At rest nothing is asked of the screen: no frame is requested.
        self.assertRegex(js, r"resting = true; root\.classList\.add\('resting'\);\s*return;")
        self.assertIn("powerPreference: 'default'", js)
        self.assertIn('.gl.resting .pill::before { animation-play-state: paused; }', css)
        self.assertNotRegex(css, r'(?m)^\.pill::before \{[^}]*animation:')

    def test_nothing_else_leads_to_it(self):
        leads = re.compile(r'''(?i)(href|src|action|content|url)\s*[=(:]\s*["']?[^"'\s>)]*(?<![\w.-])(test\.html|/test)(?![\w/-])''')
        for path in sorted(ROOT.rglob('*')):
            if (not path.is_file() or '.git' in path.parts or 'tools' in path.relative_to(ROOT).parts
                    or path in OWN or path.suffix not in {'.html', '.js', '.css', '.xml', '.txt', '.json', '.yml'}
                    or path.name == 'tools.test.js'):
                continue
            body = text(path)
            with self.subTest(file=str(path.relative_to(ROOT))):
                self.assertIsNone(leads.search(body))
                self.assertNotIn('the-door', body)

    def test_it_carries_none_of_the_shared_doors_or_counters(self):
        body = text(PAGE)
        for shared in ('count.js', 'site-menu.js', 'atmosphere', 'chrome.css', 'site.css', '<footer', 'class="pages"'):
            self.assertNotIn(shared, body)
        links = [a for tag, a in self.page.tags if tag == 'a']
        self.assertEqual(sorted(a.get('id') for a in links), ['android', 'ios'])
        for a in links:
            self.assertEqual(a.get('href'), '#')
            self.assertEqual(a.get('rel'), 'noopener noreferrer')

    def test_every_file_it_loads_is_this_site_s_own(self):
        for tag, name, url in self.page.urls:
            with self.subTest(url=url):
                self.assertNotRegex(url, r'^(?:[a-z][a-z0-9+.-]*:|//)', 'an outside address')
                if url != '#':
                    self.assertTrue((ROOT / url.lstrip('/')).is_file(), url)
        for url in re.findall(r'url\(\s*["\']?([^"\')]+)', text(STYLE)):
            with self.subTest(url=url):
                self.assertNotRegex(url, r'^(?:[a-z][a-z0-9+.-]*:|//)')
                self.assertTrue((ROOT / url).is_file(), url)
        self.assertNotIn('@import', text(STYLE))
        for path in OWN:
            outside = set(re.findall(r'https?://[^\s"\'<>);]+', text(path)))
            self.assertLessEqual(outside, {self.endpoint, re.match(r'https://[^/]+', self.endpoint).group(0)},
                                 path.name)

    def test_the_one_address_is_the_only_thing_it_talks_to(self):
        js = self.script
        self.assertRegex(self.endpoint, r'^https://[a-z0-9]+\.supabase\.co/functions/v1/tester-door$')
        self.assertEqual(len(re.findall(r'\bfetch\s*\(', js)), 1)
        self.assertIn('fetch(ENDPOINT,', js)
        self.assertEqual(js.count('ENDPOINT'), 2, 'declared once, used once')
        for other in ('XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'importScripts',
                      'import(', 'navigator.serviceWorker', 'window.open', 'postMessage', '<iframe',
                      'document.cookie', 'localStorage', 'eval(', 'new Function', 'innerHTML'):
            self.assertNotIn(other, js, other)
        self.assertEqual(re.findall(r"\.src\s*=\s*([^;]+);", js), ["'assets/the-door/open-' + cut + '.webp'"])
        self.assertIn("credentials: 'omit'", js)
        self.assertIn("referrerPolicy: 'no-referrer'", js)
        # The browser is told the same thing, so a slip here could not leave.
        policy = [m['content'] for m in self.page.metas if m.get('http-equiv') == 'Content-Security-Policy']
        self.assertEqual(len(policy), 1)
        rules = dict(part.strip().split(' ', 1) for part in policy[0].split(';') if part.strip())
        self.assertEqual(rules['default-src'], "'none'")
        self.assertEqual(rules['connect-src'], re.match(r'https://[^/]+', self.endpoint).group(0))
        for kind in ('script-src', 'style-src', 'img-src', 'font-src'):
            self.assertEqual(rules[kind], "'self'", kind)
        self.assertEqual(rules['form-action'], "'none'")

    def test_the_password_is_checked_nowhere_here_and_kept_nowhere(self):
        for path in OWN:
            body = text(path)
            with self.subTest(file=path.name):
                # Nothing a password could be checked against: no digest, no
                # salt, no long run of hex or base64, no digest function.
                self.assertNotRegex(body, r'(?i)pbkdf|sha-?(1|256|384|512)|md5|bcrypt|scrypt|argon|hmac|crypto\.subtle|\bsalt\b|\bhash\b|digest|TESTER_DOOR')
                self.assertNotRegex(body, r'(?<![0-9A-Fa-f])[0-9A-Fa-f]{24,}(?![0-9A-Fa-f])')
                for run in re.findall(r'[A-Za-z0-9+/_-]{40,}', body):
                    self.assertFalse(re.search(r'[0-9]', run) and re.search(r'[A-Za-z]', run)
                                     and '/' not in run.strip('/') and '-' not in run, run)
        js = self.script
        # What is typed is read in exactly one place, and handed to ask().
        reads = re.findall(r'[^\n]*\bpw\.value\b(?!\s*=[^=])[^\n]*', js)
        self.assertEqual([r.strip() for r in reads],
                         ['if (!pw.value) {', 'ask(pw.value, function (links) {'])
        self.assertNotRegex(js, r'''(password|pw\.value)\s*[!=]==?\s*['"]''')
        self.assertNotRegex(js, r'''['"]\s*[!=]==?\s*(password|pw\.value)''')
        # This session remembers the two links and when it got them. No more.
        kept = re.findall(r'sessionStorage\.setItem\(([^;]+)\);', js)
        self.assertEqual(kept, ['KEPT, JSON.stringify({ ios_url: links.ios_url, android_url: links.android_url, at: keptAt })'])
        self.assertIn("pw.value = '';", js)
        field = [a for tag, a in self.page.tags if tag == 'input']
        self.assertEqual(len(field), 1)
        self.assertEqual(field[0].get('type'), 'password')
        self.assertEqual(field[0].get('autocomplete'), 'off')
        self.assertNotIn('value', field[0])

    def test_the_demo_answers_only_on_this_machine(self):
        js = self.script
        self.assertIn("var arg = function (name) { return local ? q.get(name) : null; };", js)
        self.assertEqual(len(re.findall(r'\bq\.get\(', js)), 1, 'every parameter is read through arg()')
        self.assertRegex(js, r"var local = location\.protocol === 'file:' \|\|\s*/\^\(localhost\|127\\\.0\\\.0\\\.1\|\\\[::1\\\]\)\$/\.test\(location\.hostname\) \|\| /\\\.localhost\$/\.test\(location\.hostname\);")
        self.assertIn("var demo = arg('demo');", js)
        self.assertIn("var shot = demo ? arg('state') : null;", js)
        # The hook the local harness films through exists only when held.
        self.assertEqual(js.count('window.theDoor'), 1)
        hook = js.index('window.theDoor')
        self.assertGreater(hook, js.index('function hold()'))
        self.assertIn('if (held) { hold(); return; }', js)

    def test_it_says_only_the_words_agreed(self):
        self.assertEqual(set(self.page.words), SEEN)
        title = re.search(r'<title>([^<]*)</title>', text(PAGE)).group(1)
        self.assertEqual(title, 'CoLabRoom')
        labels = {a['aria-label'] for _, a in self.page.tags if a.get('aria-label')}
        self.assertEqual(labels, {'Show password', 'Get CoLabRoom'})
        spoken = {s.replace("\\'", "'") for s in strings(self.script)
                  if re.search(r'[A-Za-z’]{3,} [A-Za-z]', s) and s != 'use strict' and not s.lstrip().startswith(('uniform', 'float', 'vec', 'for(', 'if(', '#', 'gl_', 'void', 'const', 'precision', 'attribute', 'varying', 'return', '}'))
                  and not re.search(r'[;{}=]', s) and 'the door: level' not in s and 'could not be drawn' not in s}
        self.assertEqual(spoken, SAID)
        for banned in ('beta', 'Beta', 'BETA', 'coming soon', 'launch'):
            for path in (PAGE,):
                self.assertNotIn(banned, text(path))

    def test_it_is_a_real_form_that_a_keyboard_and_a_reader_can_use(self):
        tags = self.page.tags
        form = [a for t, a in tags if t == 'form']
        self.assertEqual(len(form), 1)
        self.assertIn(('label', {'for': 'pw'}), [(t, a) for t, a in tags if t == 'label'])
        submit = [a for t, a in tags if t == 'button' and a.get('type') == 'submit']
        self.assertEqual(len(submit), 1)
        live = [a for t, a in tags if a.get('aria-live') == 'polite' and a.get('role') == 'status']
        self.assertEqual(sorted(a['id'] for a in live), ['aside', 'said'])
        self.assertEqual([a.get('lang') for t, a in tags if t == 'html'], ['en'])
        self.assertEqual(len([1 for t, _ in tags if t == 'h1']), 1)
        self.assertEqual(len([1 for t, _ in tags if t == 'main']), 1)
        css = text(STYLE)
        for rule in ('.pill:focus-visible', '.see:focus-visible', '.field:focus-within',
                     'prefers-reduced-motion: reduce', 'forced-colors: active'):
            self.assertIn(rule, css)
        # One thing only gives up its outline: the line that focus is moved
        # to so it is read out, which nobody tabs to.
        self.assertEqual(css.count('outline: none'), 1)
        self.assertRegex(css, r'\.line \{[^}]*outline: none')
        # Tap targets: the pill 56px, the eye 48px, the field 60px.
        self.assertIn('min-height: 3.5rem', css)
        self.assertRegex(css, r'\.see \{[^}]*width: 3rem; height: 3rem')
        self.assertRegex(css, r'\.field input \{[^}]*height: 3\.75rem')

    def test_it_never_holds_the_page_still_under_the_hand(self):
        js = self.script
        self.assertNotIn('preventDefault()', re.sub(
            r"(form\.addEventListener\('submit'.*?e\.preventDefault\(\);|go\.addEventListener\('click'.*?e\.preventDefault\(\);|if \(stale\(\)\) e\.preventDefault\(\);|webglcontextlost', function \(e\) \{\s*e\.preventDefault\(\);)",
            '', js, flags=re.S))
        hands = re.findall(r"window\.addEventListener\('((?:pointer|touch)\w+)', ", js)
        self.assertEqual(sorted(hands), ['pointercancel', 'pointerdown', 'pointermove', 'pointerup',
                                         'touchcancel', 'touchend', 'touchmove', 'touchstart'])
        self.assertEqual(len(re.findall(r', o\);', js)), 8, 'every one of them passive')
        self.assertIn('var o = { passive: true };', js)
        css = text(STYLE)
        self.assertNotIn('touch-action', css)
        self.assertNotIn('user-scalable', text(PAGE))
        self.assertNotIn('maximum-scale', text(PAGE))
        self.assertNotIn('autoplay', text(PAGE))
        self.assertNotRegex(js, r'AudioContext|new Audio|\.play\(\)')

    def test_the_still_room_is_there_and_small(self):
        for still in STILLS:
            with self.subTest(still=still.name):
                self.assertTrue(still.is_file())
                data = still.read_bytes()
                self.assertEqual((data[:4], data[8:12]), (b'RIFF', b'WEBP'))
                self.assertLess(len(data), 90_000)
        self.assertLess(len(text(SCRIPT)), 80_000)


if __name__ == '__main__':
    unittest.main()
