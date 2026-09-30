"""Local static preview with explicit ES-module MIME types on Windows."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

SimpleHTTPRequestHandler.extensions_map.update({".mjs":"text/javascript", ".js":"text/javascript"})
print("Preview: http://127.0.0.1:8001")
ThreadingHTTPServer(("127.0.0.1",8001),SimpleHTTPRequestHandler).serve_forever()
