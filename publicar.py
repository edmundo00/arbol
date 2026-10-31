# Publica la aplicación en GitHub Pages con un número de versión nuevo en todos los archivos,
# para que los navegadores (sobre todo el del móvil) no se queden con una mezcla de versiones guardadas.
#   python -I 11_aplicacion/publicar.py "qué cambia"
import re, subprocess, sys, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
v = time.strftime('%Y%m%d%H%M')

def versionar(ruta, patron, sustituto):
    t = ruta.read_text(encoding='utf-8')
    n = re.sub(patron, sustituto, t)
    if n != t: ruta.write_text(n, encoding='utf-8', newline='')

for js in (AQUI / 'js').glob('*.js'):
    versionar(js, r"""(from '\./[\w-]+\.js)(\?v=\d+)?'""", rf"\1?v={v}'")
    versionar(js, r"""fetch\('variantes\.json(\?v=\d+)?'\)""", f"fetch('variantes.json?v={v}')")
versionar(AQUI / 'index.html', r'href="app\.css(\?v=\d+)?"', f'href="app.css?v={v}"')
versionar(AQUI / 'index.html', r'src="js/app\.js(\?v=\d+)?"', f'src="js/app.js?v={v}"')

if len(sys.argv) > 1 and sys.argv[1] == '--solo-version':
    print('Versión', v); sys.exit()
mensaje = (sys.argv[1] if len(sys.argv) > 1 else 'Actualización') + '\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
git = lambda *a: subprocess.run(['git', '-C', str(AQUI), *a], check=True)
git('add', '-A')
git('commit', '-q', '-m', mensaje)
git('push', '-q')
print(f'Publicada la versión {v}. GitHub tarda uno o dos minutos en ponerla en https://edmundo00.github.io/arbol/')
