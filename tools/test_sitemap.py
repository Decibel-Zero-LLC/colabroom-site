"""sitemap.xml tells the truth about every page it lists.

Run from the repository root:
    python3 -m unittest discover -s tools -p "test_*.py"

The rule is the one written at the top of sitemap.xml: a page's lastmod is
the day the last commit that changed that page's own words landed, as git
log prints it. A change to the shared header, Explore menu or footer does
not move it. "The page's own words" is the visible text of the page with
the header, nav, footer, skip link, scripts and styles left out: on today's
pages that is the text inside <main>, and the same definition still works
for older versions written before every page had a <main>.

The date check needs the full git history. Outside a git checkout, or in a
shallow clone, it skips and says why; the other checks always run.
"""
import shutil
import subprocess
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://colabroom.com/'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
CHROME_TAGS = {'header', 'nav', 'footer', 'script', 'style', 'noscript', 'template', 'svg'}
CHROME_CLASSES = {'skip-content', 'back', 'atmosphere-controls'}
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
        'param', 'source', 'track', 'wbr'}


class Words(HTMLParser):
    """The page's own visible words, header, nav and footer left out."""

    def __init__(self, markup):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.parts = []
        self.in_body = False
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        if tag == 'body':
            self.in_body = True
            return
        if tag in VOID:
            return
        classes = set((dict(attrs).get('class') or '').split())
        self.stack.append((tag, tag in CHROME_TAGS or bool(classes & CHROME_CLASSES)))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag == 'body':
            self.in_body = False
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        if self.in_body and not any(skip for _, skip in self.stack):
            self.parts.append(data)

    def text(self):
        return ' '.join(' '.join(self.parts).split())


class Head(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.canonical = []
        self.robots = []
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical.append(attrs.get('href'))
        if tag == 'meta' and (attrs.get('name') or '').lower() == 'robots':
            self.robots.append((attrs.get('content') or '').lower())


def words(markup):
    return Words(markup).text()


def entries():
    tree = ET.parse(ROOT / 'sitemap.xml')
    found = []
    for url in tree.getroot().findall('s:url', NS):
        loc = url.find('s:loc', NS).text.strip()
        lastmod = url.find('s:lastmod', NS)
        found.append((loc, lastmod.text.strip() if lastmod is not None else None))
    return found


def file_for(loc):
    path = loc[len(SITE):] if loc.startswith(SITE) else None
    if path is None:
        return None
    return ROOT / (path or 'index.html')


def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True,
                          text=True, check=False)


def last_word_change(relative):
    """(date, commit) of the newest commit that changed the page's words."""
    log = git('log', '--format=%H %cs', '--', relative).stdout.split('\n')
    for line in filter(None, log):
        commit, day = line.split(' ', 1)
        now = git('show', '%s:%s' % (commit, relative))
        before = git('show', '%s^:%s' % (commit, relative))
        if now.returncode != 0:
            continue
        if before.returncode != 0 or words(now.stdout) != words(before.stdout):
            return day, commit[:7]
    return None


def history_available():
    if shutil.which('git') is None:
        return 'git is not installed'
    if git('rev-parse', '--is-inside-work-tree').stdout.strip() != 'true':
        return 'not a git checkout'
    if git('rev-parse', '--is-shallow-repository').stdout.strip() == 'true':
        return 'a shallow clone does not have the history'
    return None


class SitemapTest(unittest.TestCase):
    def test_the_sitemap_lists_pages_once_with_a_date_each(self):
        found = entries()
        self.assertGreaterEqual(len(found), 19)
        locs = [loc for loc, _ in found]
        self.assertEqual(len(locs), len(set(locs)))
        for loc, lastmod in found:
            with self.subTest(loc=loc):
                self.assertRegex(lastmod or '', r'^\d{4}-\d{2}-\d{2}$')

    def test_every_url_is_a_file_indexable_and_its_own_canonical(self):
        for loc, _ in entries():
            with self.subTest(loc=loc):
                path = file_for(loc)
                self.assertIsNotNone(path, 'not on colabroom.com')
                self.assertTrue(path.is_file(), loc)
                head = Head(path.read_text(encoding='utf-8'))
                self.assertFalse(any('noindex' in r for r in head.robots), 'noindex in the sitemap')
                self.assertEqual(head.canonical, [loc])

    def test_people_pages_stay_out_of_the_hand_written_sitemap(self):
        for loc, _ in entries():
            self.assertNotIn('/musician/', loc)
            self.assertNotIn('/song/', loc)

    def test_the_words_ignore_the_shared_header_nav_and_footer(self):
        page = ('<body><header><nav><a href="/">Home</a></nav></header>'
                '<main><h1>Title</h1><p>Said <b>once</b>.</p><script>x</script></main>'
                '<footer>© 2026</footer></body>')
        self.assertEqual(words(page), 'Title Said once .')
        self.assertEqual(words(page.replace('Home', 'Elsewhere')), words(page))
        self.assertNotEqual(words(page.replace('once', 'twice')), words(page))

    def test_no_lastmod_is_older_than_the_last_change_to_the_words(self):
        reason = history_available()
        if reason:
            self.skipTest(reason)
        for loc, lastmod in entries():
            relative = file_for(loc).relative_to(ROOT).as_posix()
            with self.subTest(page=relative):
                change = last_word_change(relative)
                self.assertIsNotNone(change, 'no commit found for ' + relative)
                day, commit = change
                self.assertGreaterEqual(
                    lastmod, day,
                    '%s says %s, but %s changed its words on %s' % (relative, lastmod, commit, day))


if __name__ == '__main__':
    unittest.main()
