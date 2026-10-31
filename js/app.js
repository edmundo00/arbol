// Arranque, apertura del GEDCOM y de la carpeta de fotos, y navegación entre pantallas.
import { Gedcom } from './gedcom.js?v=202611010022';
import { Arbol, nombreCompleto } from './modelo.js?v=202611010022';
import { buscar, prepararVariantes } from './buscar.js?v=202611010022';
import { Fuente, Carpeta, Servidor, LS, hayDisco, permiso } from './almacen.js?v=202611010022';
import { resultados, familia, detalle, citas } from './vistas.js?v=202611010022';
import { md, esc } from './md.js?v=202611010022';
import { grafico, lista, descendientes, pestanasArbol } from './arboles.js?v=202611010022';
import { cuadro, abanico, PAPELES } from './imprimir.js?v=202611010022';
import { mural, acortador, rotuloGedcom } from './mural.js?v=202611010022';
import { Editor, apellidosHijo, apellidosPadre, apellidosMadre } from './editar.js?v=202611010022';
import { Guardado } from './guardar.js?v=202611010022';
import { formularioPersona } from './formularios.js?v=202611010022';
import { hijo as nodoHijo, valor as valorNodo } from './gedcom.js?v=202611010022';

const $ = s => document.querySelector(s);
const main = $('#main');
const esLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const PRUEBA = '/Genealogia_2/01_arboles/edmundo_actualizado/edmundo.ged';   // solo para el servidor de pruebas
let fuente = null, carpeta = null, carpetaPendiente = null, arbol, variantes = [], info = {};
let editor = null, guardado = null, renovar = null, guardando = false, bytesAbiertos = null;
const estadoBusqueda = JSON.parse(sessionStorage.getItem('arbol.busqueda') || '{}');

function pantalla(html) { main.innerHTML = html; window.scrollTo(0, 0); }
function error(e) {
  console.error(e);
  pantalla(`<div class="caja"><h2>Algo ha fallado</h2><p class="aviso">${esc(e.message || e)}</p>
    <p><button onclick="location.reload()">Volver a intentarlo</button> <button id="otro">Abrir otro archivo</button></p></div>`);
  $('#otro').onclick = async () => { await Fuente.olvidar(); LS.set('modo', null); location.hash = '#/'; location.reload(); };
}

// ---------- Arranque ----------

async function arrancar() {
  try {
    if (esLocal && LS.get('modo') === 'servidor') {
      carpeta = new Servidor();
      return abrir(await carpeta.bajar(PRUEBA));
    }
    const ult = await Fuente.ultima();
    if (ult?.asa && await permiso(ult.asa, false)) fuente = await Fuente.desdeAsa(ult.asa);
    else if (ult?.copia) fuente = new Fuente(ult.copia);
    else return inicio(ult);
    await recuperarCarpeta();
    abrir(fuente.datos);
  } catch (e) { error(e); }
}

async function recuperarCarpeta() {
  const c = hayDisco ? await Carpeta.guardada() : null;
  if (!c) return;
  if (await permiso(c, false)) carpeta = new Carpeta(c); else carpetaPendiente = c;
}

function inicio(ult) {
  $('#cabecera').hidden = true;
  pantalla(`<div class="caja">
    <h2>Abrir un árbol</h2>
    <p>Elige un archivo GEDCOM (<code>.ged</code>) de este aparato. No se sube a ningún sitio: se lee aquí, en el navegador.</p>
    ${ult?.asa ? `<p><button id="reabrir" class="principal">Volver a abrir «${esc(ult.asa.name)}»</button></p>` : ''}
    <p>${hayDisco ? `<button id="elegir"${ult?.asa ? '' : ' class="principal"'}>Elegir archivo GEDCOM…</button>`
                  : `<label class="boton principal">Elegir archivo GEDCOM…<input id="archivo" type="file" hidden></label>`}</p>
    <p class="peq">${hayDisco ? 'En este navegador el archivo se lee siempre del disco, así que ves siempre la última versión.'
      : 'En este aparato se guarda una copia del archivo en el navegador. Cuando lo cambies en el ordenador, vuelve a copiarlo al aparato y ábrelo otra vez.'}</p>
    ${esLocal ? `<hr><p class="peq">Pruebas: <button id="servidor">Usar el servidor local</button></p>` : ''}
  </div>`);
  if (ult?.asa) $('#reabrir').onclick = () => intentar(async () => { if (!await permiso(ult.asa, true)) throw new Error('Sin permiso para leer el archivo.'); fuente = await Fuente.desdeAsa(ult.asa); });
  if (hayDisco) $('#elegir').onclick = () => intentar(async () => { fuente = await Fuente.elegir(); });
  else $('#archivo').onchange = ev => ev.target.files[0] && intentar(async () => { fuente = await Fuente.desdeFile(ev.target.files[0]); });
  if (esLocal) $('#servidor').onclick = () => { LS.set('modo', 'servidor'); location.reload(); };
}

async function intentar(f) {
  try { await f(); } catch (e) { if (e.name === 'AbortError') return; return error(e); }
  try { await recuperarCarpeta(); abrir(fuente.datos); } catch (e) { error(e); }
}

function abrir(datos) {
  pantalla(`<div class="caja"><p class="cargando">Leyendo personas y familias…</p></div>`);
  setTimeout(async () => {
    try {
      const ged = Gedcom.desdeBytes(datos.bytes);
      arbol = new Arbol(ged);
      if (!arbol.personas.size) throw new Error(`«${datos.nombre}» no parece un GEDCOM: no tiene personas.`);
      bytesAbiertos = datos.bytes;
      info = { nombre: datos.nombre, fecha: datos.fecha, tam: datos.bytes.length, cod: ged.cod, copia: fuente?.esCopia, cuando: datos.cuando };
      arbol.ponerRaices(raicesGuardadas());
      try { variantes = prepararVariantes(await (await fetch('variantes.json?v=202611010022')).json()); } catch { variantes = []; }
      cabecera();
      window.arbol = arbol;
      ir();
    } catch (e) { error(e); }
  }, 20);
}

// ---------- Personas de referencia (se guardan por archivo, en este navegador) ----------

const claveRaices = () => 'raices:' + (info.nombre || '');
function raicesGuardadas() { try { return JSON.parse(LS.get(claveRaices()) || '[]'); } catch { return []; } }
function guardarRaices(ids) { LS.set(claveRaices(), JSON.stringify(ids)); arbol.ponerRaices(ids); cabecera(); }
function esRaiz(id) { return raicesGuardadas().includes(id) || (!raicesGuardadas().length && arbol.raices[0]?.id === id); }
function alternarRaiz(id) {
  let ids = raicesGuardadas();
  if (!ids.length) ids = arbol.raices.map(r => r.id);
  ids = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
  guardarRaices(ids);
}

function cabecera() {
  $('#cabecera').hidden = false;
  $('#raices').innerHTML = arbol.raices.map(r => `<a class="boton-cab" href="#/p/${esc(r.id.slice(1, -1))}" title="${esc(r.nombre)}">${esc(r.letra)}</a>`).join('');
  $('#estado').textContent = info.copia ? 'Copia del ' + new Date(info.fecha).toLocaleDateString('es') : '';
  estadoEdicion();
}

// ---------- Navegación ----------

window.addEventListener('hashchange', () => arbol && ir());

function recordar(id) { LS.set('ultima:' + (info.nombre || ''), id); marcarModo(); }

function ir() {
  if (!/^#\/p\//.test(location.hash)) { main.dataset.persona = ''; marcarModo(); }
  const h = decodeURIComponent(location.hash.slice(1)) || '/';
  let m;
  // Una persona se ve en el modo en que se esté (Familia o Árbol); las pestañas de la ficha son siempre de Familia.
  if ((m = /^\/p\/([^/]+)(?:\/(\w+))?$/.exec(h))) {
    if (m[2]) LS.set('modoVista', 'familia');
    return modo() === 'arbol' ? verArbol('@' + m[1] + '@') : verPersona('@' + m[1] + '@', m[2] || 'datos');
  }
  if ((m = /^\/imprimir\/([^/]+)$/.exec(h))) return verImprimir('@' + m[1] + '@');
  if (h === '/ajustes') return ajustes();
  return verBuscar();
}

function verBuscar() {
  document.title = 'Árbol · Buscar';
  const e = estadoBusqueda;
  if (e.linea && !arbol.raices.some(r => r.id === e.linea)) e.linea = null;
  pantalla(`<div class="buscador">
    <div class="filtros">
      <label>Lugar<input id="f-lugar" value="${esc(e.lugar || '')}" placeholder="Ferrol, Corrubedo…"></label>
      <label>Desde<input id="f-desde" inputmode="numeric" value="${esc(e.desde ?? '')}" placeholder="1600"></label>
      <label>Hasta<input id="f-hasta" inputmode="numeric" value="${esc(e.hasta ?? '')}" placeholder="1800"></label>
      <label>Línea<select id="f-linea"><option value="">Todo el árbol</option>
        ${arbol.raices.map(r => `<option value="${esc(r.id)}"${e.linea === r.id ? ' selected' : ''}>Antepasados de ${esc(r.nombre)}</option>`).join('')}</select></label>
    </div>
    <div id="res"></div>
    ${!e.q && !e.lugar && !e.linea ? `<div class="inicio"><p>Escribe arriba cualquier trozo de nombre o apellido. No importan las tildes ni la ortografía (b/v, y/i, h…).</p>
      <p>${arbol.raices.map(r => `<a class="tarjeta-enlace" href="#/p/${esc(r.id.slice(1, -1))}">${esc(r.nombre)}</a>`).join(' ')}</p>
      <p class="peq">«${esc(info.nombre)}» · ${arbol.personas.size.toLocaleString('es')} personas · ${arbol.familias.size.toLocaleString('es')} familias
        ${info.copia ? `<br>Copia guardada en este aparato, del archivo del ${esc(new Date(info.fecha).toLocaleString('es'))}` : ''}</p></div>` : ''}
  </div>`);
  for (const id of ['f-lugar', 'f-desde', 'f-hasta', 'f-linea']) $('#' + id).addEventListener('input', lanzar);
  lanzar();
}

let temporizador;
function lanzar() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    const num = v => /^\d{3,4}$/.test(v.trim()) ? +v.trim() : null;
    const e = estadoBusqueda;
    e.q = $('#q').value;
    if ($('#f-lugar')) { e.lugar = $('#f-lugar').value; e.desde = num($('#f-desde').value); e.hasta = num($('#f-hasta').value); e.linea = $('#f-linea').value || null; }
    sessionStorage.setItem('arbol.busqueda', JSON.stringify(e));
    if (!$('#res')) { location.hash = '#/buscar'; return; }
    const r = buscar(arbol, e.q, { lugar: e.lugar, desde: e.desde, hasta: e.hasta, linea: e.linea, variantes });
    $('#res').innerHTML = r.total || e.q || e.lugar || e.linea || e.desde || e.hasta ? resultados(arbol, r) : '';
    const ini = document.querySelector('.inicio'); if (ini) ini.hidden = !!(e.q || e.lugar || e.linea);
  }, 120);
}

// ---------- Modo: Familia o Árbol (se recuerda) ----------

function modo() { return LS.get('modoVista') === 'arbol' ? 'arbol' : 'familia'; }
function vistaArbol() { return LS.get('vista') || (matchMedia('(max-width: 760px)').matches ? 'lista' : 'grafico'); }
// Botones Familia / Árbol de la barra: cambian el modo y abren a la última persona vista.
function marcarModo() { document.querySelectorAll('.modo').forEach(b => b.classList.toggle('activo', b.dataset.modo === modo())); }
document.querySelectorAll('.modo').forEach(b => b.onclick = () => {
  LS.set('modoVista', b.dataset.modo);
  const id = main.dataset.persona || LS.get('ultima:' + (info.nombre || '')) || arbol?.raices[0]?.id;
  if (!arbol || !id) return;
  main.dataset.persona = '';
  const h = '#/p/' + id.slice(1, -1);
  if (location.hash === h) ir(); else location.hash = h;
});

function verPersona(id, pestana) {
  const p = arbol.p(id);
  if (!p) return pantalla(`<div class="caja"><p class="aviso">No existe la persona ${esc(id)}.</p></div>`);
  document.title = nombreCompleto(p);
  const antes = main.dataset.persona === id;
  const y = window.scrollY;
  const raiz = esRaiz(id);
  main.innerHTML = `<div class="persona">${familia(arbol, id, !!editor)}
    <p class="acciones"><button id="raiz" title="Las personas de referencia salen arriba y numeran a sus antepasados">${raiz ? '★ Persona de referencia' : '☆ Marcar como persona de referencia'}</button>
      <label class="rotulo" title="Lo que sale debajo del nombre en los murales; vacío = su título u oficio del GEDCOM">Rótulo en murales<input id="rotulo" value="${esc(rotulosPropios()[id] || '')}" placeholder="${esc(rotuloGedcom(arbol, id) || 'p. ej. Comandante de Marina')}"></label></p>
    <section class="detalle">${detalle(arbol, id, pestana)}</section></div>`;
  main.dataset.persona = id;
  if (antes) window.scrollTo(0, y); else window.scrollTo(0, 0);
  $('#raiz').onclick = () => { alternarRaiz(id); verPersona(id, pestana); };
  $('#rotulo').onchange = ev => guardarRotulo(id, ev.target.value);
  main.querySelectorAll('[data-accion]').forEach(b => b.onclick = () => accion(b.dataset.accion, id, b.dataset.fam || null));
  recordar(id);
  const { docs, sueltas } = citas(arbol, id);
  main.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => {
    const k = b.dataset.fotos;
    const lista = k === 'sueltas' ? sueltas : b.dataset.todas ? docs[k].todas : docs[k].fotos;
    galeria($('#gal' + k), lista, docs[k]?.fuente);
  });
  main.querySelectorAll('[data-md]').forEach(b => b.onclick = () => verTexto(b.dataset.md, b.textContent));
}

// ---------- Edición (fase 2): cada cambio se guarda al momento, con copias y comprobaciones ----------

const pruebas = () => esLocal && LS.get('modo') === 'servidor';   // servidor de pruebas: se edita una copia dentro del navegador
function puedeEditar() { return hayDisco && (pruebas() || (fuente && !fuente.esCopia)); }

// Copia del GEDCOM en el disco privado del navegador, para probar la edición sin tocar el archivo de verdad.
async function guardadoDePrueba() {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('prueba-app', { create: true });
  const w = await (await dir.getFileHandle(info.nombre, { create: true })).createWritable(); await w.write(bytesAbiertos); await w.close();
  return new Guardado(dir, info.nombre, bytesAbiertos);
}

function estadoEdicion() {
  const b = $('#b-editar'), d = $('#b-deshacer');
  b.hidden = !puedeEditar();
  b.classList.toggle('activo', !!editor);
  b.querySelector('span').textContent = editor ? 'Terminar' : 'Editar';
  b.title = editor ? 'Terminar de editar (quita el candado)' : 'Editar el árbol (con copias de seguridad)';
  const ult = editor?.historial[editor.historial.length - 1];
  d.hidden = !ult;
  d.title = ult ? 'Deshacer: ' + ult.desc : '';
}

// Aviso antes de editar, en una ventana propia: el botón abre directamente el cuadro de elegir carpeta
// (Chrome solo lo deja abrir justo después de un clic; un confirm() en medio lo impide).
function activarEdicion() {
  if (editor) return terminarEdicion();
  const capa = $('#dialogo');
  capa.hidden = false; document.body.classList.add('con-visor');
  capa.innerHTML = `<div class="caja dialogo"><h2>Editar «${esc(info.nombre)}»</h2>
    ${pruebas() ? '<p><b>Modo de pruebas:</b> los cambios se guardan en una copia dentro del navegador, no en el archivo de verdad.</p>' : `
    <ul><li>Cada cambio se guarda al momento en el archivo, con <b>copia de seguridad</b> en la carpeta «copias».</li>
      <li>Mientras editas, los scripts no pueden escribirlo (candado).</li>
      <li>No lo edites a la vez con Family Historian.</li></ul>
    <p>Pulsa el botón y elige la <b>carpeta donde está el archivo</b>.</p>`}
    <p class="aviso" id="e-error"></p>
    <p class="botones"><button id="e-ok" class="principal">${pruebas() ? 'Empezar' : 'Elegir la carpeta y empezar'}</button> <button id="e-no">Cancelar</button></p></div>`;
  const cerrar = () => { capa.hidden = true; capa.innerHTML = ''; document.body.classList.remove('con-visor'); };
  capa.querySelector('#e-no').onclick = cerrar;
  capa.querySelector('#e-ok').onclick = async () => {
    try {
      guardado = pruebas() ? await guardadoDePrueba() : await Guardado.preparar(info.nombre, bytesAbiertos);
      await guardado.ponerCandado();
      editor = new Editor(arbol.ged, arbol);
      renovar = setInterval(() => guardado?.ponerCandado().catch(() => {}), 5 * 60000);
      cerrar();
      flotante('Edición activada. Los botones «+ Añadir…» están en la vista de familia.');
      estadoEdicion(); ir();
    } catch (e) {
      guardado = null;
      if (e.name !== 'AbortError') capa.querySelector('#e-error').textContent = e.message;
    }
  };
}
async function terminarEdicion() {
  clearInterval(renovar);
  try { await guardado?.quitarCandado(); } catch {}
  editor = null; guardado = null;
  estadoEdicion(); ir();
}

function flotante(texto, malo = false) {
  const e = $('#flotante');
  e.textContent = texto; e.className = malo ? 'malo' : ''; e.hidden = false;
  clearTimeout(e._t); e._t = setTimeout(() => { e.hidden = true; }, malo ? 12000 : 4000);
}

async function guardarAhora() {
  guardando = true;
  try {
    const r = await guardado.guardar(arbol.ged.bytes(), arbol.personas.size);
    bytesAbiertos = guardado.base;   // lo que hay ahora en el disco
    if (fuente) { fuente.datos.bytes = guardado.base; info.tam = guardado.base.length; }
    return r;
  }
  finally { guardando = false; }
}

// Hace un cambio y lo guarda. Si algo falla, el cambio se deshace en memoria y el archivo no se toca.
async function operar(desc, fn) {
  editor.empezar(desc);
  try { fn(); } catch (e) { editor.cancelar(); alert(e.message); return; }
  editor.terminar();
  try {
    const r = await guardarAhora();
    flotante('Guardado: ' + desc + (r.copiaSesion ? ` · copia en ${r.copiaSesion}` : ''));
  } catch (e) {
    editor.deshacer();
    alert('No se ha guardado nada.\n\n' + e.message);
    if (e.cambiadoFuera) await terminarEdicion();
  }
  estadoEdicion(); ir();
}

async function deshacer() {
  const tx = editor?.deshacer();
  if (!tx) return;
  try { await guardarAhora(); flotante('Deshecho: ' + tx.desc); }
  catch (e) { alert('No se ha podido guardar el deshacer. Recarga el árbol antes de seguir.\n\n' + e.message); await terminarEdicion(); }
  estadoEdicion(); ir();
}

let listaLugares = null;
function lugares() {
  if (!listaLugares) { const s = new Set(); for (const p of arbol.personas.values()) p.lugares.forEach(l => s.add(l)); listaLugares = [...s].sort((a, b) => a.localeCompare(b, 'es')); }
  return listaLugares;
}

function datosDe(id) {
  const p = arbol.p(id), a = arbol.registro(id).arbol;
  const ev = tag => { const n = nodoHijo(a, tag); return n ? { fecha: valorNodo(n, 'DATE'), lugar: valorNodo(n, 'PLAC') } : { fecha: '', lugar: '' }; };
  return { nombre: p.nombre, apellidos: p.apellidos, sexo: p.sexo, nac: ev('BIRT'), def: ev('DEAT') };
}

async function accion(tipo, id, famId) {
  if (!editor) return;
  const p = arbol.p(id), nom = nombreCompleto(p);
  const base = { arbol, variantes, lugares: lugares(), excluir: new Set([id]) };
  if (tipo === 'editar') {
    const r = await formularioPersona({ ...base, titulo: 'Editar a ' + nom, datos: datosDe(id),
      contexto: { padres: arbol.padres(id).flatMap(f => [f.marido, f.mujer]).filter(Boolean).map(x => arbol.p(x)), hijos: p.fams.flatMap(f => arbol.f(f)?.hijos || []).map(x => arbol.p(x)) } });
    if (r?.nueva) await operar('Editar a ' + nom, () => editor.datosPersona(id, r.nueva));
    return;
  }
  if (tipo === 'hijo') {
    const f = famId && arbol.f(famId);
    const padre = f ? arbol.p(f.marido) : p.sexo !== 'F' ? p : null, madre = f ? arbol.p(f.mujer) : p.sexo === 'F' ? p : null;
    const ap = apellidosHijo(padre, madre);
    const quien = [padre, madre].filter(Boolean).map(nombreCompleto).join(' y ');
    const r = await formularioPersona({ ...base, titulo: 'Añadir hijo de ' + quien, existente: true, propuesta: ap,
      datos: { apellidos: ap }, contexto: { padres: [padre, madre].filter(Boolean) }, excluir: new Set([padre?.id, madre?.id].filter(Boolean)) });
    if (!r) return;
    await operar('Añadir hijo de ' + quien, () => { const h = r.nueva ? editor.nuevaPersona(r.nueva) : r.existente; editor.hijo(id, famId, h); });
    return;
  }
  if (tipo === 'padre' || tipo === 'madre') {
    const ap = tipo === 'padre' ? apellidosPadre(p) : apellidosMadre(p);
    const r = await formularioPersona({ ...base, titulo: `Añadir ${tipo} de ${nom}`, existente: true, propuesta: ap,
      datos: { apellidos: ap, sexo: tipo === 'padre' ? 'M' : 'F' }, contexto: { hijos: [p] } });
    if (!r) return;
    await operar(`Añadir ${tipo} de ${nom}`, () => { const x = r.nueva ? editor.nuevaPersona(r.nueva) : r.existente; editor.progenitor(id, tipo === 'padre' ? 'HUSB' : 'WIFE', x); });
    return;
  }
  if (tipo === 'conyuge') {
    const r = await formularioPersona({ ...base, titulo: 'Añadir cónyuge de ' + nom, existente: true, boda: true,
      datos: { sexo: p.sexo === 'M' ? 'F' : p.sexo === 'F' ? 'M' : 'U' } });
    if (!r) return;
    await operar('Añadir cónyuge de ' + nom, () => { const x = r.nueva ? editor.nuevaPersona(r.nueva) : r.existente; editor.conyuge(id, x, r.nueva?.boda); });
  }
}

$('#b-editar').onclick = activarEdicion;
$('#b-deshacer').onclick = deshacer;
window.addEventListener('beforeunload', ev => { if (guardando) { ev.preventDefault(); ev.returnValue = ''; } });
window.addEventListener('pagehide', () => { guardado?.quitarCandado(); });

// ---------- Árboles ----------

function verArbol(id) {
  const vista = vistaArbol();
  if (!arbol.p(id)) return pantalla(`<div class="caja"><p class="aviso">No existe la persona ${esc(id)}.</p></div>`);
  const p = arbol.p(id);
  document.title = 'Árbol de ' + nombreCompleto(p);
  main.dataset.persona = id;
  const cuerpo = vista === 'lista' ? lista(arbol, id) : vista === 'desc' ? descendientes(arbol, id) : grafico(arbol, id);
  pantalla(`<div class="arbol-vista"><h2 class="tit-arbol">Árbol de ${esc(nombreCompleto(p))}
      <a class="boton imprimir" href="#/imprimir/${esc(id.slice(1, -1))}">🖨 Imprimir / PDF</a></h2>
    <section class="detalle">${pestanasArbol(vista)}<div class="cuerpo">${cuerpo}</div></section></div>`);
  recordar(id);
  main.querySelectorAll('[data-vista]').forEach(b => b.onclick = () => { LS.set('vista', b.dataset.vista); verArbol(id); });
  // «Ir al n.º»: abre su generación, la lleva a la vista y la resalta.
  $('#ir-num')?.addEventListener('submit', ev => {
    ev.preventDefault();
    const n = parseInt($('#num').value, 10);
    const fila = n >= 2 && document.getElementById('n' + n);
    if (!fila) return alert(n === 1 ? 'El n.º 1 es la propia persona.' : `No hay antepasado n.º ${n} en el árbol.`);
    fila.closest('details').open = true;
    main.querySelectorAll('.fila.marcada').forEach(f => f.classList.remove('marcada'));
    fila.classList.add('marcada');
    fila.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

// ---------- Imprimir: cuadro o abanico, en PDF (con el navegador) o SVG ----------

function verImprimir(id) {
  const p = arbol.p(id);
  if (!p) return pantalla(`<div class="caja"><p class="aviso">No existe la persona ${esc(id)}.</p></div>`);
  document.title = 'Imprimir · ' + nombreCompleto(p);
  let o = {}; try { o = JSON.parse(LS.get('imprimir') || '{}'); } catch {}
  o = { tipo: 'abanico', gens: 7, papel: 'A3', lugares: false, ancho: 1350, alto: 1034, minLetra: 2, rotulos: true, firma: '', ...o };
  if (!('fam' in o) || (o.fam && !p.fams.includes(o.fam))) o.fam = p.fams[0] || null;   // por defecto, la pareja con sus hijos
  const opc = (v, t, sel) => `<option value="${v}"${String(sel) === String(v) ? ' selected' : ''}>${t}</option>`;
  const familias = p.fams.map(f => arbol.f(f)).filter(Boolean);
  const nombreDe = x => x ? nombreCompleto(arbol.p(x)) : '?';
  const titulo0 = tipo => (tipo === 'mural' ? 'Árbol genealógico · ' : 'Antepasados de ') + nombreCompleto(p);
  pantalla(`<div class="imprimir-vista">
    <h2 class="tit-arbol">Imprimir el árbol de <a href="#/p/${esc(id.slice(1, -1))}">${esc(nombreCompleto(p))}</a></h2>
    <div class="filtros opciones">
      <label>Tipo<select id="o-tipo">${opc('abanico', 'Abanico', o.tipo)}${opc('cuadro', 'Cuadro de ascendientes', o.tipo)}${opc('mural', 'Mural (mariposa)', o.tipo)}</select></label>
      <label>Generaciones<select id="o-gens">${[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(g => opc(g, g, o.gens)).join('')}</select></label>
      <label>Papel<select id="o-papel">${Object.keys(PAPELES).map(k => opc(k, `${k} (${PAPELES[k][0]}×${PAPELES[k][1]} mm)`, o.papel)).join('')}${opc('medida', 'A medida…', o.papel)}</select></label>
      <label class="solo-normal">Lugares<select id="o-lugares">${opc('', 'Sin lugares', o.lugares ? '1' : '')}${opc('1', 'Con lugar de nacimiento', o.lugares ? '1' : '')}</select></label>
      <label class="solo-medida">Ancho (mm)<input id="o-ancho" inputmode="numeric" value="${esc(o.ancho)}"></label>
      <label class="solo-medida">Alto (mm)<input id="o-alto" inputmode="numeric" value="${esc(o.alto)}"></label>
      <label class="solo-mural">En el centro<select id="o-fam">${familias.map(f => opc(f.id, `${esc(nombreDe(f.marido))} y ${esc(nombreDe(f.mujer))}, con sus hijos`, o.fam)).join('')}${opc('', `${esc(nombreCompleto(p))}, entre su padre y su madre`, o.fam ?? '')}</select></label>
      <label class="solo-mural">Letra mínima<select id="o-min">${[1.5, 2, 2.5, 3, 4].map(v => opc(v, v + ' mm', o.minLetra)).join('')}</select></label>
      <label class="solo-mural">Títulos y oficios<select id="o-rot">${opc('1', 'Sí (del GEDCOM y los tuyos)', o.rotulos ? '1' : '')}${opc('', 'No', o.rotulos ? '1' : '')}</select></label>
      <label class="ancho">Título<input id="o-titulo" value="${esc(titulo0(o.tipo))}"></label>
      <label class="ancho solo-mural">Firma (abajo a la derecha)<input id="o-firma" value="${esc(o.firma)}" placeholder="Investigado por…"></label>
      <details class="ancho solo-mural"><summary>Lugares acortados (uno por renglón: «lugar largo = corto»)</summary>
        <textarea id="o-cortos" rows="5" placeholder="Sint Jan, Bolduque ('s-Hertogenbosch), Brabante = Bolduque">${esc(LS.get('lugaresCortos') || '')}</textarea>
        <p class="peq">Sin tabla, se quita lo que va entre paréntesis y lo que va tras la primera coma.</p></details>
    </div>
    <p class="botones"><button id="pdf" class="principal">Guardar como PDF / Imprimir</button> <button id="descargar">Descargar SVG (imprenta)</button></p>
    <p class="peq" id="consejo"></p>
    <div class="previa" id="previa"></div>
  </div>`);
  const tam = op => op.papel === 'medida' ? [Math.max(100, +op.ancho || 1000), Math.max(100, +op.alto || 700)] : PAPELES[op.papel];
  const leer = () => ({ tipo: $('#o-tipo').value, gens: +$('#o-gens').value, papel: $('#o-papel').value, lugares: !!$('#o-lugares').value,
    ancho: $('#o-ancho').value, alto: $('#o-alto').value, fam: $('#o-fam').value || null, minLetra: +$('#o-min').value, rotulos: !!$('#o-rot').value, firma: $('#o-firma').value });
  let tipoAntes = o.tipo;
  const vista = main.querySelector('.imprimir-vista');
  const dibujar = () => {
    const op = leer();
    LS.set('imprimir', JSON.stringify(op));
    LS.set('lugaresCortos', $('#o-cortos').value);
    vista.dataset.tipo = op.tipo; vista.dataset.papel = op.papel;
    if (op.tipo !== tipoAntes) { $('#o-titulo').value = titulo0(op.tipo); tipoAntes = op.tipo; }
    const sub = `${new Date().toLocaleDateString('es')} · ${info.nombre}`;
    const [W, H] = tam(op);
    let s;
    if (op.tipo === 'mural') {
      const propios = rotulosPropios();
      const r = mural(arbol, { id, fam: op.fam, gens: op.gens, W, H, minLetra: op.minLetra, titulo: $('#o-titulo').value, sub, firma: op.firma,
        lugar: acortador($('#o-cortos').value), rotulo: x => propios[x] ?? (op.rotulos ? rotuloGedcom(arbol, x) : '') });
      s = r.svg;
      $('#consejo').textContent = `${r.personas} personas · letra de ${r.letra.toFixed(1)} mm${r.letra < op.minLetra ? ' (no cabe con la letra mínima: usa un papel mayor o menos generaciones)' : ''} · ${W}×${H} mm. En «Guardar como PDF», márgenes «Ninguno» y escala 100 %.`;
    } else {
      s = (op.tipo === 'cuadro' ? cuadro : abanico)(arbol, id, { ...op, W, H, titulo: $('#o-titulo').value, sub });
      const hojas = 2 ** (op.gens - 1);
      $('#consejo').textContent = op.tipo === 'cuadro' && H / hojas < 6
        ? `Con ${op.gens} generaciones en este papel, cada caja de la última columna tiene ${(H / hojas).toFixed(1)} mm de alto: la letra saldrá diminuta. Usa un papel mayor, menos generaciones, el abanico o el mural.`
        : `Ancho ${W} mm × alto ${H} mm. En «Guardar como PDF», deja los márgenes en «Ninguno» y la escala al 100 %.`;
    }
    $('#previa').innerHTML = s;
    return s;
  };
  let espera;
  main.querySelectorAll('.opciones select, .opciones input, .opciones textarea').forEach(e => e.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(dibujar, 250); }));
  dibujar();
  const nombreArchivo = ext => { const op = leer(), [W, H] = tam(op); return `${op.tipo}_${nombreCompleto(p).replace(/[^\p{L}\p{N}]+/gu, '_')}_${op.gens}gen_${W}x${H}.${ext}`; };
  $('#descargar').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([dibujar()], { type: 'image/svg+xml' }));
    a.download = nombreArchivo('svg'); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  $('#pdf').onclick = () => {
    const s = dibujar(), [W, H] = tam(leer());
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(nombreArchivo('pdf').replace(/\.pdf$/, ''))}</title>
      <style>@page { size: ${W}mm ${H}mm; margin: 0 } html, body { margin: 0; padding: 0 } svg { display: block; width: ${W}mm; height: ${H}mm }</style></head><body>${s}</body></html>`;
    // En una ventana nueva; si el navegador la bloquea, desde un marco escondido en esta misma página.
    const v = window.open('', '_blank');
    if (v) { v.document.write(html); v.document.close(); setTimeout(() => v.print(), 300); return; }
    document.querySelector('#marco-imprimir')?.remove();
    const f = document.createElement('iframe');
    f.id = 'marco-imprimir'; f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.srcdoc = html;
    f.onload = () => setTimeout(() => f.contentWindow.print(), 200);
    document.body.appendChild(f);
  };
}

// Rótulos propios para los murales («Doctor ingeniero industrial»), por archivo y en este navegador.
const claveRotulos = () => 'rotulos:' + (info.nombre || '');
function rotulosPropios() { try { return JSON.parse(LS.get(claveRotulos()) || '{}'); } catch { return {}; } }
function guardarRotulo(id, texto) { const r = rotulosPropios(); if (texto.trim()) r[id] = texto.trim(); else delete r[id]; LS.set(claveRotulos(), JSON.stringify(r)); }

// ---------- Fotos y transcripciones (se leen de la carpeta elegida, solo al mirarlas) ----------

const IMG = /^(jpe?g|png|gif|tiff?|bmp|webp|heic)$/;

// Si no hay carpeta de fotos, se explica y se ofrece elegirla. Devuelve true si se puede seguir.
function hayCarpeta(caja) {
  if (carpeta) return true;
  caja.innerHTML = hayDisco
    ? `<p class="peq">Para ver fotos y transcripciones, elige la carpeta donde están (por ejemplo, la de Dropbox).
       ${carpetaPendiente ? `<button data-c="re">Volver a usar «${esc(carpetaPendiente.name)}»</button>` : ''} <button data-c="elegir">Elegir carpeta…</button></p>`
    : '<p class="peq">En este aparato no se pueden ver fotos ni transcripciones: solo el árbol. Se ven en el ordenador, con Chrome o Edge.</p>';
  caja.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => {
    try {
      if (b.dataset.c === 're') { if (!await permiso(carpetaPendiente, true)) return; carpeta = new Carpeta(carpetaPendiente); }
      else carpeta = await Carpeta.elegir();
      carpetaPendiente = null;
      caja.innerHTML = '<p class="peq">Carpeta lista. Vuelve a pulsar el botón de fotos.</p>';
    } catch (e) { if (e.name !== 'AbortError') caja.innerHTML = `<p class="aviso">${esc(e.message)}</p>`; }
  });
  return false;
}

async function galeria(caja, lista, fuenteDoc) {
  if (caja.dataset.lista === String(lista.length) && caja.innerHTML) { caja.innerHTML = ''; caja.dataset.lista = ''; return; }
  if (!hayCarpeta(caja)) return;
  caja.dataset.lista = String(lista.length);
  const MAX = 60;
  caja.innerHTML = lista.slice(0, MAX).map((m, i) => `<button class="mini" data-i="${i}" title="${esc(m.titulo)}">${IMG.test(m.form) ? '<span class="cargando"></span>' : `<span class="ext">${esc(m.form || '?')}</span>`}<small>${esc(m.titulo)}</small></button>`).join('')
    + (lista.length > MAX ? `<p class="peq">Se muestran ${MAX} de ${lista.length}. Abre una y pasa con las flechas.</p>` : '');
  caja.querySelectorAll('.mini').forEach(b => b.onclick = () => visor(lista, +b.dataset.i, fuenteDoc));
  const botones = [...caja.querySelectorAll('.mini')];
  let siguiente = 0;
  const trabajar = async () => {
    while (siguiente < botones.length) {
      const b = botones[siguiente], m = lista[siguiente++];
      if (!IMG.test(m.form)) continue;
      if (!m.ruta) { b.querySelector('span').outerHTML = '<span class="ext">sin ruta</span>'; continue; }
      try { const u = await carpeta.miniatura(m.ruta); b.querySelector('span').outerHTML = `<img src="${esc(u)}" alt="" loading="lazy">`; }
      catch (e) { b.querySelector('span').outerHTML = `<span class="ext" title="${esc(e.message)}">${e.noExiste ? 'no está' : 'error'}</span>`; }
    }
  };
  trabajar(); trabajar(); trabajar();
}

async function transcripcion(m, fuenteDoc) {
  if (m.ruta) { try { const t = await carpeta.transcripcion(m.ruta); if (t) return t; } catch (e) { if (!e.noExiste) throw e; } }
  const d = fuenteDoc?.transcripcion;
  if (d && /\.md$/.test(d) && !d.includes('*')) { try { return await carpeta.texto(d); } catch (e) { if (!e.noExiste) throw e; } }
  return null;
}

function visor(lista, i, fuenteDoc) {
  const capa = $('#visor');
  capa.hidden = false; document.body.classList.add('con-visor');
  let zoom = 1;
  const mostrar = async () => {
    const m = lista[i];
    capa.innerHTML = `<div class="barra"><button data-a="cerrar" aria-label="Cerrar">✕</button>
        <span class="tit">${i + 1}/${lista.length} · ${esc(m.titulo)}</span>
        <button data-a="menos" aria-label="Alejar">−</button><button data-a="mas" aria-label="Acercar">+</button>
        <button data-a="ant" aria-label="Anterior"${i ? '' : ' disabled'}>‹</button><button data-a="sig" aria-label="Siguiente"${i < lista.length - 1 ? '' : ' disabled'}>›</button></div>
      <div class="lienzo"><p class="cargando">Abriendo la imagen…</p></div>
      <div class="transc"><p class="peq">Buscando transcripción…</p></div>`;
    capa.querySelector('.barra').onclick = ev => {
      const a = ev.target.dataset.a;
      if (a === 'cerrar') cerrarVisor();
      else if (a === 'ant' && i > 0) { i--; mostrar(); }
      else if (a === 'sig' && i < lista.length - 1) { i++; mostrar(); }
      else if (a === 'mas' || a === 'menos') { zoom = Math.max(0.5, Math.min(6, zoom * (a === 'mas' ? 1.5 : 1 / 1.5))); const im = capa.querySelector('.lienzo img'); if (im) im.style.width = (zoom * 100) + '%'; }
    };
    const lienzo = capa.querySelector('.lienzo'), tr = capa.querySelector('.transc');
    if (!m.ruta) lienzo.innerHTML = `<p class="aviso">La foto no tiene ruta en el GEDCOM.</p>`;
    else carpeta.enlace(m.ruta).then(u => {
      if (lista[i] !== m) return;
      lienzo.innerHTML = IMG.test(m.form) ? `<img src="${esc(u)}" alt="${esc(m.titulo)}" style="width:${zoom * 100}%">`
        : `<p><a class="boton" href="${esc(u)}" target="_blank" rel="noopener">Abrir ${esc(m.form.toUpperCase())}</a></p>`;
    }).catch(e => { lienzo.innerHTML = `<p class="aviso">${esc(e.message)}</p>`; });
    try {
      const t = await transcripcion(m, fuenteDoc);
      if (lista[i] !== m) return;
      tr.innerHTML = t ? `<p class="peq">${esc(t.rel)}</p><div class="md">${md(t.texto)}</div>` : '<p class="peq">Sin transcripción de esta imagen.</p>';
    } catch (e) { if (lista[i] === m) tr.innerHTML = `<p class="aviso">${esc(e.message)}</p>`; }
  };
  mostrar();
}
function cerrarVisor() { $('#visor').hidden = true; $('#visor').innerHTML = ''; document.body.classList.remove('con-visor'); }
document.addEventListener('keydown', e => {
  if ($('#visor').hidden) return;
  if (e.key === 'Escape') cerrarVisor();
  if (e.key === 'ArrowLeft') $('#visor [data-a=ant]')?.click();
  if (e.key === 'ArrowRight') $('#visor [data-a=sig]')?.click();
});

async function verTexto(ruta, titulo) {
  const capa = $('#visor');
  capa.hidden = false; document.body.classList.add('con-visor');
  capa.innerHTML = `<div class="barra"><button data-a="cerrar">✕</button><span class="tit">${esc(titulo)}</span></div><div class="transc sola"><p class="cargando">Cargando…</p></div>`;
  capa.querySelector('[data-a=cerrar]').onclick = cerrarVisor;
  const caja = capa.querySelector('.transc');
  if (!hayCarpeta(caja)) return;
  try { const t = await carpeta.texto(ruta); caja.innerHTML = `<p class="peq">${esc(t.rel)}</p><div class="md">${md(t.texto)}</div>`; }
  catch (e) { caja.innerHTML = `<p class="aviso">${esc(e.message)}</p>`; }
}

// ---------- Ajustes ----------

function ajustes() {
  document.title = 'Árbol · Ajustes';
  pantalla(`<div class="caja">
    <h2>Ajustes</h2>
    <h3>Árbol</h3>
    <p><b>${esc(info.nombre)}</b><br>${(info.tam / 1e6).toFixed(2)} MB · ${esc(info.cod)} · ${arbol.personas.size.toLocaleString('es')} personas
      ${info.fecha ? ' · modificado el ' + esc(new Date(info.fecha).toLocaleString('es')) : ''}
      ${info.copia ? '<br>Es una copia guardada en este navegador. Para actualizarla, abre otra vez el archivo.' : ''}</p>
    <p><button id="otro">Abrir otro GEDCOM…</button></p>
    <h3>Personas de referencia</h3>
    <p class="peq">Salen en la barra de arriba y en el filtro de línea, y numeran a sus antepasados (Ahnentafel). Se marcan con la estrella en la ficha de cada persona.</p>
    <ul>${arbol.raices.map(r => `<li>${esc(r.letra)} · <a href="#/p/${esc(r.id.slice(1, -1))}">${esc(r.nombre)}</a> <button data-quitar="${esc(r.id)}">Quitar</button></li>`).join('')}</ul>
    <h3>Carpeta de fotos y transcripciones</h3>
    ${hayDisco ? `<p>${carpeta ? `<b>${esc(carpeta.nombre)}</b>` : carpetaPendiente ? `«${esc(carpetaPendiente.name)}» (pide permiso al usar las fotos)` : 'Ninguna'}</p>
      <p><button id="carpeta">Elegir carpeta…</button> ${carpeta || carpetaPendiente ? '<button id="sincarpeta">No usar carpeta</button>' : ''}</p>
      <p class="peq">Elige la carpeta que contiene las fotos, por ejemplo la de Dropbox. El programa las busca dentro aunque el GEDCOM tenga otra ruta delante (otra letra de disco, otro ordenador).</p>`
    : '<p class="peq">En este aparato no se pueden ver fotos: solo en el ordenador, con Chrome o Edge.</p>'}
    <hr><p class="peq">Fase 1: solo lectura. El programa no cambia ningún archivo.</p>
  </div>`);
  $('#otro').onclick = async () => { await Fuente.olvidar(); LS.set('modo', null); location.hash = '#/'; location.reload(); };
  main.querySelectorAll('[data-quitar]').forEach(b => b.onclick = () => { alternarRaiz(b.dataset.quitar); ajustes(); });
  if (hayDisco) {
    $('#carpeta').onclick = async () => { try { carpeta = await Carpeta.elegir(); carpetaPendiente = null; ajustes(); } catch (e) { if (e.name !== 'AbortError') error(e); } };
    $('#sincarpeta')?.addEventListener('click', async () => { await Carpeta.olvidar(); carpeta = carpetaPendiente = null; ajustes(); });
  }
}

// ---------- Cabecera ----------

$('#q').value = estadoBusqueda.q || '';
$('#q').addEventListener('input', lanzar);
$('#q').addEventListener('focus', () => { if (!$('#res')) location.hash = '#/buscar'; });
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#q').blur(); } });

arrancar();
