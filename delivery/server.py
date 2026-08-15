#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import urllib.parse
import time
import threading

PORT = 8085
DB_FILE = os.path.join(os.path.dirname(__file__), 'orders.json')

# Global database and SSE subscribers lists
orders = {}
subscribers = []  # List of dicts: {'type': 'single'/'all', 'order_id': str/None, 'handler': handler}

# Pre-seed demo orders if the database file doesn't exist
if os.path.exists(DB_FILE):
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            orders = json.load(f)
    except Exception as e:
        print("Error loading orders.json:", e)

if not orders:
    orders = {
        "ord_demo": {
            "id": "ord_demo",
            "cliente_nombre": "Cliente de Prueba",
            "telefono": "04125551234",
            "ubicacion": "Barrio Las Mercedes - Portón negro frente al parque",
            "metodo_pago": "💵 Efectivo",
            "total_usd": 40.0,
            "total_bs": 1800.0,
            "items": [
                {"name": "Carpaccio De Lomito", "price": "$18", "qty": 1},
                {"name": "Lasaña De La Abuela", "price": "$22", "qty": 1}
            ],
            "estado": "recibido",
            "creado_el": "2026-08-14T00:00:00.000Z"
        }
    }
    try:
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(orders, f, ensure_ascii=False, indent=4)
    except Exception as e:
        pass

def save_orders():
    try:
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(orders, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print("Error saving orders.json:", e)

# Broadcast changes to SSE subscribers
def notify_subscribers(order_id=None):
    dead_subscribers = []
    
    # Copy subscribers to avoid concurrency issues during iteration
    current_subs = list(subscribers)
    
    for sub in current_subs:
        try:
            if sub['type'] == 'single' and sub['order_id'] == order_id:
                order_data = orders.get(order_id)
                if order_data:
                    data_str = f"data: {json.dumps(order_data)}\n\n"
                    sub['handler'].wfile.write(data_str.encode('utf-8'))
                    sub['handler'].wfile.flush()
            elif sub['type'] == 'all':
                active_orders = [o for o in orders.values() if o.get('estado') != 'entregado']
                data_str = f"data: {json.dumps(active_orders)}\n\n"
                sub['handler'].wfile.write(data_str.encode('utf-8'))
                sub['handler'].wfile.flush()
        except Exception as e:
            dead_subscribers.append(sub)

    # Remove disconnected subscribers
    for dead in dead_subscribers:
        if dead in subscribers:
            subscribers.remove(dead)

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

class LiveTrackingHandler(http.server.SimpleHTTPRequestHandler):
    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        url_parsed = urllib.parse.urlparse(self.path)
        path = url_parsed.path
        query = urllib.parse.parse_qs(url_parsed.query)

        # ── API ENDPOINTS ──

        # SSE stream for a specific order tracking
        if path == '/api/stream':
            order_id = query.get('id', [None])[0]
            if not order_id:
                self.send_response(400)
                self.end_headers()
                return

            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_cors_headers()
            self.end_headers()

            # Register SSE client
            sub = {'type': 'single', 'order_id': order_id, 'handler': self}
            subscribers.append(sub)

            # Send initial state
            order_data = orders.get(order_id)
            if order_data:
                initial_msg = f"data: {json.dumps(order_data)}\n\n"
                self.wfile.write(initial_msg.encode('utf-8'))
                self.wfile.flush()

            # Keep connection open (block thread)
            while True:
                time.sleep(1)
                if sub not in subscribers:
                    break
            return

        # SSE stream for all active orders (Kitchen Dashboard)
        elif path == '/api/stream-all':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_cors_headers()
            self.end_headers()

            sub = {'type': 'all', 'order_id': None, 'handler': self}
            subscribers.append(sub)

            # Send initial list
            active_orders = [o for o in orders.values() if o.get('estado') != 'entregado']
            initial_msg = f"data: {json.dumps(active_orders)}\n\n"
            self.wfile.write(initial_msg.encode('utf-8'))
            self.wfile.flush()

            while True:
                time.sleep(1)
                if sub not in subscribers:
                    break
            return

        # Get list of active orders
        elif path == '/api/orders':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            active_list = [o for o in orders.values() if o.get('estado') != 'entregado']
            self.wfile.write(json.dumps(active_list).encode('utf-8'))
            return

        # Get specific order details
        elif path.startswith('/api/orders/'):
            order_id = path.split('/')[-1]
            order_data = orders.get(order_id)
            if order_data:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(order_data).encode('utf-8'))
            else:
                self.send_response(404)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Not found'}).encode('utf-8'))
            return

        # ── SERVE STATIC FILES ──
        else:
            # Map request path to local folder structure
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            # Strip '/delivery' prefix if present to match request routing
            rel_path = path.replace('/delivery', '')
            if rel_path.startswith('/'):
                rel_path = rel_path[1:]
            if not rel_path or rel_path == '':
                rel_path = 'delivery/index.html'
            elif not rel_path.startswith('delivery/'):
                rel_path = 'delivery/' + rel_path

            file_path = os.path.join(base_dir, rel_path)
            # Fallback for main parent assets (like img/ logo, etc.)
            if not os.path.exists(file_path):
                # Check directly in parent dir (e.g. img/logo.webp)
                rel_parent = path.replace('/delivery', '')
                if rel_parent.startswith('/'):
                    rel_parent = rel_parent[1:]
                file_path = os.path.join(base_dir, rel_parent)

            if os.path.exists(file_path) and os.path.isfile(file_path):
                self.send_response(200)
                # Content type detection
                if file_path.endswith('.html'):
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                elif file_path.endswith('.css'):
                    self.send_header('Content-Type', 'text/css')
                elif file_path.endswith('.js'):
                    self.send_header('Content-Type', 'application/javascript')
                elif file_path.endswith('.webp'):
                    self.send_header('Content-Type', 'image/webp')
                elif file_path.endswith('.svg'):
                    self.send_header('Content-Type', 'image/svg+xml')
                self.send_cors_headers()
                self.end_headers()
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"File not found")

    def do_POST(self):
        url_parsed = urllib.parse.urlparse(self.path)
        path = url_parsed.path

        if path == '/api/orders':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            order_data = json.loads(post_data.decode('utf-8'))

            order_id = order_data.get('id')
            orders[order_id] = order_data
            save_orders()

            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps(order_data).encode('utf-8'))

            # Trigger SSE updates
            notify_subscribers(order_id)
            return
        else:
            self.send_response(404)
            self.end_headers()

    def do_PUT(self):
        url_parsed = urllib.parse.urlparse(self.path)
        path = url_parsed.path

        if path.startswith('/api/orders/') and path.endswith('/status'):
            order_id = path.split('/')[-2]
            content_length = int(self.headers['Content-Length'])
            put_data = self.rfile.read(content_length)
            status_data = json.loads(put_data.decode('utf-8'))
            nuevo_estado = status_data.get('estado')

            if order_id in orders:
                orders[order_id]['estado'] = nuevo_estado
                save_orders()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(orders[order_id]).encode('utf-8'))

                # Broadcast updates to the client tracking view and kitchen admin
                notify_subscribers(order_id)
                return
            else:
                self.send_response(404)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Not found'}).encode('utf-8'))
                return
        else:
            self.send_response(404)
            self.end_headers()

def run(server_class=ThreadingHTTPServer, handler_class=LiveTrackingHandler):
    server_address = ('', PORT)
    httpd = server_class(server_address, handler_class)
    print(f"Real-Time Delivery Server running on http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()

if __name__ == '__main__':
    run()
