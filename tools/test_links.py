"""Every local link and asset on every page resolves to a file in this tree.

Run from the repository root:
    python3 -m unittest discover -s tools -p "test_*.py"

A local link is a relative or root-relative href/src, or an absolute one on
colabroom.com itself (canonical, og:url, og:image). `/` and any folder are
read as their index.html, and a path with no extension as GitHub Pages
serves it, with .html added. mailto:, tel: and other hosts are not checked.
A #fragment on a local link must name an id (or an anchor name) in the
target page. Pure file checks: no network, no generator run.
"""
import re
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urljoin, urlsplit

from build_public_pages import musician_page, song_page

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://colabroom.com/'
VERIFICATION = 'google9d25000efa91451c.html'
URL_ATTRS = {'href', 'src', 'poster', 'action', 'data'}
META_URLS = {'og:url', 'og:image', 'twitter:image'}


class Links(HTMLParser):
    def __init__(self, markup):
        super().__init__()
        self.urls = []
        self.ids = set()
        self.feed(markup)
        self.close()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        if tag == 'a' and attrs.get('name'):
            self.ids.add(attrs['name'])
        for name in URL_ATTRS:
            if attrs.get(name):
                self.urls.append(attrs[name].strip())
        if attrs.get('srcset'):
            self.urls += [part.strip().split()[0]
                          for part in attrs['srcset'].split(',') if part.strip()]
        if tag == 'meta' and (attrs.get('property') in META_URLS
                              or attrs.get('name') in META_URLS):
            self.urls.append((attrs.get('content') or '').strip())

    handle_startendtag = handle_starttag


def html_pages():
    return sorted(p for p in ROOT.rglob('*.html')
                  if '.git' not in p.parts and p.name != VERIFICATION)


def documents():
    for path in html_pages():
        name = path.relative_to(ROOT).as_posix()
        yield name, SITE + name, path.read_text(encoding='utf-8')
    # The generator's templates, rendered with made-up rows, as if published.
    url, markup = song_page({'id': '12345678-abcd', 'title': 'Example'})
    yield 'generated song', url, markup
    url, markup = musician_page({'id': '87654321-abcd', 'display_name': 'Example'})
    yield 'generated musician', url, markup


def local_file(url):
    """The file a same-site URL is served from, or None if it is not ours."""
    parts = urlsplit(url)
    if parts.scheme not in {'http', 'https'} or parts.netloc != 'colabroom.com':
        return None
    path = unquote(parts.path).lstrip('/')
    if path == '' or path.endswith('/'):
        path += 'index.html'
    candidate = ROOT / PurePosixPath(path)
    if not candidate.exists() and not PurePosixPath(path).suffix:
        candidate = ROOT / PurePosixPath(path + '.html')
    if candidate.is_dir():
        candidate = candidate / 'index.html'
    return candidate


_ids = {}
# Ids a page's own script adds (count.js gives every footer the flier
# choice, #flier-preference), so a link to one is not broken.
SCRIPTED = {match for script in ROOT.glob('*.js')
            for match in re.findall(r"\.id\s*=\s*'([\w-]+)'",
                                    script.read_text(encoding='utf-8'))}


def ids_of(path):
    if path not in _ids:
        _ids[path] = Links(path.read_text(encoding='utf-8')).ids | SCRIPTED
    return _ids[path]


class LinksTest(unittest.TestCase):
    def test_the_inventory_includes_root_pages_records_and_templates(self):
        names = [name for name, _, _ in documents()]
        self.assertGreaterEqual(len(names), 25)
        self.assertTrue(any(name.startswith('musician/') for name in names))

    def test_every_local_href_and_src_resolves_and_every_fragment_exists(self):
        checked = 0
        for name, base, markup in documents():
            page = Links(markup)
            for raw in page.urls:
                if re.match(r'^(mailto|tel|sms|data|javascript):', raw, re.I):
                    continue
                url = urljoin(base, raw)
                target = local_file(url)
                if target is None:
                    continue
                checked += 1
                own = urlsplit(url)._replace(fragment='').geturl() == base
                with self.subTest(page=name, link=raw):
                    # A rendered template's own address is not in the tree
                    # until the nightly job writes it; everything else must be.
                    if not (own and name.startswith('generated')):
                        self.assertTrue(target.is_file(), '%s -> %s' % (raw, target))
                    fragment = unquote(urlsplit(url).fragment)
                    if fragment:
                        known = (page.ids | SCRIPTED) if own else ids_of(target)
                        self.assertIn(fragment, known, '%s: no id "%s"' % (raw, fragment))
        self.assertGreater(checked, 500, 'the crawl was narrowed by accident')

    def test_every_sitemap_url_is_a_file(self):
        for sitemap in ('sitemap.xml', 'sitemap-pages.xml'):
            tree = ET.parse(ROOT / sitemap)
            ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
            for loc in tree.getroot().findall('s:url/s:loc', ns):
                with self.subTest(sitemap=sitemap, loc=loc.text):
                    target = local_file(loc.text.strip())
                    self.assertIsNotNone(target)
                    self.assertTrue(target.is_file(), loc.text)

    def test_the_brand_and_account_deletion_links_use_the_canonical_home(self):
        for path in html_pages():
            text = path.read_text(encoding='utf-8')
            with self.subTest(page=path.relative_to(ROOT).as_posix()):
                self.assertNotRegex(text, r'href="/?index\.html')


if __name__ == '__main__':
    unittest.main()
