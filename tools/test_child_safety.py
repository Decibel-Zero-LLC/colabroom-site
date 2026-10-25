"""Check published and generated routes without querying a service."""

from html.parser import HTMLParser
from pathlib import Path
import unittest
from urllib.parse import urljoin, urlparse
import xml.etree.ElementTree as ET

import build_public_pages as pages


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://colabroom.com/"
CANONICAL = ORIGIN + "child-safety.html"


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.footers = []
        self.footer = None
        self.links = []
        self.canonical = []
        self.ids = set()
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.add(attrs["id"])
        if tag == "footer":
            self.footer = []
            self.footers.append(self.footer)
        if tag == "a" and "href" in attrs:
            self.links.append(attrs["href"])
            if self.footer is not None:
                self.footer.append(attrs["href"])
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical.append(attrs.get("href"))

    def handle_endtag(self, tag):
        if tag == "footer":
            self.footer = None


class ChildSafetyRoutesTests(unittest.TestCase):
    def test_every_existing_footer_reaches_the_page(self):
        checked = 0
        for path in ROOT.rglob("*.html"):
            document = Document(path.read_text())
            base = urljoin(ORIGIN, path.relative_to(ROOT).as_posix())
            for footer in document.footers:
                with self.subTest(page=str(path.relative_to(ROOT))):
                    targets = [urljoin(base, href) for href in footer]
                    self.assertEqual(targets.count(CANONICAL), 1)
                checked += 1
        # Guards against accidentally narrowing the search to the root pages.
        self.assertGreaterEqual(checked, 21)

    def test_future_generated_song_and_musician_pages_keep_the_link(self):
        row = {"id": "00000000-0000-4000-8000-000000000001"}
        for render in (pages.song_page, pages.musician_page):
            with self.subTest(renderer=render.__name__):
                url, markup = render(row)
                document = Document(markup)
                self.assertEqual(len(document.footers), 1)
                targets = [urljoin(url, href)
                           for href in document.footers[0]]
                self.assertEqual(targets.count(CANONICAL), 1)

    def test_contact_routes_and_official_reporting_destinations(self):
        document = Document((ROOT / "child-safety.html").read_text())
        expected = {
            "tel:+18009622873", "mailto:hotline@colabroom.com",
            "mailto:abuse@colabroom.com", "mailto:support@colabroom.com",
            "https://report.cybertip.org/",
            "https://www.missingkids.org/gethelpnow/cybertipline",
            "https://www.myflfamilies.com/services/abuse/abuse-hotline/how-report-abuse",
        }
        self.assertTrue(expected.issubset(document.links))
        self.assertEqual(document.canonical, [CANONICAL])

    def test_local_links_and_fragments_exist(self):
        document = Document((ROOT / "child-safety.html").read_text())
        for href in document.links:
            target = urlparse(urljoin(CANONICAL, href))
            if target.scheme != "https" or target.netloc != "colabroom.com":
                continue
            with self.subTest(link=href):
                path = ROOT / (target.path.lstrip("/") or "index.html")
                self.assertTrue(path.is_file())
                if target.fragment:
                    self.assertIn(target.fragment, Document(path.read_text()).ids)

    def test_sitemap_includes_the_canonical_page_once(self):
        tree = ET.parse(ROOT / "sitemap.xml")
        urls = [node.text for node in tree.findall(
            ".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        self.assertEqual(urls.count(CANONICAL), 1)


if __name__ == "__main__":
    unittest.main()
