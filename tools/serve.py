#!/usr/bin/env python3
"""Serve the game on the local network.

python3 -m http.server is almost enough, but it gets two things wrong that
matter here: it serves .webmanifest as application/octet-stream, which stops
Chrome treating the app as installable, and it allows normal browser caching,
which makes edits appear not to take effect. Both are fixed below.
"""
import argparse
import http.server
import os
import socket
import socketserver

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.webmanifest': 'application/manifest+json',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
    }

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # The service worker keeps its own cache deliberately; browser caching
        # on top of it only hides changes while testing.
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Service-Worker-Allowed', '/')
        super().end_headers()

    def log_message(self, fmt, *args):
        print('  %s' % (fmt % args))


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('192.168.1.1', 1))   # no packets sent; just picks the route
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8000)
    args = ap.parse_args()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('0.0.0.0', args.port), Handler) as httpd:
        httpd.daemon_threads = True
        print('serving %s' % ROOT)
        print('  on this machine : http://localhost:%d' % args.port)
        print('  on the network  : http://%s:%d' % (lan_ip(), args.port))
        httpd.serve_forever()
