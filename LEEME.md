# Árbol: visor de árboles GEDCOM

Programa para buscar y ver un árbol genealógico en formato GEDCOM, en el ordenador o en el móvil.
**Vale para cualquier persona y cualquier GEDCOM**: no lleva nada fijo de este proyecto.

- Dirección: **https://edmundo00.github.io/arbol/** (código público en `edmundo00/arbol`; no lleva datos de nadie).
- **Los datos no salen del aparato.** El GEDCOM y las fotos se leen en el navegador, desde el disco del ordenador o del
  móvil. No se sube nada a ningún sitio.
- Fase actual: **1, solo lectura**. El programa no cambia ningún archivo.

## Cómo se usa

**Lo más sencillo (cualquier navegador, ordenador o móvil):** abre la dirección y pulsa **Abrir GEDCOM…**, o arrastra el `.ged`
a la ventana. No pide permisos. Sale primero la pantalla de **Estadísticas** (📊 arriba): personas, fechas, apellidos, lugares,
generaciones y cuántos **grupos sin parentesco** hay (para ver si se coló gente ajena). Pulsa **Ver el árbol** para navegar.
El navegador guarda una copia y la abre sola la próxima vez; para cambiar de árbol, ⚙ → **Abrir otro GEDCOM…** (o arrastra otro).

### En el ordenador (Chrome o Edge)

1. Abre la dirección y pulsa **Elegir archivo GEDCOM…**. Elige tu `.ged` (por ejemplo,
   `1 Árbol/Árbol de trabajo/edmundo.ged`).
2. Para ver fotos y transcripciones: en una ficha, pestaña **Documentos**, pulsa un botón de fotos y luego **Elegir carpeta…**.
   Elige la carpeta donde están las fotos: lo más sencillo, la carpeta **`Genealogia`** entera (o toda la de Dropbox, `D:\Dropbox`).
   Se pueden añadir varias con **Añadir otra carpeta…**.
   - Desde el 1-XI-2026 `Genealogia` y `Genealogia_2` son una sola carpeta, `Genealogia`. Las rutas de antes (en notas del GEDCOM
     o en la base de nombres) se traducen solas con la tabla `9 Sistema/Control/mudanza/mapa_rutas.csv`, que está dentro de la carpeta.
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
  - Filtros por **nombre** y **apellidos** por separado, lugar, años y línea.
- **Vista de familia**: la persona con sus cónyuges e hijos, sus padres y sus hermanos. Con un clic se pone en el centro a cualquiera de ellos.
- **Dos modos, Familia y Árbol**, con los dos botones de la barra de arriba (en el móvil, solo los iconos). El programa recuerda el modo:
  si estás en Árbol y pulsas a alguien, el árbol se centra en esa persona; para ver su ficha, pulsas **Familia**.
  - **Gráfico de antepasados**: la persona y 5 generaciones de antepasados (la flecha ▸ indica que hay más hacia atrás).
  - **Gráfico de descendientes**: la persona a la izquierda y 3 generaciones de hijos, nietos y bisnietos hacia la derecha, con sus cónyuges.
  - **Antepasados**: todos, por generaciones, con su número (2 padre, 3 madre, 4 abuelo paterno…) y cuántos hay de cuántos posibles. Los números llevan puntos de millar y, desde el millón, también en palabras («549.755.813.888 (550 mil millones)»). **Ir al n.º** marca la fila de ese antepasado.
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

## Ver y corregir un documento (desde el 6-XI-2026)

Al abrir una foto o un texto se abre el **visor de documentos**, `js/visordoc.js`. Es **el mismo** que usa `9 Sistema/Herramientas/REVISAR TRANSCRIPCIONES.html`: lo que se mejore en uno sale en los dos. El revisor solo añade la lista de lo que queda por revisar. Es un script sin `import` porque el revisor se abre con doble clic y ahí no se pueden cargar módulos.

- **La foto:** zoom con la rueda en el punto que se mira, arrastrar, ancho o página entera, giro y enderezar (se recuerda por foto), brillo, contraste, preajustes («Tinta débil», «Microfilm»…), negativo, nitidez, regla de lectura y minimapa. Los PDF se ven dentro.
- **El texto:** se corrige directamente, con `[?]`, `[ilegible]` y abreviaturas en color y sus botones; pestaña **Lectura** para verlo presentado y **Encabezado** para los datos. Si hay más de una («(Claude)», o la del documento entero), se elige arriba.
- **Foto sin transcripción:** **Empezar a transcribir** prepara el `.md` con su encabezado; el archivo se crea al lado de la foto la primera vez que se guarda.
- **Guardar:** la primera vez el navegador pide permiso para escribir en la carpeta. Antes de cambiar un texto hace copia y apunta el cambio en `9 Sistema/Control/registro/revisiones(.csv)`; en una carpeta sin ese proyecto, en `Copias de transcripciones`. Si el archivo cambió fuera, pregunta. Lo que no se ha guardado queda de borrador. No toca el GEDCOM ni las fotos. Un archivo que no está en UTF-8 o que no es `.md` o `.txt` se abre solo para leer. Con el servidor de pruebas también se abre solo para leer.
- **Revisar:** **Marcar revisada**, porcentaje de fiabilidad y **⚑ Afecta al árbol**; si `9 Sistema/Herramientas/datos_revisar.js` está en la carpeta, también los posibles errores detectados en esa página.
- **Personas:** arriba salen las que citan el documento; con un clic se va a su ficha.
- Atajos: **?** en la barra. **Ctrl+S** guarda; **Alt+←/→** o **Av Pág/Re Pág** cambian de página; **Esc** cierra, avisando si hay algo sin guardar.
- Pendiente: «Ver el documento» al citar y la columna del documento en «Alta desde una partida» siguen con su vista sencilla.

## Revisar el árbol

En el buscador, pestaña **Revisar el árbol**:
- **Dónde se corta la línea**: los antepasados de la persona de referencia a los que les falta el padre, la madre o los dos, por generaciones y con su número. Es la lista de lo que queda por investigar.
- **Incoherencias**: muere antes de nacer, madre o padre demasiado jóvenes o mayores, hijos nacidos tras morir la madre o el padre, bodas con menos de 14 años… Primero la línea directa. Son las reglas de `auditar_gedcom.py` y salen las mismas cifras.
- **Posibles duplicados**: mismo nombre y nacidos con 2 años o menos de diferencia, con sus padres para comparar. En modo edición, **⇆ Fusionar** abre la comparación.

## Editar sin pasos previos (desde el 4-XI-2026)

En Chrome o Edge de ordenador, los botones de editar («+ Añadir padre»…) están siempre a la vista. Al pulsar uno, la aplicación se conecta sola con el archivo: la primera vez pide la carpeta `1 Árbol/Árbol de trabajo` y la recuerda; después, como mucho, el navegador pide permiso con un clic (elegir «Permitir en cada visita»). Da igual haber abierto una copia: si en la carpeta hay una versión más nueva, se usa esa. Las copias de seguridad, el candado y las comprobaciones son las de siempre. En el móvil no se edita.

## Base de nombres y lugares

La base `9 Sistema/Control/nombres_lugares.db` (la hace `9 Sistema/Control/scripts/nombres_lugares.py`) dice en qué documentos sale cada persona y quién hay en cada lugar.
Se lee del disco con **sql.js**, que va dentro del programa (`vendor/sqljs`, licencia MIT): no hace falta internet.

- **Ficha → pestaña «Menciones»**: dónde sale la persona, en tres grupos:
  - **enlazadas con seguridad** (citas del registro, número o identificador escrito en el texto, cabecera de la transcripción);
  - **pistas** (enlazadas solo por el nombre: hay que comprobarlas);
  - **posibles por el nombre** (mismo nombre en documentos sin enlace: pueden ser otra persona).
  Cada una con su documento, papel, fecha y contexto, y botones **📜 Texto** y **📷 Imagen** que abren la transcripción o la foto con las carpetas elegidas.
- **Buscar → los documentos** (debajo de las personas, en la misma búsqueda): **Nombre** y **Apellidos** (por separado: «Juan» en Nombre no encuentra a los apellidados Juan), **Lugar** y años desde y hasta. Con nombre, el lugar y los años acotan a esa persona; solo con lugar, sale quién hay allí.
  - Salen primero los documentos y después las personas del árbol, en cuatro grupos: **cumplen lo pedido**; **cumplen en parte** (coincide un dato y del otro no consta nada); **sin ese dato**, plegado; y **fuera de lo pedido**, plegado (su año o su lugar son otros). Nada se oculta sin decirlo: cada grupo da su cifra y cada resultado dice su año y su lugar y de dónde salen.
  - El año es el de la fecha de la mención o de su documento; si no hay, el escrito junto al nombre; si no, el de la transcripción enlazada. El lugar es el de la cabecera, el de la transcripción enlazada, el de la carpeta de la parroquia o el escrito junto al nombre. Un lugar nombrado en otra parte de un libro no basta para cumplir.
  - **Tipo de documento** y **Archivo** funcionan igual. El tipo sale de la cabecera o, si no lo tiene, del título o del nombre del archivo (la lista de grupos está en `TIPOS`, en `js/nombresdb.js`). El archivo sale de la carpeta `2 Documentos/<archivo>/`. Libros, fichas y notas no tienen tipo: van a «sin ese dato».
  - Dentro de cada grupo, primero el nombre exacto («María Fernández» antes que «María Rosa Fernández»). No hay tope: se ven de 30 en 30 con «Ver más», diciendo cuántas faltan, y el Excel lleva la lista entera.
  - **Una fila por documento**: las demás menciones del mismo documento van dentro («Y 4 menciones más en este documento»), y una cita del registro se une a su transcripción.
- **Una sola búsqueda (pestaña «Buscar»)**: las personas salen al momento del GEDCOM abierto (siempre al día) y los documentos debajo, de la base de nombres. También filtra por **su papel** en el documento, **línea** (antepasados de…), **con foto**, **transcrito** y **enlazado al árbol**. Lo escrito en el cuadro de arriba se reparte solo en los campos: nombre, lugar, años y tipo (`maria fernandez jubia 1731-1735 defunción`; un lugar de varias palabras, con «en»: `… en san martin de jubia`). `js/consulta.js`.
  - `buscar_nombres.py` no tiene estos grupos: con años sigue dejando pasar lo que no tiene fecha y corta en 300.
- La primera vez pide **Elegir base de nombres (.db)…**; después se recuerda, como el GEDCOM, y se lee siempre del disco.
- Pesa unos 180 MB: en el ordenador abre en un par de segundos; en el móvil puede ir muy lento.

## Editar (fase 2, en el ordenador con Chrome o Edge)

1. Abre el GEDCOM como siempre y pulsa **✎ Editar** en la barra.
2. Elige la **carpeta donde está el archivo** (por ejemplo `1 Árbol/Árbol de trabajo`) y da permiso de escritura.
3. En la vista de **Familia** aparecen los botones:
   - **✎ Editar sus datos**: nombre, apellidos, sexo, nacimiento y defunción;
   - **+ Añadir padre / + Añadir madre** (si no los tiene);
   - **+ Añadir hijo** (en cada pareja; o sin cónyuge);
   - **+ Añadir cónyuge** (con fecha y lugar de boda).
4. En cada «Añadir» se puede crear una **persona nueva** o **elegir una que ya existe** (con el buscador). Si escribes a alguien que parece que ya está (mismo nombre y nacimiento a ±2 años), te lo propone.
5. **Apellidos a la española**: el hijo recibe el 1.º del padre y el 1.º de la madre; el padre, el 1.º de la persona; la madre, el 2.º. Se pueden cambiar.
6. **Fechas en español**: `1750`, `6 mar 1974`, `6/3/1974`, `h. 1750`, `antes de 1733`, `después de 1801`, `entre 1700 y 1710`. Debajo se ve cómo queda en el GEDCOM. Con la **edad al morir** calcula el año de nacimiento.
7. **Avisos de imposibles** (las reglas de `auditar_gedcom.py`): madre de menos de 14 o más de 52 años, padre de más de 75, nacido tras morir la madre, muere antes de nacer…
8. **Quitar enlaces y borrar**: ✕ en el cónyuge o en un hijo, «✕ No son sus padres» bajo los padres y **🗑 Borrar** la persona (con sus enlaces). No se borra a nadie más.
9. **Hechos**: en «Datos», ✎ y ✕ en cada hecho y **+ Añadir hecho** (bautismo, entierro, oficio, residencia, testamento, título…), con fecha, lugar, descripción y nota. **✎ Boda** en cada matrimonio.
10. **Notas**: en «Notas», ✎ Cambiar, ✕ Quitar y **+ Añadir nota**.
11. **⇆ Fusionar con otra ficha**: se elige la otra ficha de la misma persona y se ven las dos lado a lado. Lo que no se elige no se pierde: el otro nombre queda como alternativo y la otra fecha como segundo nacimiento o defunción; padres, cónyuges, hijos, hechos, notas, fuentes y fotos pasan a la ficha que se queda.
12. **Citar un documento**: en «Documentos», **+ Citar uno que ya está**. Sin escribir nada salen primero los **de su familia** (cónyuge, boda, hijos, padres, hermanos, y los que por el título parecen suyos o de ellos); también se puede escribir «mujer» o «hijo». Al elegir uno que un pariente ya tiene citado, se rellenan solos el papel, qué prueba y el grado, copiados de esa cita: conviene mirarlos, y se pueden cambiar. El papel y qué prueba son opcionales; las fotos («1,3-5») también. **Filtros:** tipo, años desde y hasta, archivo o lugar (Xubia y Jubia valen igual), orden por fecha y «Solo en su vida» (activado; sin fechas suyas se calcula por su familia). Lo que no tiene fecha no se esconde: va en su grupo, y se dice cuántos quedan fuera por sus fechas. Si se elige uno que no cuadra, avisa pero deja citarlo. **Ver el documento** enseña sus fotos y su transcripción antes de guardar (hace falta tener elegida la carpeta).
13. **Confirmar menciones**: en «Menciones», **✓ Es esta persona** en las pistas y en las posibles. Si el documento no está en el registro, se da de alta.
    - Las citas y los documentos se guardan en el GEDCOM, y solo allí: no hay otra carpeta que elegir.
14. **↶ Deshacer** deshace el último cambio (también lo apuntado en el registro) y lo guarda. **Terminar** quita el candado.

**Se actualiza sola**: si el GEDCOM cambia en el disco mientras la tienes abierta (un programa, otra sesión, otro ordenador), lo vuelve a leer al volver a la ventana, cada 20 segundos y antes de cada cambio tuyo, y avisa. Al actualizarse se pierde el «deshacer» de lo anterior (las copias siguen en `copias/`).

**Seguridad** (cada cambio se guarda al momento):
- antes de escribir se relee el archivo: si cambió en el disco (Family Historian, un script, otro aparato), **no se guarda nada** y avisa;
- el archivo nuevo se comprueba antes de escribirlo (personas y enlaces);
- **copias** en `copias/`: `edmundo_app_AAAAMMDD-HHMMSS.ged` (el archivo tal como estaba al empezar la sesión) y `edmundo_app_anterior.ged` (la versión anterior a cada guardado); se releen para comprobarlas;
- el navegador escribe en un archivo aparte y solo al final lo cambia por el bueno; después se relee y compara byte a byte;
- **candado** `edmundo.ged.lock` mientras editas; si lo tiene puesto un script, espera unos 30 segundos antes de dejar de intentarlo, y si había texto tecleado lo enseña para copiarlo;
- **de uno en uno:** los cambios se guardan en cola, aunque se hagan muy seguidos;
- **si el árbol cambia fuera mientras tienes un formulario abierto:** al guardar se relee y lo tecleado se aplica sobre la versión nueva, sin volver a escribirlo. Si cambió esa misma nota, lo tuyo queda como nota nueva. Las acciones sin formulario (quitar, borrar, fusionar) avisan y hay que repetirlas;
- además, Dropbox guarda 30 días de versiones de cada archivo.

En el móvil no se puede editar (el navegador no puede escribir en tus archivos). **No edites el mismo GEDCOM con Family Historian a la vez.**

## Herramientas de investigación y seguridad (2.ª lista de 20 mejoras)

- **Revisar el árbol**, pestañas nuevas:
  - **Qué falta por probar**: los antepasados en una tabla, con el grado de la prueba (A, B, C) de cada hecho;
  - **Antepasados repetidos**: los que salen con varios números;
  - **Tareas pendientes**: las notas que empiezan por «Tarea» o «Pendiente»;
  - **Lugares**: variantes del mismo lugar, que se unifican de una vez;
  - **Salud del archivo**: códigos repetidos, enlaces sin vuelta, familias vacías, personas sin nombre, con reparación;
  - **Copias e historial**: diario de cambios, comparación con una copia y restauración.
- **Ficha**: parentesco con las personas de referencia, cronología, grado de prueba en cada hecho y tareas en las notas.
- **Texto libre**: busca una frase en las notas, en los contextos de la base de nombres y, si se pide, en todas las transcripciones.
- **Alta rápida desde una partida** (✎ Editar → «Partida»): con el documento a la izquierda, se rellenan bautizado, padres, abuelos, padrinos o novios, y se crean o enlazan todos de una vez, con su cita.
- **Compartir** (Ajustes): copia del GEDCOM sin vivos y, si se quiere, sin notas.
- **Menciones**: el mismo texto en varios documentos (copias de un mismo archivo) sale una sola vez, con la lista de los demás. Los **árboles ya hechos** (PDF y SVG impresos, listados de otros programas y el árbol antiguo) van aparte y plegados, porque no son fuentes.
- **⬇ Excel (CSV)**: debajo de los resultados de Buscar (todos, no solo los 300 que se ven), de los documentos encontrados y de cada pestaña de Revisar. Se abre con doble clic en Excel (separador «;» y tildes bien).
- **Informe de ascendientes** (Imprimir): en texto, generación a generación, con número, fechas, lugares, boda, padres y fuentes con su grado. **Ver e imprimir / PDF** o **Descargar para Word** (.doc; desde Word se guarda como .docx).
- **Sin conexión** (en GitHub Pages): la primera vez que se abre con internet, el programa queda guardado en el aparato y luego abre sin red. En el móvil, en el menú del navegador, **Instalar aplicación** o **Añadir a pantalla de inicio**. Los datos (el GEDCOM, las fotos) no se guardan ahí: los sigue eligiendo cada uno. En `localhost` no se usa, para ver siempre los cambios.

## Pruebas (en este ordenador)

```
python -I "9 Sistema/Aplicación/servidor_local.py"
```

- Abrir **http://localhost:8765/Genealogia/9 Sistema/Aplicación/pruebas.html** (32 pruebas) y **pruebas_edicion.html** (28 pruebas de edición sobre una copia en el disco privado del navegador, nunca sobre el archivo bueno). Entre ellas:
  - el GEDCOM leído y vuelto a escribir sale **idéntico byte a byte**;
  - el buscador;
  - el Ahnentafel;
  - fotos y transcripciones encontradas con otras rutas delante.
- El servidor solo atiende a este ordenador y solo a la carpeta `Genealogia`.
  En la pantalla de inicio, en `localhost`, aparece **Usar el servidor local** para probar sin elegir archivos.

## Publicar un cambio

Esta carpeta es el repositorio de GitHub. Se publica con:

```
python -I "9 Sistema/Aplicación/publicar.py" "qué cambia"
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
| `js/md.js` | Muestra las transcripciones y fichas (.md); el código está en `visordoc.js` |
| `js/visordoc.js` | El visor de documentos: foto, texto y guardar. Lo comparten la aplicación y el revisor |
| `variantes.json` | Grupos de apellidos que se buscan juntos |
| `js/nombresdb.js`, `js/menciones.js`, `vendor/sqljs/` | Base de nombres y lugares (sql.js, sin internet) |
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
