# Servidor de pruebas para usar la aplicación en este ordenador sin Dropbox en línea.
# Sirve, solo para este ordenador (127.0.0.1) y solo para leer, las carpetas /Genealogia y /Genealogia_2
# de la carpeta de Dropbox, con las mismas rutas que tienen en Dropbox.
#   python -I 11_aplicacion/servidor_local.py      →  http://localhost:8765/
import functools, http.server, os, sys
from pathlib import Path

PUERTO = 8765
RAIZ = Path(__file__).resolve().parents[2]          # D:\Dropbox
PERMITIDAS = ('/Genealogia/', '/Genealogia_2/')
APP = '/Genealogia_2/11_aplicacion/'

class Manejador(http.server.SimpleHTTPRequestHandler):
    def permitido(self):
        ruta = self.path.split('?')[0]
        if ruta in ('/', ''):
            self.send_response(302); self.send_header('Location', APP); self.end_headers(); return False
        if not ruta.startswith(PERMITIDAS) or '..' in ruta:
            self.send_error(403, 'Fuera de las carpetas de genealogía'); return False
        return True
    def do_GET(self):
        if self.permitido(): super().do_GET()
    def do_HEAD(self):
        if self.permitido(): super().do_HEAD()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass

if __name__ == '__main__':
    os.chdir(RAIZ)
    Manejador.extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.md': 'text/plain; charset=utf-8', '.ged': 'application/octet-stream'}
    h = functools.partial(Manejador, directory=str(RAIZ))
    print(f'Árbol en http://localhost:{PUERTO}/  (Ctrl+C para parar)'); sys.stdout.flush()
    http.server.ThreadingHTTPServer(('127.0.0.1', PUERTO), h).serve_forever()
