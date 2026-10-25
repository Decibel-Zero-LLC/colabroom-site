#!/usr/bin/env python3
"""Serve this checkout on loopback without caching local preview responses."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PreviewHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        # A saved edit can keep its timestamp (and size). Always send the current
        # bytes, even when a browser presents validators from an older preview.
        for name in ('If-Modified-Since', 'If-None-Match'):
            if name in self.headers:
                del self.headers[name]
        return super().send_head()

    def end_headers(self):
        # This also covers HEAD, redirects, directory listings and errors.
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


def create_server(port=8780, directory=ROOT):
    """The CLI always serves ROOT; an explicit directory supports isolated tests."""
    handler = partial(PreviewHandler, directory=str(Path(directory).resolve()))
    return ThreadingHTTPServer(('127.0.0.1', port), handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8780,
                        help='local port (default: 8780)')
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('--port must be between 0 and 65535')
    try:
        server = create_server(args.port)
    except OSError as error:
        parser.error(str(error))
    with server:
        print('Previewing %s at http://127.0.0.1:%d/ (no-store)' %
              (ROOT, server.server_port), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
