# Aplicación del árbol

Página web propia que lee el GEDCOM de trabajo directamente de tu Dropbox
(`/Genealogia_2/01_arboles/edmundo_actualizado/edmundo.ged`). Funciona en el móvil y en los dos ordenadores.
No hay servidor: los datos van de Dropbox a tu navegador y a ningún otro sitio.

**Fase actual: 1 (buscar y ver, solo lectura).** Esta versión no escribe nada en Dropbox.

## Qué hace

- **Buscar** por cualquier trozo de nombre o apellido, en cualquier orden. No importan las tildes ni las grafías
  parecidas (b/v/w, y/i/ll, h muda, ce/ci/z/s, ge/gi/j/x, letras dobles). Las variantes conocidas de apellidos
  (Houwelingen / Abelinguen / Bezlinge…) están en `variantes.json`: se pueden añadir más.
- **Filtros**: lugar, años (desde / hasta) y línea (antepasados de Edmundo o de Diana).
- **Vista de familia**: la persona con sus cónyuges e hijos, sus padres y sus hermanos. Un clic en cualquiera la pone en el centro.
  Las etiquetas **E 12** / **D 5** son el número de antepasado (Ahnentafel) de Edmundo o de Diana.
- **Por persona**: datos ordenados por fecha, notas, el registro GEDCOM tal cual y **documentos** con lo que prueba cada uno
  (grado A/B/C), sus fotos (se piden a Dropbox solo al pulsar) y la transcripción de cada imagen al lado.
- Guarda una copia del GEDCOM en el aparato y solo lo vuelve a bajar si ha cambiado en Dropbox. Sin conexión, abre la última copia.

## Paso 1. Crear la «app» de Dropbox (una sola vez, 5 minutos)

Lo haces tú, con tu cuenta. Yo nunca meto contraseñas.

1. Entra en **https://www.dropbox.com/developers/apps** y pulsa **Create app**.
2. Elige:
   - **Scoped access**;
   - **Full Dropbox** (hace falta para leer `/Genealogia` y `/Genealogia_2`);
   - un nombre cualquiera que no exista ya, por ejemplo `arbol-fraga-edmundo`.
3. Pestaña **Permissions**: marca `files.metadata.read`, `files.content.read` y `files.content.write`
   (la escritura se usará en la fase 2), y pulsa **Submit** abajo.
4. Pestaña **Settings**, apartado **OAuth 2**:
   - **Redirect URIs**: añade estas dos direcciones, una a una, con el botón **Add**:
     - `http://localhost:8765/Genealogia_2/11_aplicacion/` (para probar en este ordenador);
     - la de la página publicada (paso 2), por ejemplo `https://TU-USUARIO.github.io/arbol/`.
   - **Allow public clients (Implicit Grant & PKCE)**: déjalo en **Allow**.
5. Copia el **App key** (no el «App secret», que no se usa ni se debe copiar en ningún sitio).
6. La app se queda en estado «Development». Para ti solo es suficiente.

## Paso 2. Publicar la página (GitHub Pages, gratis)

La página se guarda en GitHub Pages. El código es visible, pero no lleva ningún dato tuyo ni ninguna clave.
*(Los pasos concretos se añaden aquí cuando decidamos la cuenta.)*

## Paso 3. Abrirla en cada aparato

1. Abre la dirección de la página en el navegador del móvil o del ordenador.
2. Pega el **App key** y pulsa **Conectar con Dropbox**. Dropbox te pide permiso: acepta.
3. Listo. En ese aparato ya no te lo vuelve a pedir. En el móvil puedes «Añadir a pantalla de inicio».

Truco para el móvil: en vez de teclear el App key, ábrete la dirección `https://…/arbol/?appkey=TU_APP_KEY` una vez
(por ejemplo, enviándotela por WhatsApp a ti mismo). Se guarda en el aparato y desaparece de la dirección.

## Probar en este ordenador sin publicar nada

```
python -I 11_aplicacion/servidor_local.py
```

y abrir **http://localhost:8765/**. Con el botón **Usar los archivos de este ordenador** lee los archivos del disco,
sin pasar por Dropbox. Solo atiende a este ordenador y solo a las carpetas `Genealogia` y `Genealogia_2`.

Las pruebas (ida y vuelta del GEDCOM byte a byte, buscador, Ahnentafel) están en
**http://localhost:8765/Genealogia_2/11_aplicacion/pruebas.html**.

## Cómo está hecha

| Archivo | Qué hace |
|---|---|
| `index.html`, `app.css` | La página y su aspecto (móvil primero; modo oscuro automático) |
| `js/gedcom.js` | Lee y escribe el GEDCOM sin perder un byte: UTF-16 decodificado a mano, registros guardados con su texto original |
| `js/modelo.js` | Personas, familias, fechas en español, números de Ahnentafel |
| `js/buscar.js` | Clave fonética y búsqueda con variantes |
| `js/almacen.js` | Dropbox (OAuth con PKCE, sin secreto) y el servidor local; copia del GEDCOM en el aparato |
| `js/vistas.js`, `js/app.js` | Pantallas y navegación |
| `js/md.js` | Muestra las transcripciones y fichas (.md) |
| `variantes.json` | Grupos de apellidos que se buscan juntos |
| `servidor_local.py` | Servidor de pruebas en este ordenador |
| `pruebas.html`, `js/pruebas.js` | Pruebas automáticas |

Sin compilación ni dependencias: son archivos estáticos que se publican tal cual.

## Fases

| Fase | Estado |
|---|---|
| 0. Conexión con Dropbox y lectura del GEDCOM | Hecha, falta que crees la app de Dropbox y elegir dónde publicar |
| 1. Buscador y vista de familia, solo lectura, con documentos | Hecha y probada en este ordenador con los archivos locales; falta tu prueba con Dropbox y en el móvil |
| 2. Edición (apellidos españoles, asistente de fechas, copias, historial, candado, control de versión de Dropbox) | Pendiente |
| 3. Árboles en pantalla (Topola) | Pendiente |
| 4. PDF y SVG para imprenta (abanicos A0, mural) | Pendiente |
