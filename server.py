import os
import sys
import http.server
import socketserver
import gzip
import io

PORT = 8080
DIRECTORY = "/Users/apple/.gemini/antigravity/scratch/restaurant-menu"

COMPRESS_EXTENSIONS = {'.html', '.css', '.js', '.svg', '.json', '.xml', '.txt'}

class OptimizedHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        path = self.translate_path(self.path)
        
        # If it's a directory or doesn't exist, fall through to default behavior
        if os.path.isdir(path) or not os.path.exists(path):
            # For directory, translate to index.html
            if os.path.isdir(path):
                index_path = os.path.join(path, 'index.html')
                if os.path.exists(index_path):
                    path = index_path
                else:
                    super().do_GET()
                    return
            else:
                super().do_GET()
                return

        _, ext = os.path.splitext(path)
        accept_encoding = self.headers.get('Accept-Encoding', '')
        
        # Only gzip-compress text-based files
        if ext in COMPRESS_EXTENSIONS and 'gzip' in accept_encoding:
            try:
                with open(path, 'rb') as f:
                    content = f.read()
            except OSError:
                self.send_error(404, "File not found")
                return

            out = io.BytesIO()
            with gzip.GzipFile(fileobj=out, mode='w', compresslevel=6) as gz:
                gz.write(content)
            compressed = out.getvalue()

            ctype = self.guess_type(path)
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(compressed)))
            self.send_header("Vary", "Accept-Encoding")
            # Cache headers for compressible (text) files
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(compressed)
        else:
            # For static binary assets (images, fonts), add cache headers
            try:
                with open(path, 'rb') as f:
                    content = f.read()
            except OSError:
                self.send_error(404, "File not found")
                return

            ctype = self.guess_type(path)
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(content)))
            
            if ext in ('.webp', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf'):
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            elif ext in ('.css', '.js'):
                self.send_header("Cache-Control", "public, max-age=86400")
            
            self.end_headers()
            self.wfile.write(content)

if __name__ == "__main__":
    print(f"Rogasa Café — Servidor Optimizado")
    print(f"Puerto: {PORT} | Directorio: {DIRECTORY}")
    print(f"Gzip: Activado | Cache-Control: Activado")
    print(f"Accede en: http://0.0.0.0:{PORT}/")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), OptimizedHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor detenido.")
            sys.exit(0)
