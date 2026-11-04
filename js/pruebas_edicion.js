// Pruebas de la edición sobre una COPIA del GEDCOM en el disco privado del navegador (OPFS): nunca toca el archivo bueno.
import { Gedcom, decodificar, textoLargo } from './gedcom.js?v=202611042002';
import { Arbol } from './modelo.js?v=202611042002';
import { Editor, partirApellidos, apellidosHijo, apellidosPadre, apellidosMadre } from './editar.js?v=202611042002';
import { Guardado, comprobar } from './guardar.js?v=202611042002';
import { aGedcom, avisos, posiblesDuplicados } from './fechas.js?v=202611042002';
import { clave } from './buscar.js?v=202611042002';

const out = document.getElementById('out');
let fallos = 0;
function ok(c, t) { if (!c) fallos++; out.insertAdjacentHTML('beforeend', `<li class="${c ? 'bien' : 'mal'}">${c ? '✔' : '✘'} ${t}</li>`); }
const iguales = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
async function bytesDe(dir, nombre) { return new Uint8Array(await (await (await dir.getFileHandle(nombre)).getFile()).arrayBuffer()); }
async function lanza(f) { try { await f(); return null; } catch (e) { return e; } }

async function main() {
  // Fechas
  const F = t => aGedcom(t).ged;
  ok(F('1750') === '1750' && F('h. 1750') === 'ABT 1750' && F('antes de 1733') === 'BEF 1733' && F('después de 1801') === 'AFT 1801', 'Fechas: 1750, h., antes de, después de');
  ok(F('entre 1700 y 1710') === 'BET 1700 AND 1710' && F('6 mar 1974') === '6 MAR 1974' && F('6/3/1974') === '6 MAR 1974' && F('6 de marzo de 1974') === '6 MAR 1974' && F('marzo 1974') === 'MAR 1974', 'Fechas: entre, día y mes en varias formas');
  ok(!!aGedcom('el martes').error && !!aGedcom('31/13/1990').error, 'Fechas imposibles de leer dan error');
  ok(partirApellidos('de la Fuente López')[0] === 'de la Fuente' && partirApellidos('Houwelingen y Sotomayor')[0] === 'Houwelingen', 'Primer apellido con partículas');
  ok(apellidosHijo({ apellidos: 'Fraga Lopez' }, { apellidos: 'Rodriguez Fernandez' }) === 'Fraga Rodriguez', 'Hijo: Fraga López + Rodríguez Fernández → Fraga Rodríguez');
  ok(apellidosPadre({ apellidos: 'Fraga Lopez' }) === 'Fraga' && apellidosMadre({ apellidos: 'Fraga Lopez' }) === 'Lopez', 'Padre → Fraga; madre → López');
  ok(avisos(null, { nac: '1700', padres: [{ nombre: 'M', sexo: 'F', nac: { fecha: '1640' } }] }).length === 1, 'Aviso: madre de 60 años');
  ok(avisos(null, { nac: '1760', padres: [{ nombre: 'P', sexo: 'M', def: { fecha: '1750' } }] }).length === 1, 'Aviso: nacido tras morir el padre');

  // Copia del GEDCOM en el disco privado del navegador
  const original = new Uint8Array(await (await fetch(encodeURI('/Genealogia/1 Árbol/Árbol de trabajo/edmundo.ged'), { cache: 'no-store' })).arrayBuffer());
  const raizOPFS = await navigator.storage.getDirectory();
  try { await raizOPFS.removeEntry('prueba', { recursive: true }); } catch {}
  const dir = await raizOPFS.getDirectoryHandle('prueba', { create: true });
  const w = await (await dir.getFileHandle('edmundo.ged', { create: true })).createWritable(); await w.write(original); await w.close();
  ok(iguales(await bytesDe(dir, 'edmundo.ged'), original), `Copia de prueba en el disco privado del navegador (${(original.length / 1e6).toFixed(1)} MB)`);

  const ged = Gedcom.desdeBytes(original), arbol = new Arbol(ged), ed = new Editor(ged, arbol);
  const g = new Guardado(dir, 'edmundo.ged', original);
  const n0 = arbol.personas.size;

  // 1. Añadir un hijo a Edmundo y Diana
  ed.empezar('hijo');
  const nuevo = ed.nuevaPersona({ nombre: 'Prueba', apellidos: 'Fraga Rodriguez', sexo: 'M', nac: { fecha: '1 JAN 2020', lugar: 'Ferrol' }, def: { fecha: '', lugar: '' } });
  ed.hijo('@I1@', '@F998@', nuevo);
  ed.terminar();
  ok(arbol.personas.size === n0 + 1 && arbol.f('@F998@').hijos.includes(nuevo) && arbol.p(nuevo).famc[0] === '@F998@', `Hijo nuevo ${nuevo} en la familia F998`);
  const r1 = await g.guardar(ged.bytes(), arbol.personas.size);
  const disco1 = await bytesDe(dir, 'edmundo.ged');
  ok(!iguales(disco1, original) && iguales(disco1, ged.bytes()), 'Guardado en el disco y releído igual');
  const copias = await dir.getDirectoryHandle('copias');
  ok(iguales(await bytesDe(copias, r1.copiaSesion.slice(7)), original), `Copia de la sesión: ${r1.copiaSesion}, idéntica al original`);
  ok(iguales(await bytesDe(copias, 'edmundo_app_anterior.ged'), original), 'Copia «anterior» idéntica al original');
  ok(!(await dir.getFileHandle('edmundo.ged.lock').then(() => true, () => false)), 'Tras guardar no queda candado (solo se pone mientras se escribe)');
  await g.ponerCandado();
  const candado = JSON.parse(await (await (await dir.getFileHandle('edmundo.ged.lock')).getFile()).text());
  const dura = Date.parse(candado.hasta) - Date.now();
  ok(candado.quien.startsWith('app:') && dura > 0 && dura <= 120000 && !!g.renovando, `Candado mientras se escribe: caduca en ${Math.round(dura / 1000)} s y se renueva`);
  await g.guardar(ged.bytes(), arbol.personas.size);
  ok(await dir.getFileHandle('edmundo.ged.lock').then(() => true, () => false), 'Un guardado dentro de una operación más larga no suelta su candado');
  await g.quitarCandado();
  ok(!(await dir.getFileHandle('edmundo.ged.lock').then(() => true, () => false)) && !g.renovando, 'Al acabar la operación se quita el candado y deja de renovarse');

  // Solo cambian los registros tocados
  const t0 = decodificar(original).texto, t1 = decodificar(disco1).texto;
  const lineas0 = new Set(t0.split('\r\n')), nuevas = t1.split('\r\n').filter(l => !lineas0.has(l));
  ok(nuevas.length <= 20, `Solo cambian ${nuevas.length} líneas: ${nuevas.slice(0, 8).join(' | ')}…`);
  ok(/1 _USED I\d+/.test(t1) && t1.includes('1 _USED I' + nuevo.slice(2, -1)), 'La cabecera de Family Historian (_USED) apunta el número nuevo');
  ok(comprobar(disco1, n0 + 1) === n0 + 1, 'El archivo guardado pasa la comprobación (personas y enlaces)');

  // 2. Padre y madre para alguien sin padres; cónyuge con una existente; editar datos
  const sinPadres = [...arbol.personas.values()].find(p => !p.famc.length && p.id !== nuevo);
  ed.empezar('padre'); const padre = ed.nuevaPersona({ nombre: 'Padre', apellidos: 'Prueba', sexo: 'M' }); ed.progenitor(sinPadres.id, 'HUSB', padre); ed.terminar();
  ed.empezar('madre'); const madre = ed.nuevaPersona({ nombre: 'Madre', apellidos: 'Prueba', sexo: 'F' }); ed.progenitor(sinPadres.id, 'WIFE', madre); ed.terminar();
  const fp = arbol.padres(sinPadres.id)[0];
  ok(fp && fp.marido === padre && fp.mujer === madre, `Padre y madre añadidos a ${sinPadres.id} en la misma familia ${fp?.id}`);
  ed.empezar('conyuge'); const fc = ed.conyuge(padre, '@I2528@', { fecha: 'ABT 1990', lugar: 'Vigo' }); ed.terminar();
  ok(arbol.f(fc).mujer === '@I2528@' && arbol.p('@I2528@').fams.includes(fc), 'Cónyuge elegido entre los existentes, con boda');
  ed.empezar('editar'); ed.datosPersona(nuevo, { nombre: 'Prueba Dos', apellidos: 'Fraga Rodriguez', sexo: 'M', nac: { fecha: '2 FEB 2021', lugar: 'Vigo' }, def: { fecha: '', lugar: '' } }); ed.terminar();
  ok(arbol.p(nuevo).nombre === 'Prueba Dos' && arbol.p(nuevo).nac.fecha === '2 FEB 2021', 'Editar nombre y nacimiento');
  ok(!!(await lanza(() => { ed.empezar('x'); try { ed.hijo('@I1@', '@F998@', '@I1@'); } finally { ed.cancelar(); } })), 'No deja hacer a alguien hijo de sí mismo');
  ok(!!(await lanza(() => { ed.empezar('x'); try { ed.progenitor(sinPadres.id, 'HUSB', '@I1@'); } finally { ed.cancelar(); } })), 'No deja poner un segundo padre');
  await g.guardar(ged.bytes(), arbol.personas.size);
  ok(comprobar(await bytesDe(dir, 'edmundo.ged'), arbol.personas.size) === n0 + 3, 'Guardado con 3 personas nuevas');

  // 3. Deshacer todo, paso a paso: vuelve a ser idéntico byte a byte salvo la cabecera _USED y los sellos CHAN
  while (ed.deshacer());
  await g.guardar(ged.bytes(), arbol.personas.size);
  const disco3 = await bytesDe(dir, 'edmundo.ged');
  ok(arbol.personas.size === n0 && iguales(disco3, original), 'Deshacer todo deja el archivo idéntico al original, byte a byte');

  // 4. Si el archivo cambia fuera, no se machaca
  const w2 = await (await dir.getFileHandle('edmundo.ged')).createWritable(); await w2.write(original.slice(0, original.length - 2)); await w2.write(original.slice(original.length - 2)); await w2.close();
  const w3 = await (await dir.getFileHandle('edmundo.ged')).createWritable(); await w3.write(new Uint8Array([...original.slice(0, 100), 32, ...original.slice(100)])); await w3.close();
  ed.empezar('x'); ed.nuevaPersona({ nombre: 'No', apellidos: 'Debe', sexo: 'U' }); ed.terminar();
  const e4 = await lanza(() => g.guardar(ged.bytes(), arbol.personas.size));
  ok(e4?.cambiadoFuera && (await bytesDe(dir, 'edmundo.ged')).length === original.length + 1, 'Archivo cambiado fuera: no se guarda y se avisa');
  ed.deshacer();

  // 5. Candado de otro: no se guarda
  const g2 = new Guardado(dir, 'edmundo.ged', await bytesDe(dir, 'edmundo.ged'));
  const wl = await (await dir.getFileHandle('edmundo.ged.lock', { create: true })).createWritable();
  await wl.write(JSON.stringify({ quien: 'claude:generar.py', desde: new Date().toISOString(), hasta: new Date(Date.now() + 600000).toISOString() })); await wl.close();
  const e5 = await lanza(() => g2.guardar(ged.bytes(), arbol.personas.size));
  ok(e5 && /usando «claude:generar.py»/.test(e5.message), 'Candado de un script: no se guarda');

  // 6. Un archivo nuevo roto no se escribe
  const roto = new TextEncoder().encode('0 HEAD\r\n0 @I1@ INDI\r\n1 FAMC @F999999@\r\n0 TRLR\r\n');
  ok(!!(await lanza(() => comprobar(roto, 1))), 'Un archivo con enlaces rotos no pasa la comprobación');

  ok(posiblesDuplicados(arbol, clave('Edmundo Fraga Lopez'), '1974').some(p => p.id === '@I1@'), 'Posible duplicado: avisa si se añade otro Edmundo Fraga López de 1974');

  // 7. Quitar enlaces, borrar, hechos, notas y fusionar; al deshacer todo, idéntico byte a byte
  {
    const gx = Gedcom.desdeBytes(original), ax = new Arbol(gx), ex = new Editor(gx, ax), n0 = ax.personas.size;
    const paso = (desc, f) => { ex.empezar(desc); try { f(); } catch (e) { ex.cancelar(); throw e; } ex.terminar(); return comprobar(gx.bytes(), ax.personas.size); };
    paso('quitar hijo', () => ex.quitarHijo('@F3@', '@I1@'));
    ok(!ax.p('@I1@').famc.length && ax.f('@F3@').hijos.includes('@I43@') && !ax.f('@F3@').hijos.includes('@I1@'), 'Quitar a Edmundo de la familia de sus padres (la hermana sigue)');
    const solo = ax.f('@F3@'); ex.historial.length && ex.deshacer();
    ok(ax.p('@I1@').famc[0] === '@F3@', 'Deshacer: vuelve a ser hijo de F3');
    // borrar una persona con familias
    const victima = [...ax.personas.values()].find(p => p.famc.length && p.fams.length && p.id !== '@I1@');
    paso('borrar', () => ex.borrarPersona(victima.id));
    ok(!ax.p(victima.id) && !ex.referencias(victima.id).length, `Borrar a ${victima.id} sin dejar enlaces rotos (${ax.personas.size} personas)`);
    // hechos
    const largo = 'Bautizado en San Julián. ' + 'Texto largo de prueba con acentos áéíóú y ñ. '.repeat(12) + '\nSegundo párrafo.';
    paso('hecho nuevo', () => ex.hecho('@I1@', null, { tag: 'BAPM', fecha: '10 MAR 1974', lugar: 'Ferrol', nota: largo }));
    const bap = ax.p('@I1@').eventos.find(e => e.tag === 'BAPM');
    ok(bap && bap.fecha === '10 MAR 1974' && ax.notaTexto(bap.nodo.hijos.find(h => h.tag === 'NOTE')) === largo.trim(), 'Hecho nuevo (bautismo) con nota larga partida en CONT/CONC y leída igual');
    paso('editar hecho', () => ex.hecho('@I1@', ax.p('@I1@').eventos.find(e => e.tag === 'BAPM').nodo, { tag: 'CHR', fecha: '11 MAR 1974', lugar: 'Ferrol', nota: '' }));
    const chr = ax.p('@I1@').eventos.find(e => e.tag === 'CHR');
    ok(chr && chr.fecha === '11 MAR 1974' && !chr.nodo.hijos.some(h => h.tag === 'NOTE'), 'Editar el hecho: cambia tipo y fecha, y se quita la nota vaciada');
    paso('boda', () => ex.hecho('@F998@', ax.f('@F998@').eventos.find(e => e.tag === 'MARR').nodo, { tag: 'MARR', fecha: '16 JUL 2006', lugar: 'Sotomayor (Pontevedra)' }));
    ok(ax.f('@F998@').eventos.find(e => e.tag === 'MARR').lugar === 'Sotomayor (Pontevedra)', 'Editar la boda de la familia F998');
    paso('borrar hecho', () => ex.borrarHecho('@I1@', ax.p('@I1@').eventos.find(e => e.tag === 'CHR').nodo));
    ok(!ax.p('@I1@').eventos.some(e => e.tag === 'CHR'), 'Borrar un hecho');
    // notas
    const notaN = ax.registro('@I1@').arbol.hijos.find(h => h.tag === 'NOTE');
    paso('nota registro', () => ex.nota('@I1@', notaN, 'Nota cambiada\ncon dos líneas'));
    ok(textoLargo(gx.porXref.get(notaN.valor).arbol) === 'Nota cambiada\ncon dos líneas', `Cambiar la nota ${notaN.valor} (registro NOTE)`);
    paso('nota nueva', () => ex.nota('@I1@', null, 'Nota nueva de prueba'));
    const nueva = ax.registro('@I1@').arbol.hijos.filter(h => h.tag === 'NOTE').pop();
    ok(nueva.valor === 'Nota nueva de prueba', 'Nota nueva escrita en la ficha');
    paso('borrar nota', () => ex.borrarNota('@I1@', nueva));
    // fusionar: un duplicado de Edmundo José (I47) como hijo de sus mismos padres
    let dup;
    paso('duplicado', () => { dup = ex.nuevaPersona({ nombre: 'Edmundo José', apellidos: 'Fraga Romero', sexo: 'M', nac: { fecha: '1947', lugar: 'Ferrol' } }); ex.hijo(ax.f(ax.p('@I47@').famc[0]).marido, ax.p('@I47@').famc[0], dup); ex.hecho(dup, null, { tag: 'OCCU', valor: 'Marino mercante' }); });
    const r = (() => { let x; paso('fusionar', () => { x = ex.fusionar('@I47@', dup, { nombre: 'a', nac: 'b' }); }); return x; })();
    const p47 = ax.p('@I47@'), f47 = ax.f(p47.famc[0]);
    ok(!ax.p(dup) && f47.hijos.filter(h => h === '@I47@').length === 1 && !f47.hijos.includes(dup) && !r.dosFamiliasDePadres, 'Fusionar: el duplicado desaparece y los padres no quedan con el hijo repetido');
    ok(p47.eventos.some(e => e.tag === 'OCCU' && e.valor === 'Marino mercante') && p47.otros.includes('Edmundo José Fraga Romero') && p47.nac.fecha === '1947',
      'Fusionar: pasa su oficio, su grafía del nombre queda como alternativa y su nacimiento (elegido) va primero');
    ok(!!(await lanza(() => { ex.empezar('x'); try { ex.fusionar('@I1@', '@I2528@'); } finally { ex.cancelar(); } })), 'No deja fusionar a dos casados entre sí');
    // Deshacer todo
    while (ex.deshacer());
    ok(ax.personas.size === n0 && iguales(gx.bytes(), original), 'Deshacer todo (quitar, borrar, hechos, notas, fusionar): idéntico al original byte a byte');
  }
  await raizOPFS.removeEntry('prueba', { recursive: true });
  document.title = fallos ? `FALLAN ${fallos}` : 'TODO BIEN';
  out.insertAdjacentHTML('beforeend', `<li><b>${fallos ? fallos + ' pruebas fallan' : 'Todas las pruebas de edición pasan'}</b></li>`);
}
main().catch(e => { ok(false, 'Error: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); document.title = 'ERROR'; });
