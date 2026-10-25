"""Local HTTP checks for preview caching; no external network or site writes."""
from http.client import HTTPConnection
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock

from preview import ROOT, PreviewHandler, create_server


class PreviewTest(unittest.TestCase):
    def setUp(self):
        quiet = mock.patch.object(PreviewHandler, 'log_message')
        quiet.start()
        self.addCleanup(quiet.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        (self.directory / 'index.html').write_bytes(b'<p>old</p>')
        (self.directory / 'styles.css').write_bytes(b'body{color:red}')
        (self.directory / 'nested').mkdir()
        (self.directory / 'nested' / 'page.html').write_bytes(b'nested page')
        self.server = create_server(port=0, directory=self.directory)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server, self.server, self.thread)

    @staticmethod
    def stop_server(server, thread):
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)

    def request(self, path, method='GET', headers=None, server=None):
        target = server or self.server
        connection = HTTPConnection('127.0.0.1', target.server_port, timeout=2)
        try:
            connection.request(method, path, headers=headers or {})
            response = connection.getresponse()
            return response.status, {name.lower(): value for name, value in response.getheaders()}, response.read()
        finally:
            connection.close()

    def assert_no_store(self, headers):
        self.assertEqual(headers['cache-control'], 'no-store, max-age=0')
        self.assertEqual(headers['pragma'], 'no-cache')
        self.assertEqual(headers['expires'], '0')

    def test_get_and_head_preserve_mime_length_and_disable_caching(self):
        for path, mime, content in (
                ('/', 'text/html', b'<p>old</p>'),
                ('/styles.css?v=preview', 'text/css', b'body{color:red}')):
            for method in ('GET', 'HEAD'):
                with self.subTest(path=path, method=method):
                    status, headers, body = self.request(path, method)
                    self.assertEqual(status, 200)
                    self.assert_no_store(headers)
                    self.assertEqual(headers['content-type'], mime)
                    self.assertEqual(int(headers['content-length']), len(content))
                    self.assertEqual(body, content if method == 'GET' else b'')

    def test_same_url_same_timestamp_edits_ignore_conditional_headers(self):
        for filename, changed in (('index.html', b'<p>new</p>'),
                                  ('styles.css', b'body{color:tan}')):
            with self.subTest(filename=filename):
                path = self.directory / filename
                original_stat = path.stat()
                status, original_headers, _ = self.request('/' + filename)
                self.assertEqual(status, 200)
                self.assertEqual(path.stat().st_size, len(changed))
                path.write_bytes(changed)
                os.utime(path, ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns))
                self.assertEqual(path.stat().st_mtime_ns, original_stat.st_mtime_ns)
                validators = (
                    {'If-Modified-Since': original_headers['last-modified']},
                    {'If-None-Match': '*'},
                    {'If-Modified-Since': 'Fri, 01 Jan 2100 00:00:00 GMT',
                     'If-None-Match': '"old-preview"'},
                )
                for headers in validators:
                    for method in ('GET', 'HEAD'):
                        with self.subTest(headers=headers, method=method):
                            status, result_headers, body = self.request(
                                '/' + filename, method=method, headers=headers)
                            self.assertEqual(status, 200)
                            self.assert_no_store(result_headers)
                            self.assertEqual(body, changed if method == 'GET' else b'')
                            self.assertEqual(int(result_headers['content-length']), len(changed))

    def test_errors_and_redirects_are_not_cached(self):
        for path, expected_status in (('/missing.html', 404), ('/nested', 301)):
            for method in ('GET', 'HEAD'):
                with self.subTest(path=path, method=method):
                    status, headers, body = self.request(path, method)
                    self.assertEqual(status, expected_status)
                    self.assert_no_store(headers)
                    if method == 'HEAD':
                        self.assertEqual(body, b'')
        status, headers, _ = self.request('/index.html', method='POST')
        self.assertEqual(status, 501)
        self.assert_no_store(headers)

    def test_nested_paths_and_query_strings_keep_normal_file_serving(self):
        status, headers, body = self.request('/nested/page.html?view=current')
        self.assertEqual(status, 200)
        self.assertEqual(headers['content-type'], 'text/html')
        self.assertEqual(body, b'nested page')
        self.assert_no_store(headers)

    def test_server_binds_only_loopback(self):
        self.assertEqual(self.server.server_address[0], '127.0.0.1')

    def test_default_root_is_the_checkout_even_from_another_working_directory(self):
        previous = Path.cwd()
        try:
            os.chdir(self.directory)
            server = create_server(port=0)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.addCleanup(self.stop_server, server, thread)
            status, headers, body = self.request('/tools/preview.py', server=server)
            self.assertEqual(status, 200)
            self.assertEqual(body, (ROOT / 'tools' / 'preview.py').read_bytes())
            self.assert_no_store(headers)
        finally:
            os.chdir(previous)


if __name__ == '__main__':
    unittest.main()
