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
   Elige la carpeta donde están las fotos: toda la de Dropbox (`D:\Dropbox`) o, mejor, **varias** por separado con **Añadir otra carpeta…**
   (por ejemplo `Genealogia`, con las fotos originales, y `Genealogia_2`, con las transcripciones y las descargas).
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
- **Dos modos, Familia y Árbol**, con los dos botones de la barra de arriba (en el móvil, solo los iconos). El programa recuerda el modo:
  si estás en Árbol y pulsas a alguien, el árbol se centra en esa persona; para ver su ficha, pulsas **Familia**.
  - **Gráfico**: la persona y 5 generaciones de antepasados (la flecha ▸ indica que hay más hacia atrás).
  - **Antepasados**: todos, por generaciones, con su número (2 padre, 3 madre, 4 abuelo paterno…). **Ir al n.º** marca la fila de ese antepasado.
  - **Descendientes**: hijos, nietos… en un esquema que se abre y se cierra.
- **Imprimir / PDF** (botón en el modo Árbol):
  - **Abanico** (semicírculo, como el cartel de Corrubedo) o **cuadro de ascendientes**, de 3 a 10 generaciones;
  - papel A4, A3, A2, A1 o A0, con o sin lugares y con el título que se quiera;
  - **Guardar como PDF / Imprimir** usa el «Guardar como PDF» del navegador: es vectorial, con el tamaño de papel elegido. Hay que dejar los márgenes en «Ninguno» y la escala al 100 %;
  - **Descargar SVG** da el dibujo para la imprenta, que lo amplía sin perder calidad;
  - si el cuadro va a salir con letra diminuta (muchas generaciones en papel pequeño), lo avisa.
  - **Mural (mariposa)**, para carteles grandes (A0 o a medida, por ejemplo 1350 × 1034 mm):
    - en el centro, una pareja con sus hijos (o una persona); los antepasados de él a la izquierda y los de ella a la derecha;
    - cada rama ocupa solo el sitio de los antepasados conocidos, cada persona va a media altura entre sus padres
      y las columnas se meten unas encima de otras cuando no chocan;
    - los padres sin antepasados conocidos van uno al lado del otro en el mismo renglón («Juan ⚭ María»);
    - el detalle se elige solo: 3 renglones (✻ ⚭ ✝ con fecha y lugar), 2 o 1, empezando por fuera y solo donde hace crecer la letra hasta la **letra mínima**;
    - **rótulo** debajo del nombre: el título u oficio del GEDCOM (`TITL`, `OCCU`) o el que se escriba en la ficha de la persona («Rótulo en murales», se guarda en el navegador);
    - **lugares cortos**: se quita lo que va entre paréntesis y tras la primera coma, o se usa la tabla «lugar largo = corto»;
    - título, firma y leyenda de símbolos. Pendiente: fondo (mapa), escudos y ramas que siguen en los huecos.
- **Ficha de cada persona**:
  - hechos ordenados por fecha, notas y el registro GEDCOM tal cual;
  - **documentos** con lo que prueba cada uno (grado A/B/C), sus fotos y la transcripción al lado.

## Editar (fase 2, en el ordenador con Chrome o Edge)

1. Abre el GEDCOM como siempre y pulsa **✎ Editar** en la barra.
2. Elige la **carpeta donde está el archivo** (por ejemplo `D:\Dropbox\Genealogia_2\01_arboles\edmundo_actualizado`) y da permiso de escritura.
3. En la vista de **Familia** aparecen los botones:
   - **✎ Editar sus datos**: nombre, apellidos, sexo, nacimiento y defunción;
   - **+ Añadir padre / + Añadir madre** (si no los tiene);
   - **+ Añadir hijo** (en cada pareja; o sin cónyuge);
   - **+ Añadir cónyuge** (con fecha y lugar de boda).
4. En cada «Añadir» se puede crear una **persona nueva** o **elegir una que ya existe** (con el buscador). Si escribes a alguien que parece que ya está (mismo nombre y nacimiento a ±2 años), te lo propone.
5. **Apellidos a la española**: el hijo recibe el 1.º del padre y el 1.º de la madre; el padre, el 1.º de la persona; la madre, el 2.º. Se pueden cambiar.
6. **Fechas en español**: `1750`, `6 mar 1974`, `6/3/1974`, `h. 1750`, `antes de 1733`, `después de 1801`, `entre 1700 y 1710`. Debajo se ve cómo queda en el GEDCOM. Con la **edad al morir** calcula el año de nacimiento.
7. **Avisos de imposibles** (las reglas de `auditar_gedcom.py`): madre de menos de 14 o más de 52 años, padre de más de 75, nacido tras morir la madre, muere antes de nacer…
8. **↶ Deshacer** deshace el último cambio (y lo guarda). **Terminar** quita el candado.

**Seguridad** (cada cambio se guarda al momento):
- antes de escribir se relee el archivo: si cambió en el disco (Family Historian, un script, otro aparato), **no se guarda nada** y avisa;
- el archivo nuevo se comprueba antes de escribirlo (personas y enlaces);
- **copias** en `copias/`: `edmundo_app_AAAAMMDD-HHMMSS.ged` (el archivo tal como estaba al empezar la sesión) y `edmundo_app_anterior.ged` (la versión anterior a cada guardado); se releen para comprobarlas;
- el navegador escribe en un archivo aparte y solo al final lo cambia por el bueno; después se relee y compara byte a byte;
- **candado** `edmundo.ged.lock` mientras editas; si lo tiene puesto un script, no deja guardar;
- además, Dropbox guarda 30 días de versiones de cada archivo.

En el móvil no se puede editar (el navegador no puede escribir en tus archivos). **No edites el mismo GEDCOM con Family Historian a la vez.**

## Pruebas (en este ordenador)

```
python -I 11_aplicacion/servidor_local.py
```

- Abrir **http://localhost:8765/Genealogia_2/11_aplicacion/pruebas.html** (32 pruebas) y **pruebas_edicion.html** (28 pruebas de edición sobre una copia en el disco privado del navegador, nunca sobre el archivo bueno). Entre ellas:
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
| 2. Edición: datos, añadir hijo, padre, madre y cónyuge, elegir existentes, apellidos españoles, fechas, avisos, copias, deshacer, candado | Hecha y probada sobre una copia; falta la prueba del usuario. Pendiente: notas y fuentes, quitar enlaces, móvil sin conexión |
| 3. Árboles en pantalla | Hecho lo básico (gráfico de 5 generaciones, lista de antepasados, descendientes). Pendiente: abanico y reloj de arena (Topola) |
| 4. PDF y SVG para imprenta | Hecho desde la app: abanico y cuadro, A4–A0. Pendiente: el mural sobre mapa con escudos (programa `arbol_imprimir_2025`) |
