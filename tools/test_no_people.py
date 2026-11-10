"""The whole suite still passes when nobody has a page.

Run from the repository root:
    python3 -m unittest discover -s tools -p "test_*.py"

When every listed person withdraws, the nightly build removes every
musician/*.html and writes an empty sitemap-pages.xml. A withdrawal must
never break a test, or give anyone a reason to keep a person's page. This
copies the tree (without .git) to a temporary folder, removes the people's
pages, writes the empty sitemap exactly as the builder does, and runs every
other test there. Pure file checks: no network, no generator run.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INSIDE = 'COLABROOM_NO_PEOPLE_COPY'
EMPTY_SITEMAP = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                 '</urlset>\n')


@unittest.skipIf(os.environ.get(INSIDE), 'already running inside the copy')
class NoPeopleTest(unittest.TestCase):
    def test_every_other_test_passes_with_no_peoples_pages(self):
        with tempfile.TemporaryDirectory() as scratch:
            copy = Path(scratch) / 'site'
            shutil.copytree(ROOT, copy, ignore=shutil.ignore_patterns(
                '.git', '__pycache__', 'node_modules'))
            for folder in ('musician', 'song'):
                for page in (copy / folder).glob('*.html'):
                    page.unlink()
            (copy / 'sitemap-pages.xml').write_text(EMPTY_SITEMAP, encoding='utf-8')
            self.assertEqual(list((copy / 'musician').glob('*.html')), [])

            env = dict(os.environ, **{INSIDE: '1'})
            run = subprocess.run(
                [sys.executable, '-m', 'unittest', 'discover',
                 '-s', 'tools', '-p', 'test_*.py'],
                cwd=copy, env=env, capture_output=True, text=True, timeout=600)
            self.assertEqual(run.returncode, 0, run.stderr[-4000:])
            self.assertRegex(run.stderr, r'Ran [1-9]\d* tests')


if __name__ == '__main__':
    unittest.main()
