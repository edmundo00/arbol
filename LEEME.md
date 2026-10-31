# Árbol: visor de árboles GEDCOM

Programa para buscar y ver un árbol genealógico en formato GEDCOM, en el ordenador o en el móvil.
**Vale para cualquier persona y cualquier GEDCOM**: no lleva nada fijo de este proyecto.

- Dirección: **https://edmundo00.github.io/arbol/** (código público en `edmundo00/arbol`; no lleva datos de nadie).
- **Los datos no salen del aparato.** El GEDCOM y las fotos se leen en el navegador, desde el disco del ordenador o del
  móvil. No se sube nada a ningún sitio.
- Fase actual: **1, solo lectura**. El programa no cambia ningún archivo.

## Cómo se usa

### En el ordenador (Chrome o Edge)

1. Abre la dirección y pulsa **Elegir archivo GEDCOM…**. Elige tu `.ged` (por ejemplo,
   `D:\Dropbox\Genealogia_2\01_arboles\edmundo_actualizado\edmundo.ged`).
2. Para ver fotos y transcripciones: en una ficha, pestaña **Documentos**, pulsa un botón de fotos y luego **Elegir carpeta…**.
   Elige la carpeta donde están las fotos (por ejemplo, `D:\Dropbox`).
   - El programa encuentra las fotos dentro de esa carpeta aunque el GEDCOM las cite con otra ruta delante (otra letra de disco, otro ordenador, otra persona).
   - Las transcripciones se buscan junto a cada foto (mismo nombre, `.md` o `.txt`). También se buscan en cualquier carpeta llamada «…transcripciones» que repita las carpetas de las fotos.
3. Las veces siguientes se abre sola. Como mucho, el navegador pregunta una vez si das permiso para leer el archivo y la carpeta.

Siempre lee el archivo del disco, así que ves la última versión.

### En el móvil (o en Firefox y Safari)

1. Copia el `.ged` al teléfono (desde Dropbox, por correo, por cable…).
2. Abre la dirección y pulsa **Elegir archivo GEDCOM…**.
3. El navegador guarda una copia y la vuelve a abrir sola. Arriba pone la fecha de la copia.
   Cuando cambies el árbol en el ordenador, vuelve a copiar el archivo al móvil y ábrelo otra vez desde **⚙ → Abrir otro GEDCOM**.

En el móvil se ven el árbol, las fichas y las fuentes, pero no las fotos (no están en el teléfono).

### Personas de referencia

En la ficha de cualquier persona, la **estrella** la marca como persona de referencia.
- Sale como botón en la barra de arriba (con su inicial) y en el filtro «Línea».
- Sus antepasados llevan su número de Ahnentafel (por ejemplo, **E 12**).
- Si no se marca a nadie, se usa la primera persona del archivo.

Cada aparato y cada archivo guardan su propia lista.

## Qué hace

- **Buscar** por cualquier trozo de nombre o apellido, en cualquier orden.
  - No importan las tildes ni las grafías parecidas: b/v/w, y/i/ll, h muda, ce/ci/z/s, ge/gi/j/x y letras dobles.
  - Variantes de apellidos en `variantes.json` (Houwelingen / Abelinguen / Bezlinge…); se pueden añadir más.
  - Filtros por lugar, años y línea.
- **Vista de familia**: la persona con sus cónyuges e hijos, sus padres y sus hermanos. Con un clic se pone en el centro a cualquiera de ellos.
- **Dos modos, Familia y Árbol**, con los botones **👪 Familia** y **🌳 Árbol** de arriba de cada persona. El programa recuerda el modo:
  si estás en Árbol y pulsas a alguien, el árbol se centra en esa persona; para ver su ficha, pulsas **Familia**.
  - **Gráfico**: la persona y 5 generaciones de antepasados (la flecha ▸ indica que hay más hacia atrás).
  - **Antepasados**: todos, por generaciones, con su número (2 padre, 3 madre, 4 abuelo paterno…). **Ir al n.º** marca la fila de ese antepasado.
  - **Descendientes**: hijos, nietos… en un esquema que se abre y se cierra.
- **Ficha de cada persona**:
  - hechos ordenados por fecha, notas y el registro GEDCOM tal cual;
  - **documentos** con lo que prueba cada uno (grado A/B/C), sus fotos y la transcripción al lado.

## Pruebas (en este ordenador)

```
python -I 11_aplicacion/servidor_local.py
```

- Abrir **http://localhost:8765/Genealogia_2/11_aplicacion/pruebas.html**. Son 32 pruebas, entre ellas:
  - el GEDCOM leído y vuelto a escribir sale **idéntico byte a byte**;
  - el buscador;
  - el Ahnentafel;
  - fotos y transcripciones encontradas con otras rutas delante.
- El servidor solo atiende a este ordenador y solo a las carpetas `Genealogia` y `Genealogia_2`.
  En la pantalla de inicio, en `localhost`, aparece **Usar el servidor local** para probar sin elegir archivos.

## Publicar un cambio

Esta carpeta es el repositorio de GitHub. Se publica con:

```
python -I 11_aplicacion/publicar.py "qué cambia"
```

Pone un número de versión nuevo a todos los archivos (así los navegadores no se quedan con la versión vieja), guarda el cambio y lo sube.
GitHub tarda uno o dos minutos en publicarlo. Si aun así se ve la versión vieja, Ctrl+F5 en el ordenador.

## Cómo está hecha

| Archivo | Qué hace |
|---|---|
| `index.html`, `app.css` | La página y su aspecto (móvil primero; modo oscuro automático) |
| `js/gedcom.js` | Lee y escribe el GEDCOM sin perder un byte: UTF-16 decodificado a mano, registros guardados con su texto original |
| `js/modelo.js` | Personas, familias, fechas en español, personas de referencia, Ahnentafel |
| `js/buscar.js` | Clave fonética y búsqueda con variantes |
| `js/almacen.js` | Abrir el GEDCOM y la carpeta de fotos; búsqueda de fotos y transcripciones dentro de la carpeta |
| `js/vistas.js`, `js/app.js` | Pantallas y navegación |
| `js/md.js` | Muestra las transcripciones y fichas (.md) |
| `variantes.json` | Grupos de apellidos que se buscan juntos |
| `servidor_local.py`, `pruebas.html`, `js/pruebas.js` | Pruebas |

Sin compilación ni dependencias: son archivos estáticos que se publican tal cual.

## Fases

| Fase | Estado |
|---|---|
| 0. Abrir el GEDCOM | Hecha |
| 1. Buscador y vista de familia, solo lectura, con documentos | Hecha y probada con el servidor local; falta la prueba del usuario en su ordenador y en su móvil |
| 2. Edición (apellidos españoles, asistente de fechas, copias, historial, candado). En el ordenador guardará en el mismo archivo | Pendiente |
| 3. Árboles en pantalla | Hecho lo básico (gráfico de 5 generaciones, lista de antepasados, descendientes). Pendiente: abanico y reloj de arena (Topola) |
| 4. PDF y SVG para imprenta (abanicos A0, mural) | Pendiente |
