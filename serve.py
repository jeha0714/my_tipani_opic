import http.server, socketserver, functools, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4599
DIR = os.path.dirname(os.path.abspath(__file__))

Handler = http.server.SimpleHTTPRequestHandler
Handler.extensions_map['.html'] = 'text/html; charset=utf-8'
handler = functools.partial(Handler, directory=DIR)

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), handler) as httpd:
    print(f"serving {DIR} on {PORT}")
    httpd.serve_forever()
