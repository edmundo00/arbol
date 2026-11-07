// Arranque, apertura del GEDCOM y de la carpeta de fotos, y navegación entre pantallas.
import { Gedcom } from './gedcom.js?v=202611071004';
import { Arbol, nombreCompleto, vida, miles, anios } from './modelo.js?v=202611071004';
import { buscar, prepararVariantes } from './buscar.js?v=202611071004';
import { Fuente, Carpeta, Carpetas, Servidor, LS, hayDisco, permiso, bdLeer, bdGuardar } from './almacen.js?v=202611071004';
import { BaseNombres, TIPOS, PAPELES_DOC } from './nombresdb.js?v=202611071004';
import { entender, personasDelArbol } from './consulta.js?v=202611071004';
import { pintarMenciones, pintarDonde, pintarLugar, pintarArbol } from './menciones.js?v=202611071004';
import { pintarFronteras, pintarIncoherencias, pintarDuplicados } from './revisar.js?v=202611071004';
import { revisarSalud, repararSalud } from './salud.js?v=202611071004';
import { pintarFaltaProbar, pintarParentesco, parentesco, pintarRepetidos, pintarTareas, lugares as listaDeLugares, ES_TAREA } from './investigar.js?v=202611071004';
import { enNotas, enMenciones, enTranscripciones, pintarNotas, pintarTranscripciones, resaltar, plano as planoTexto } from './textolibre.js?v=202611071004';
import { diferencias, lineasDistintas, paraCompartir, personasDe } from './copias.js?v=202611071004';
import { resultados, familia, detalle, citas } from './vistas.js?v=202611071004';
import { md, esc } from './md.js?v=202611071004';
import { grafico, lista, descendientes, pestanasArbol, graficoDescendientes, antepasados } from './arboles.js?v=202611071004';
import { cuadro, abanico, PAPELES } from './imprimir.js?v=202611071004';
import { mural, acortador, rotuloGedcom } from './mural.js?v=202611071004';
import { Editor, apellidosHijo, apellidosPadre, apellidosMadre } from './editar.js?v=202611071004';
import { Guardado } from './guardar.js?v=202611071004';
import { formularioPersona, formularioHecho, formularioNota, formularioFusion, TIPOS_PERSONA, TIPOS_FAMILIA, formularioCita, formularioDocumento } from './formularios.js?v=202611071004';
import { formularioPartida, PARTIDAS, PAPEL } from './partida.js?v=202611071004';
import { GRADOS, QUAY, paginas, bases, registrosDocumento, rango, numero, idNuevo, docsDeFamilia, leerDocumentos, docCitable, vidaEstimada } from './registro.js?v=202611071004';
import { hijo as nodoHijo, hijos, valor as valorNodo } from './gedcom.js?v=202611071004';
import { descargarCSV, botonExcel, CAB_PERSONA, filaPersona, informeAscendientes } from './exportar.js?v=202611071004';
import { pintarEstadisticas } from './estadisticas.js?v=202611071004';

const $ = s => document.querySelector(s);
// La versión publicada (la pone publicar.py en la dirección de este archivo): 202611041952 → «4/11 19:52»
const VERSION_APP = (() => { const m = /^\d{4}(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(new URL(import.meta.url).searchParams.get('v') || ''); return m ? `Versión ${+m[2]}/${+m[1]} ${m[3]}:${m[4]}` : ''; })();
document.getElementById('version').textContent = VERSION_APP;
const main = $('#main');
const esLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const PRUEBA = '/Genealogia/1 Árbol/Árbol de trabajo/edmundo.ged';   // solo para el servidor de pruebas
let fuente = null, carpeta = null, carpetaPendiente = [], arbol, variantes = [], info = {};
let editor = null, guardado = null, guardando = false, bytesAbiertos = null;
const estadoBusqueda = JSON.parse(sessionStorage.getItem('arbol.busqueda') || '{}');

function pantalla(html) { main.innerHTML = html; window.scrollTo(0, 0); }
// El archivo o la carpeta que se recordaba ya no está donde estaba (se ha movido, renombrado o borrado)
const seHaMovido = e => e?.name === 'NotFoundError';
const MOVIDO = 'Un archivo o una carpeta que el programa recordaba ya no está donde estaba (¿se ha movido de sitio?).';
function error(e) {
  console.error(e);
  pantalla(`<div class="caja"><h2>Algo ha fallado</h2><p class="aviso">${esc(seHaMovido(e) ? MOVIDO + ' Pulsa «Abrir otro archivo» y elige el GEDCOM donde está ahora.' : e.message || e)}</p>
    <p><button onclick="location.reload()">Volver a intentarlo</button> <button id="otro">Abrir otro archivo</button></p></div>`);
  $('#otro').onclick = async () => { await Fuente.olvidar(); LS.set('modo', null); location.hash = '#/'; location.reload(); };
}

// ---------- Arranque ----------

async function arrancar() {
  try {
    if (esLocal && LS.get('modo') === 'servidor') {
      const srv = new Servidor();
      carpeta = new Carpetas([srv]);
      return abrir(await srv.bajar(PRUEBA));
    }
    const ult = await Fuente.ultima();
    if (ult?.asa) {
      try { if (await permiso(ult.asa, false)) fuente = await Fuente.desdeAsa(ult.asa); }
      catch (e) { if (!seHaMovido(e)) throw e; await Fuente.olvidar(); return inicio(null, ult.asa.name); }
    }
    if (!fuente && ult?.copia) fuente = new Fuente(ult.copia);
    if (!fuente) return inicio(ult);
    await recuperarCarpeta();
    abrir(fuente.datos);
  } catch (e) { error(e); }
}

async function recuperarCarpeta() {
  if (!hayDisco) return;
  const listas = [], pendientes = [], guardadas = await Carpetas.guardadas(), siguen = [];
  for (const h of guardadas) {
    // Una carpeta que ya no existe (movida o renombrada) se olvida, para que se pueda elegir la nueva
    try { if (await permiso(h, false)) { for await (const _ of h.keys()) break; listas.push(h); } else pendientes.push(h); siguen.push(h); }
    catch (e) { if (!seHaMovido(e)) throw e; carpetasMovidas.push(h.name); }
  }
  if (siguen.length < guardadas.length) await Carpetas.guardar(siguen);
  carpeta = listas.length ? new Carpetas(listas.map(h => new Carpeta(h))) : null;
  carpetaPendiente = pendientes;
}
let carpetasMovidas = [];
// Añade una carpeta de fotos (o vuelve a dar permiso a las guardadas). Tiene que llamarse desde un clic.
async function anadirCarpeta(nueva) {
  const todas = await Carpetas.guardadas();
  for (const h of carpetaPendiente) await permiso(h, true);
  if (nueva) {
    const h = await Carpetas.elegir();
    let repetida = false;
    for (const x of todas) if (await x.isSameEntry(h)) repetida = true;
    if (!repetida) todas.push(h);
    await Carpetas.guardar(todas);
  }
  await recuperarCarpeta();
}

function inicio(ult, movido = null) {
  $('#cabecera').hidden = true;
  pantalla(`<div class="caja">
    <h2>Abrir un árbol</h2>
    ${movido ? `<p class="aviso">El archivo «${esc(movido)}» que abriste la última vez ha cambiado de sitio (o ya no existe). Vuelve a abrirlo.</p>` : ''}
    <p><label class="boton principal grande">Abrir GEDCOM…<input id="archivo" type="file" hidden></label></p>
    <p>O <b>arrastra el archivo <code>.ged</code></b> a esta ventana.</p>
    <p class="peq">El archivo no se sube a ningún sitio: se lee aquí, en el navegador, y se guarda una copia en este aparato para que se abra solo la próxima vez.
      Las fotos y la base de nombres son opcionales.</p>
    ${ult?.asa ? `<p><button id="reabrir">Volver a abrir «${esc(ult.asa.name)}» (pide permiso)</button></p>` : ''}
    ${hayDisco ? `<p class="peq">Para guardar cambios en el archivo: <button id="elegir">Abrir con permiso de escritura…</button></p>` : ''}
    <p class="peq">${esc(VERSION_APP)}</p>
    ${esLocal ? `<hr><p class="peq">Pruebas: <button id="servidor">Usar el servidor local</button></p>` : ''}
  </div>`);
  if (ult?.asa) $('#reabrir').onclick = async () => {
    try { if (!await permiso(ult.asa, true)) return error(new Error('Sin permiso para leer el archivo.')); fuente = await Fuente.desdeAsa(ult.asa); }
    catch (e) { if (!seHaMovido(e)) return error(e); await Fuente.olvidar(); return inicio(null, ult.asa.name); }
    intentar(async () => {});
  };
  if (hayDisco) $('#elegir').onclick = () => intentar(async () => { fuente = await Fuente.elegir(); await bdGuardar('pistaGedcom', fuente.asa); pedirCarpetaAlAbrir = true; });
  // Con el cuadro de Chrome se sabe qué archivo es, y luego la carpeta se pide ya situada en la suya
  abrirConCuadro(main.querySelector('label.grande'));
  $('#archivo').onchange = ev => ev.target.files[0] && abrirArchivo(ev.target.files[0]);
  if (esLocal) $('#servidor').onclick = () => { LS.set('modo', 'servidor'); location.reload(); };
}

// Elegir el GEDCOM con el cuadro de Chrome: así se sabe de qué archivo viene, y la carpeta se pide luego ya situada en la suya.
async function elegirGedcom() {
  const [asa] = await window.showOpenFilePicker({ id: 'arbol-gedcom', types: [{ description: 'GEDCOM', accept: { 'application/octet-stream': ['.ged', '.gedcom'] } }] });
  await bdGuardar('pistaGedcom', asa);
  return asa;
}
function abrirConCuadro(boton) {
  if (!hayDisco || !boton) return;
  boton.onclick = async ev => {
    ev.preventDefault();
    try { abrirArchivo(await (await elegirGedcom()).getFile()); }
    catch (e) { if (e.name !== 'AbortError') error(e); }
  };
}

// Abrir un GEDCOM en un paso (botón o arrastrar): se lee y se guarda una copia en el navegador; sin pedir permisos.
// Al abrir uno nuevo se empieza por sus estadísticas.
async function abrirArchivo(file) {
  try {
    pantalla(`<div class="caja"><p class="cargando">Abriendo «${esc(file.name)}»…</p></div>`);
    await Fuente.desdeFile(file);
    LS.set('modo', null);
    location.hash = '#/estadisticas';
    location.reload();
  } catch (e) { error(e); }
}
document.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); document.body.classList.add('soltar'); } });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('soltar'); });
document.addEventListener('drop', e => {
  document.body.classList.remove('soltar');
  const f = e.dataTransfer.files[0];
  if (!f) return;
  e.preventDefault();
  const asa = e.dataTransfer.items[0]?.getAsFileSystemHandle?.();   // hay que pedirlo aquí mismo, antes de cualquier espera
  if (!/\.ged(com)?$/i.test(f.name) && !confirm(`«${f.name}» no parece un GEDCOM (.ged). ¿Abrirlo igualmente?`)) return;
  Promise.resolve(asa).then(h => h && bdGuardar('pistaGedcom', h)).catch(() => {}).finally(() => abrirArchivo(f));
});

let pedirCarpetaAlAbrir = false, pistaGedcom = null;
async function intentar(f) {
  try { await f(); } catch (e) { if (e.name === 'AbortError') return; return error(e); }
  try { await recuperarCarpeta(); abrir(fuente.datos); } catch (e) { error(e); }
}

// Sin conexión: el service worker guarda los archivos del programa (no en el servidor de pruebas de este ordenador,
// donde se cambian sin número de versión nuevo)
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname))
  navigator.serviceWorker.register('sw.js').catch(() => {});

function abrir(datos) {
  pantalla(`<div class="caja"><p class="cargando">Leyendo personas y familias…</p></div>`);
  setTimeout(async () => {
    try {
      // Abierto como copia, pero con la carpeta recordada y permiso ya dado: se lee el archivo de verdad, que puede ser más nuevo.
      let deCarpeta = false;
      if (fuente?.esCopia && !pruebas()) try {
        const dir = await bdLeer('carpetaGedcom:' + datos.nombre);
        if (dir && await dir.queryPermission({ mode: 'readwrite' }) === 'granted') {
          const f = await (await dir.getFileHandle(datos.nombre)).getFile();
          datos = { ...datos, bytes: new Uint8Array(await f.arrayBuffer()), fecha: f.lastModified };
          fuente.datos = datos; deCarpeta = true;
        }
      } catch {}
      const ged = Gedcom.desdeBytes(datos.bytes);
      arbol = new Arbol(ged);
      if (!arbol.personas.size) throw new Error(`«${datos.nombre}» no parece un GEDCOM: no tiene personas.`);
      bytesAbiertos = datos.bytes;
      info = { nombre: datos.nombre, fecha: datos.fecha, tam: datos.bytes.length, cod: ged.cod, copia: fuente?.esCopia && !deCarpeta, cuando: datos.cuando };
      arbol.ponerRaices(raicesGuardadas());
      try { variantes = prepararVariantes(await (await fetch('variantes.json?v=202611071004')).json()); } catch { variantes = []; }
      cabecera();
      window.arbol = arbol;
      ir();
      // El archivo del que se abrió: el cuadro de elegir carpeta saldrá en la suya
      pistaGedcom = null;
      try { const h = fuente?.asa || await bdLeer('pistaGedcom'); if (h?.name === info.nombre) pistaGedcom = h; } catch {}
      // Se abrió con permiso de escritura: la carpeta se pregunta ya, no al primer cambio
      if (pedirCarpetaAlAbrir) { pedirCarpetaAlAbrir = false; if (!pruebas() && !await bdLeer('carpetaGedcom:' + info.nombre)) activarEdicion(); }
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
  if (h === '/texto') return verTexto2();
  if ((m = /^\/revisar(?:\/(\w+))?$/.exec(h))) return verRevisar(m[1] || 'fronteras');
  if (h === '/ajustes') return ajustes();
  if (h === '/estadisticas') return verEstadisticas();
  return verBuscar();
}

// ---------- Buscar: una sola pantalla. Las personas salen al instante del GEDCOM abierto; los documentos, de la base de nombres, debajo ----------
const entenderQ = q => q.trim() ? entender(q, arbol, () => listaDeLugares(arbol).todos) : null;
const guardarEstado = () => sessionStorage.setItem('arbol.busqueda', JSON.stringify(estadoBusqueda));
const hayQuien = e => !!(e.nombre + ' ' + e.apellidos).trim();

function verBuscar() {
  document.title = 'Árbol · Buscar';
  main.dataset.persona = '';
  const e = estadoBusqueda;
  e.nombre ||= ''; e.apellidos ||= ''; e.lugar ||= '';
  if (e.linea && !arbol.raices.some(r => r.id === e.linea)) e.linea = null;
  const opc = (lista, val) => lista.map(n => `<option${val === n ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const casilla = (id, k, txt) => `<label class="casilla"><input type="checkbox" id="${id}"${e[k] ? ' checked' : ''}> ${txt}</label>`;
  pantalla(`<div class="buscador">
    <nav class="pestanas donde"><a class="pest activa" href="#/buscar">Buscar</a><a class="pest" href="#/texto">Texto libre</a><a class="pest" href="#/revisar">Revisar el árbol</a></nav>
    <div class="filtros nombres">
      <label>Nombre<input id="n-nombre" value="${esc(e.nombre)}" placeholder="Ysabel · Joseph · Mª Josefa"></label>
      <label>Apellidos<input id="n-apellidos" value="${esc(e.apellidos)}" placeholder="Fraga · Pardo Osorio · Ferr*"></label>
      <label>Lugar<input id="n-lugar" value="${esc(e.lugar)}" placeholder="Corrubedo · Valdoviño"></label>
      <label>Desde<input id="n-desde" inputmode="numeric" value="${esc(e.desde ?? '')}" placeholder="1600"></label>
      <label>Hasta<input id="n-hasta" inputmode="numeric" value="${esc(e.hasta ?? '')}" placeholder="1800"></label>
    </div>
    <div class="filtros otros">
      <label>Tipo de documento<select id="n-tipo"><option value="">Todos</option>${opc(TIPOS.map(x => x.nom), e.tipo)}</select></label>
      <label>Archivo<select id="n-archivo"><option value="">Todos</option>${opc(baseNombres?.archivos() || (e.archivo ? [e.archivo] : []), e.archivo)}</select></label>
      <label>Su papel<select id="n-papel"><option value="">Cualquiera</option>${opc(PAPELES_DOC.map(x => x.nom), e.papel)}</select></label>
      <label>Línea<select id="n-linea"><option value="">Todo el árbol</option>${arbol.raices.map(r => `<option value="${esc(r.id)}"${e.linea === r.id ? ' selected' : ''}>Antepasados de ${esc(r.nombre)}</option>`).join('')}</select></label>
    </div>
    <p class="casillas">${casilla('n-foto', 'conFoto', 'Con foto')}${casilla('n-trans', 'transcrito', 'Transcrito')}${casilla('n-enl', 'enlazado', 'Enlazado al árbol')}
      <span class="peq">${baseNombres ? `Base de documentos del ${esc(new Date(baseNombres.fecha).toLocaleDateString('es'))}` : ''}</span></p>
    <div class="resultados"><div id="n-res"></div><aside id="res-arbol"></aside></div>
    <p class="exportar" id="n-excel"></p>
    ${hayDisco ? '<p class="botones"><button class="mas" id="n-nuevo">+ Añadir documento sin persona (foto nueva)</button></p>' : ''}
    <div class="inicio"${hayQuien(e) || e.lugar.trim() || e.linea ? ' hidden' : ''}><p>Escribe un nombre o un apellido, aquí o en el cuadro de arriba: salen a la vez las personas del árbol y los documentos. Arriba se puede escribir todo seguido: <i>maria fernandez jubia 1731-1735 defunción</i>. No importan las tildes ni la ortografía antigua (Ysabel = Isabel, Joseph = José, Bázquez = Vázquez). Un «*» al final busca por el comienzo.</p>
      <p>${arbol.raices.map(r => `<a class="tarjeta-enlace" href="#/p/${esc(r.id.slice(1, -1))}">${esc(r.nombre)}</a>`).join(' ')}</p>
      <p class="peq">«${esc(info.nombre)}» · ${arbol.personas.size.toLocaleString('es')} personas · ${arbol.familias.size.toLocaleString('es')} familias · <a href="#/estadisticas">Estadísticas</a>
        ${info.copia ? `<br>Copia guardada en este aparato, del archivo del ${esc(new Date(info.fecha).toLocaleString('es'))}` : ''}</p></div>
  </div>`);
  $('#n-nuevo')?.addEventListener('click', () => anadirDocumento());
  const caja = $('#n-res');
  $('#n-excel').append(botonExcel('documentos', caja, () => caja._excel?.() ?? { cabecera: [], filas: [] }));
  const bP = botonExcel('personas', null, () => ({ cabecera: CAB_PERSONA, filas: personasDelArbol(arbol, estadoBusqueda, variantes).lista.map(x => filaPersona(x.p)) }));
  bP.textContent = '⬇ Personas a Excel (CSV)'; $('#n-excel').append(' ', bP);
  // Los campos mandan: si se tocan, lo escrito arriba ya no es lo que se ve
  const olvidarQ = () => { $('#q').value = ''; estadoBusqueda.q = ''; };
  main.querySelectorAll('.filtros input').forEach(i => {
    i.addEventListener('input', () => { olvidarQ(); buscarTodo(); });
    i.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); buscarTodo(0); } });
  });
  main.querySelectorAll('.filtros select, .casillas input').forEach(s => s.addEventListener('change', () => buscarTodo(0)));
  buscarTodo(0);
}

function leerCampos() {
  const num = v => /^\d{3,4}$/.test(v.trim()) ? +v.trim() : null;
  Object.assign(estadoBusqueda, { nombre: $('#n-nombre').value, apellidos: $('#n-apellidos').value, lugar: $('#n-lugar').value, desde: num($('#n-desde').value), hasta: num($('#n-hasta').value),
    tipo: $('#n-tipo').value, archivo: $('#n-archivo').value, papel: $('#n-papel').value, linea: $('#n-linea').value || null,
    conFoto: $('#n-foto').checked, transcrito: $('#n-trans').checked, enlazado: $('#n-enl').checked });
}

// Personas al momento; los documentos, un poco después de dejar de escribir (o enseguida con espera = 0).
let temporizador;
function buscarTodo(espera = 450) {
  if (!$('#n-nombre')) return;
  leerCampos(); guardarEstado();
  const e = estadoBusqueda, quien = hayQuien(e);
  const hay = quien || e.lugar.trim() || e.linea;
  document.querySelector('.inicio').hidden = !!hay;
  const cajaA = $('#res-arbol'), caja = $('#n-res');
  if (hay) pintarArbol(cajaA, arbol, personasDelArbol(arbol, e, variantes)); else cajaA.innerHTML = '';
  clearTimeout(temporizador);
  if (!quien && !e.lugar.trim()) {
    caja.innerHTML = (e.tipo || e.archivo || e.papel || e.desde != null || e.hasta != null || e.conFoto || e.transcrito || e.enlazado) && !e.linea ? '<p class="nada">Escribe además un nombre, unos apellidos o un lugar.</p>' : '';
    caja._excel = () => ({ cabecera: [], filas: [] });
    return;
  }
  temporizador = setTimeout(buscarDocumentos, espera);
}

async function buscarDocumentos() {
  const caja = $('#n-res');
  if (!caja) return;
  const eraSinBase = !baseNombres;
  if (!await necesitaBase(caja, buscarDocumentos)) return;
  if (eraSinBase) return verBuscar();   // ya hay base: se rellena el desplegable de archivos
  const e = estadoBusqueda, op = { ...e, ancestros: e.linea ? arbol.ahnentafel(e.linea) : null };
  caja.insertAdjacentHTML('afterbegin', '<p class="cargando">Buscando en los documentos…</p>');
  setTimeout(() => {
    try {
      if (!hayQuien(e)) pintarLugar(caja, baseNombres.enLugar(e.lugar, op), accionesDoc);
      else pintarDonde(caja, baseNombres.donde('', op), accionesDoc, op);
    } catch (err) { caja.innerHTML = `<p class="aviso">${esc(err.message)}</p>`; }
  }, 20);
}

// Cuadro de arriba: lo escrito se reparte en los campos y se busca.
function desdeCuadro() {
  const e = estadoBusqueda, c = entenderQ($('#q').value);
  e.q = $('#q').value;
  if (c) Object.assign(e, { nombre: c.nombre, apellidos: c.apellidos, lugar: c.lugar, desde: c.desde, hasta: c.hasta, ...(c.tipo ? { tipo: c.tipo } : {}) });
  else Object.assign(e, { nombre: '', apellidos: '', lugar: '', desde: null, hasta: null });
  guardarEstado();
  if (!$('#n-nombre')) { location.hash = '#/buscar'; return; }
  $('#n-nombre').value = e.nombre; $('#n-apellidos').value = e.apellidos; $('#n-lugar').value = e.lugar;
  $('#n-desde').value = e.desde ?? ''; $('#n-hasta').value = e.hasta ?? ''; if (c?.tipo) $('#n-tipo').value = c.tipo;
  buscarTodo();
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
  main.innerHTML = `<div class="persona">${familia(arbol, id, !!editor || puedeEditar())}
    ${parentescoRaices(id)}
    <p class="acciones"><button id="parentesco" title="¿Qué parentesco tiene con otra persona?">⚯ ¿Parentesco con…?</button> <button id="raiz" title="Las personas de referencia salen arriba y numeran a sus antepasados">${raiz ? '★ Persona de referencia' : '☆ Marcar como persona de referencia'}</button>
      <label class="rotulo" title="Lo que sale debajo del nombre en los murales; vacío = su título u oficio del GEDCOM">Rótulo en murales<input id="rotulo" value="${esc(rotulosPropios()[id] || '')}" placeholder="${esc(rotuloGedcom(arbol, id) || 'p. ej. Comandante de Marina')}"></label></p>
    <section class="detalle">${detalle(arbol, id, pestana, !!editor || puedeEditar())}</section></div>`;
  main.dataset.persona = id;
  if (antes) window.scrollTo(0, y); else window.scrollTo(0, 0);
  $('#raiz').onclick = () => { alternarRaiz(id); verPersona(id, pestana); };
  $('#parentesco').onclick = () => elegirParentesco(id);
  $('#rotulo').onchange = ev => guardarRotulo(id, ev.target.value);
  main.querySelectorAll('[data-accion]').forEach(b => b.onclick = async () => { if (await entrarEdicion()) accion(b.dataset.accion, id, b.dataset.fam || null, b.dataset); });
  recordar(id);
  const { docs, sueltas } = citas(arbol, id);
  main.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => {
    const k = b.dataset.fotos;
    const lista = k === 'sueltas' ? sueltas : b.dataset.todas ? docs[k].todas : docs[k].fotos;
    galeria($('#gal' + k), lista, docs[k]?.fuente);
  });
  main.querySelectorAll('[data-md]').forEach(b => b.onclick = () => verTexto(b.dataset.md, b.textContent));
  if (pestana === 'menc') mencionesDe(id);
  if (pestana === 'ged') historialDe(id);
}

// ---------- Edición (fase 2): cada cambio se guarda al momento, con copias y comprobaciones ----------

const pruebas = () => esLocal && LS.get('modo') === 'servidor';   // servidor de pruebas: se edita una copia dentro del navegador
// Se edita en cualquier navegador con acceso al disco, aunque se haya abierto una copia: al guardar se trabaja con el archivo de la carpeta.
function puedeEditar() { return hayDisco; }

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

// Conecta con el archivo de la carpeta. Si en el disco hay otra versión de la que se ve (una copia antigua), se pasa a la del disco.
async function conectarEdicion(avisar = m => alert(m)) {
  try {
    guardado = pruebas() ? await guardadoDePrueba() : await Guardado.preparar(info.nombre, bytesAbiertos, pistaGedcom);
    await guardado.comprobarCandado();   // solo se mira: el candado se pone cuando se escribe
    if (!igualesBytes(guardado.base, bytesAbiertos)) {
      const ged = Gedcom.desdeBytes(guardado.base);
      arbol = new Arbol(ged); window.arbol = arbol;
      arbol.ponerRaices(raicesGuardadas());
      bytesAbiertos = guardado.base; listaLugares = null;
    }
    if (!pruebas()) {
      const f = await (await guardado.dir.getFileHandle(info.nombre)).getFile();
      info.fecha = f.lastModified; info.tam = f.size; info.copia = false;
      if (fuente) fuente.datos = { ...fuente.datos, bytes: guardado.base, fecha: f.lastModified };
    }
    editor = new Editor(arbol.ged, arbol);
    cabecera(); ir();
    return true;
  } catch (e) {
    guardado = null;
    if (e.name !== 'AbortError') avisar(e.message);
    return false;
  }
}

// Se llama desde un clic en cualquier botón de edición: no hay que «activar» nada. La carpeta se elige una sola vez y queda recordada
// (Chrome solo deja abrir el cuadro de elegir carpeta justo después de un clic; por eso la explicación lleva su propio botón).
async function entrarEdicion() {
  if (editor) return true;
  if (pruebas() || await bdLeer('carpetaGedcom:' + info.nombre)) return conectarEdicion();
  return new Promise(listo => activarEdicion(listo));
}

function activarEdicion(listo = () => {}) {
  if (typeof listo !== 'function') listo = () => {};   // pulsado desde el botón de la barra
  if (editor) { listo(true); return terminarEdicion(); }
  const capa = $('#dialogo');
  capa.hidden = false; document.body.classList.add('con-visor');
  capa.innerHTML = `<div class="caja dialogo"><h2>Guardar en «${esc(info.nombre)}»: solo esta vez</h2>
    ${pruebas() ? '<p><b>Modo de pruebas:</b> los cambios se guardan en una copia dentro del navegador, no en el archivo de verdad.</p>' : `
    <ul><li>Cada cambio se guarda al momento en el archivo, con <b>copia de seguridad</b> en la carpeta «copias».</li>
      <li>Mientras editas, los scripts no pueden escribirlo (candado).</li>
      <li>No lo edites a la vez con Family Historian.</li></ul>
    ${pistaGedcom ? '<p>Pulsa el botón: el cuadro sale ya en <b>la carpeta del archivo</b>; solo tienes que aceptarlo con <b>Seleccionar carpeta</b>. Se queda recordada en este ordenador.' : `<p>Pulsa el botón y elige el archivo <b>${esc(info.nombre)}</b> (en <code>1 Árbol/Árbol de trabajo</code>). Después, un clic para aceptar su carpeta, y queda recordada en este ordenador.`}
      Si el navegador pregunta por el permiso, elige <b>«Permitir en cada visita»</b>.</p>`}
    <p class="aviso" id="e-error"></p>
    <p class="botones">${!pruebas() && !pistaGedcom ? `<button id="e-archivo" class="principal">Elegir «${esc(info.nombre)}»</button>` : `<button id="e-ok" class="principal">${pruebas() ? 'Empezar' : pistaGedcom ? 'Seleccionar su carpeta' : 'Elegir la carpeta y empezar'}</button>`} <button id="e-no">Cancelar</button></p></div>`;
  const cerrar = () => { capa.hidden = true; capa.innerHTML = ''; document.body.classList.remove('con-visor'); };
  capa.querySelector('#e-no').onclick = () => { cerrar(); listo(false); };
  capa.querySelector('#e-archivo')?.addEventListener('click', async () => {
    try {
      const asa = await elegirGedcom();
      if (asa.name !== info.nombre) { capa.querySelector('#e-error').textContent = `Ese es «${asa.name}»; hay que elegir «${info.nombre}».`; return; }
      pistaGedcom = asa;
      activarEdicion(listo);   // ahora, con la carpeta ya situada
    } catch (e) { if (e.name !== 'AbortError') capa.querySelector('#e-error').textContent = e.message; }
  });
  const ok = capa.querySelector('#e-ok');
  if (ok) ok.onclick = async () => {
    if (await conectarEdicion(m => { capa.querySelector('#e-error').textContent = m; })) { cerrar(); listo(true); }
  };
}
async function terminarEdicion() {
  try { await guardado?.quitarCandado(); } catch {}
  editor = null; guardado = null;
  estadoEdicion(); ir();
}

function flotante(texto, malo = false) {
  const e = $('#flotante');
  e.textContent = texto; e.className = malo ? 'malo' : ''; e.hidden = false;
  clearTimeout(e._t); e._t = setTimeout(() => { e.hidden = true; }, malo ? 12000 : 4000);
}

// ---------- Si el GEDCOM cambia en el disco (un programa, otra sesión, otro ordenador), la aplicación se actualiza sola ----------
const igualesBytes = (a, b) => { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
let comprobando = null;   // la comprobación del disco en marcha (una promesa), si la hay
async function archivoEnDisco() {
  try {
    if (guardado) return await (await guardado.dir.getFileHandle(info.nombre)).getFile();
    if (fuente?.asa) return await fuente.asa.getFile();
  } catch {}
  return null;
}
// Devuelve true si se ha vuelto a leer el árbol. Si ya hay una comprobación en marcha, espera a esa
// y da su resultado: así un cambio nunca se guarda sobre una lectura a medias (y nunca pisa lo hecho fuera).
function actualizarSiCambio() {
  if (guardando || !arbol) return Promise.resolve(false);
  if (comprobando) return comprobando;
  comprobando = comprobarDisco().finally(() => { comprobando = null; });
  return comprobando;
}
async function comprobarDisco() {
  try {
    const f = await archivoEnDisco();
    if (guardando || !f || (f.lastModified === info.fecha && f.size === info.tam)) return false;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (guardando) return false;
    info.fecha = f.lastModified; info.tam = f.size;
    if (igualesBytes(bytes, bytesAbiertos)) return false;
    const ged = Gedcom.desdeBytes(bytes);
    const nuevo = new Arbol(ged);
    if (!nuevo.personas.size) return false;
    if (guardado) { const d = diferencias(ged, arbol.ged); guardado.apuntar(`Cambio hecho fuera de la aplicación: ${d.anadidas.length} añadidos, ${d.cambiadas.length} cambiados, ${d.quitadas.length} quitados`, [...d.anadidas, ...d.cambiadas, ...d.quitadas].slice(0, 200)); }
    arbol = nuevo; window.arbol = arbol;
    arbol.ponerRaices(raicesGuardadas());
    bytesAbiertos = bytes; listaLugares = null;
    if (fuente) fuente.datos = { ...fuente.datos, bytes, fecha: f.lastModified };
    if (editor) { editor = new Editor(ged, arbol); guardado.base = bytes; }
    flotante('Se ha actualizado con los cambios hechos fuera de la aplicación (otra sesión, un script u otro ordenador).');
    estadoEdicion(); ir();
    return true;
  } catch (e) { console.warn('No se pudo comprobar el archivo:', e); return false; }
}
setInterval(() => { if (document.visibilityState === 'visible' && $('#dialogo').hidden) actualizarSiCambio(); }, 20000);
window.addEventListener('focus', () => { if ($('#dialogo').hidden) actualizarSiCambio(); });

// Un programa suele tener el candado un segundo: se le espera un poco antes de dar el cambio por perdido.
async function esperandoCandado(f) {
  for (let i = 0; ; i++) {
    try { return await f(); }
    catch (e) {
      if (!e.enUso || i >= 10) throw e;
      flotante('Otro programa está escribiendo el árbol. Espero a que termine…');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function guardarAhora(desc = '', xrefs = []) {
  guardando = true;
  try {
    const r = await esperandoCandado(() => guardado.guardar(arbol.ged.bytes(), arbol.personas.size));
    guardado.apuntar(desc || 'Cambio', xrefs);
    bytesAbiertos = guardado.base;   // lo que hay ahora en el disco
    try { const f = await archivoEnDisco(); if (f) { info.fecha = f.lastModified; info.tam = f.size; } } catch {}
    if (fuente) { fuente.datos.bytes = guardado.base; info.tam = guardado.base.length; }
    // Si se abrió como copia, la copia del navegador se queda al día
    if (fuente?.esCopia && !pruebas()) bdGuardar('copia', { ...fuente.datos, fecha: info.fecha, cuando: Date.now() }).catch(() => {});
    return r;
  }
  finally { guardando = false; }
}

// Los cambios se guardan de uno en uno: dos escrituras a la vez podrían pisarse o deshacer la que no toca.
let cola = Promise.resolve();
function enCola(f) {
  const p = cola.then(f, f);
  cola = p.catch(() => {});
  return p;
}

// Si no se ha podido guardar y hay un texto tecleado, se enseña para copiarlo: lo escrito no se pierde.
function rescatar(motivo, texto) {
  const capa = $('#dialogo');
  capa.hidden = false; document.body.classList.add('con-visor');
  capa.innerHTML = `<div class="caja dialogo"><h2>No se ha guardado</h2><p>${esc(motivo)}</p>
    <p>Esto es lo que habías escrito. Cópialo antes de cerrar:</p><textarea rows="10" style="width:100%">${esc(texto)}</textarea>
    <p class="botones"><button class="boton" id="res-ok">Cerrar</button></p></div>`;
  $('#res-ok').onclick = () => { capa.hidden = true; capa.innerHTML = ''; document.body.classList.remove('con-visor'); };
}

// Hace un cambio y lo guarda. Si algo falla, el cambio se deshace en memoria y el archivo no se toca.
// repetible: el cambio solo usa códigos y datos del formulario, así que si el árbol cambia fuera se aplica sobre la versión nueva y no hay que volver a teclearlo.
// rescate: el texto tecleado, para enseñarlo si al final no se puede guardar.
function operar(desc, fn, { repetible = false, rescate = '' } = {}) { return enCola(() => operarYa(desc, fn, repetible, rescate)); }
async function operarYa(desc, fn, repetible, rescate, intento = 0) {
  const fallo = motivo => rescate ? rescatar(motivo, rescate) : alert(motivo);
  if (await actualizarSiCambio() && !repetible) { alert('El árbol acababa de cambiar fuera de la aplicación y se ha actualizado. Repite el cambio sobre la versión nueva.'); return; }
  editor.empezar(desc);
  try { fn(); } catch (e) { editor.cancelar(); fallo(e.message); return; }
  const txHecho = editor.terminar();
  try {
    const r = await guardarAhora(desc, [...txHecho.antes.keys()]);
    flotante('Guardado: ' + desc + (r.copiaSesion ? ` · copia en ${r.copiaSesion}` : ''));
  } catch (e) {
    editor.deshacer();
    // Cambió justo entre la comprobación y la escritura: se relee y se aplica una vez más sobre la versión nueva
    if (e.cambiadoFuera && repetible && !intento) { await actualizarSiCambio(); return operarYa(desc, fn, repetible, rescate, 1); }
    fallo('No se ha guardado nada.\n\n' + e.message);
    if (e.cambiadoFuera) await terminarEdicion();
  }
  estadoEdicion(); ir();
}

function deshacer() { return enCola(deshacerYa); }
async function deshacerYa() {
  if (await actualizarSiCambio()) { alert('El árbol acababa de cambiar fuera de la aplicación y se ha actualizado. Ya no hay nada que deshacer aquí: si hace falta, corrígelo a mano.'); return; }
  const tx = editor?.deshacer();
  if (!tx) return;
  try { if (tx.antes.size || tx.cabecera != null) await guardarAhora('Deshacer: ' + tx.desc, [...tx.antes.keys()]); flotante('Deshecho: ' + tx.desc); }
  catch (e) { alert('No se ha podido guardar el deshacer. Recarga el árbol antes de seguir.\n\n' + e.message); await terminarEdicion(); }
  estadoEdicion(); ir();
}

// ---------- Documentos y citas: están en el GEDCOM ----------
// Documentos: fuentes con «1 REFN reg:<id>». Se leen cada vez, porque el árbol puede haber cambiado.
const docsDelArbol = () => leerDocumentos(arbol.ged);
function documentosCitables() {
  return [...docsDelArbol().values()].map(docCitable).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
}
const archivoObje = r => valorNodo(r.arbol, 'FILE') || valorNodo(r.arbol, '_FILE');

// Lo que hay que escribir para citar un documento: su fuente y las fotos que se enlazan a la persona.
function prepararCita(docId, imagenes) {
  const ged = arbol.ged, sr = editor.fuenteDe(docId);
  if (!sr) return null;
  const fotos = hijos(ged.porXref.get(sr).arbol, 'OBJE').map(n => n.valor).filter(v => /^@M[0-9A-FX]+@$/.test(v))
    .map(m => ({ m, r: ged.porXref.get(m) })).filter(x => x.r && x.r.raw.includes('reg:' + docId)).map(x => ({ m: x.m, f: archivoObje(x.r) }));
  const sel = rango(imagenes);
  const elegidas = sel.size ? fotos.filter(x => sel.has(numero(x.f))) : fotos;
  return { sr, objs: (sel.size || fotos.length <= 12 ? elegidas : fotos.slice(0, 1)).map(x => x.m) };
}
function escribirCita(id, prep, docId, d) {
  if (!prep) throw new Error(`El documento «${docId}» no está en el árbol.`);
  return editor.citaRegistro(id, { sr: prep.sr, doc: docId, papel: d.papel, que: d.que, pagina: paginas(d.imagenes), quay: QUAY[d.grado], grado: d.grado, objs: prep.objs });
}

async function citar(id, doc, d) {
  let hecha = true;
  await operar(`Citar «${doc.titulo}» en ${nombreCompleto(arbol.p(id))}`, () => { hecha = escribirCita(id, prepararCita(doc.id, d.imagenes), doc.id, d); }, { repetible: true });
  if (!hecha) flotante('Esa cita ya estaba.');
}

// «✓ Es esta persona» en una mención de la base de nombres
async function confirmarMencion(id, m) {
  if (!editor) return;
  const deRegistro = m.origen === 'registro' && m.reg_id;
  const ctx = (m.contexto || '').replace(/\s+/g, ' ').trim();
  const d = await formularioCita({ titulo: 'Es ' + nombreCompleto(arbol.p(id)), grados: GRADOS, doc: { id: deRegistro ? m.reg_id : null, titulo: (m.titulo || '').trim() || m.ruta }, mostrarDoc,
    datos: { papel: m.papel && m.papel !== 'texto' ? m.papel : '', que: ctx.length > 200 ? ctx.slice(0, 200) + '…' : ctx, grado: 'B' } });
  if (!d) return;
  // Si el documento aún no está en el árbol, se da de alta con su foto y su transcripción
  let docId = deRegistro ? m.reg_id : null, nuevos = [];
  if (!docId) {
    const IMG = /\.(jpe?g|png|tiff?|gif|webp|pdf)$/i, TXT = /\.(md|txt)$/i;
    const trans = [m.transcripcion, m.ruta].find(x => x && TXT.test(x) && !x.startsWith('ORIGINAL/')) || '';
    const imagen = m.ruta_original && IMG.test(m.ruta_original) ? m.ruta_original : '';
    docId = idNuevo(trans || imagen || m.titulo || m.nombre, new Set(docsDelArbol().keys()));
    const r = await registrosDocumento({ id: docId, titulo: (m.titulo || '').trim() || m.nombre, fecha: String(m.dfecha || m.anio || ''), tipo: m.origen || '', imagenes: imagen, transcripcion: trans,
      estado: trans ? 'transcrito' : 'sin transcribir', notas: 'Alta desde la aplicación del árbol (base de nombres)' }, bases(arbol.ged));
    nuevos = r.textos;
  }
  await operar(`Confirmar mención en «${(m.titulo || '').trim()}» de ${nombreCompleto(arbol.p(id))}`, () => {
    for (const t of nuevos) editor.crearTexto(t);
    escribirCita(id, prepararCita(docId, d.imagenes), docId, d);
  }, { repetible: true });
}

// ---------- Añadir un documento a partir de sus fotos: sin programas ni pasos intermedios ----------
// Dónde está un archivo dentro de la carpeta de documentos: ['2 Documentos', …, 'x.jpg'], o null si no se puede saber.
async function rutaDe(fh) {
  for (const c of carpeta?.lista || []) {
    if (!c.asa) continue;
    let p = null;
    try { p = await c.asa.resolve(fh); } catch {}
    if (!p) continue;
    const i = p.findIndex(x => x.toLowerCase() === '2 documentos');
    return { asa: c.asa, previas: i >= 0 ? p.slice(0, i) : p, ruta: i >= 0 ? p.slice(i) : null };
  }
  return null;
}
// Pide un clic más si el navegador exige uno para abrir un cuadro (tras pedir un permiso, por ejemplo).
async function conClic(texto, fn) {
  try { return await fn(); }
  catch (e) {
    if (e.name !== 'SecurityError' && e.name !== 'NotAllowedError') throw e;
    return new Promise((ok, mal) => {
      const capa = $('#dialogo'); capa.hidden = false; document.body.classList.add('con-visor');
      capa.innerHTML = `<div class="caja dialogo"><p>${esc(texto)}</p><p class="botones"><button id="k-ok" class="principal">${esc(texto)}</button> <button id="k-no">Cancelar</button></p></div>`;
      const cerrar = () => { capa.hidden = true; capa.innerHTML = ''; document.body.classList.remove('con-visor'); };
      capa.querySelector('#k-no').onclick = () => { cerrar(); mal(new DOMException('Cancelado', 'AbortError')); };
      capa.querySelector('#k-ok').onclick = async () => { cerrar(); try { ok(await fn()); } catch (e2) { mal(e2); } };
    });
  }
}
async function anadirDocumento(id = null) {
  if (!hayDisco) return alert('Añadir documentos se hace en Chrome o Edge de ordenador.');
  try {
    if (!editor && !await entrarEdicion()) return;
    const asas = await conClic('Elegir la foto', () => window.showOpenFilePicker({ multiple: true, id: 'arbol-docs', ...(carpeta?.lista?.[0]?.asa ? { startIn: carpeta.lista[0].asa } : {}),
      types: [{ description: 'Fotos del documento', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.gif', '.bmp', '.webp'], 'application/pdf': ['.pdf'] } }] }));
    let info0 = await rutaDe(asas[0]);
    if (!info0) {   // aún no se sabe dónde está la carpeta Genealogia: se pregunta una vez, situado ya en la foto
      const h = await conClic('Elegir la carpeta Genealogia', () => window.showDirectoryPicker({ id: 'arbol-fotos', mode: 'read', startIn: asas[0] }));
      await Carpetas.guardar([...await Carpetas.guardadas(), h]);
      carpeta = new Carpetas([...(carpeta?.lista || []), new Carpeta(h)]);
      info0 = await rutaDe(asas[0]);
    }
    const fuera = 'La foto tiene que estar dentro de la carpeta «2 Documentos» de Genealogia. Muévela allí, a una carpeta para ese documento, y vuelve a pulsar.';
    if (!info0?.ruta) return alert(fuera);
    const rutas = [];
    for (const a of asas) { const r = await rutaDe(a); if (!r?.ruta) return alert(fuera); rutas.push(r.ruta.join('/')); }
    // ¿Alguna ya está en un documento?
    const ged = arbol.ged, ya = new Map();
    for (const r of ged.registros) {
      if (r.tipo !== 'OBJE') continue;
      const f = (valorNodo(r.arbol, 'FILE') || valorNodo(r.arbol, '_FILE') || '').replace(/\\/g, '/').replace(/^.*?(?=2 Documentos\/)/i, '').toLowerCase(), m = /\n1 REFN reg:([^\r\n]*)/.exec(r.raw);
      if (f && m) ya.set(f, m[1].trim());
    }
    const docsYa = [...new Set(rutas.map(r => ya.get(r.toLowerCase())).filter(Boolean))];
    if (docsYa.length) {
      const doc = docsDelArbol().get(docsYa[0]);
      if (!id) return alert(`Esa foto ya está en el documento «${doc?.titulo || docsYa[0]}».`);
      const d = await formularioCita({ titulo: 'Esa foto ya está en un documento. Citarlo en ' + nombreCompleto(arbol.p(id)), grados: GRADOS, doc: { id: docsYa[0], titulo: doc?.titulo || docsYa[0] }, mostrarDoc, datos: { grado: 'A' } });
      if (d) await citar(id, d.doc, d);
      return;
    }
    // Su transcripción, si está al lado con el mismo nombre
    const trans = [];
    for (const rel of rutas) {
      const p = rel.split('/'), base = p.pop().replace(/\.[^.]+$/, '');
      let dir = info0.asa;
      try { for (const x of [...info0.previas, ...p]) dir = await dir.getDirectoryHandle(x); } catch { continue; }
      for (const n of [base + '.md', base + ' (Claude).md']) {
        try { await dir.getFileHandle(n); trans.push([...p, n].join('/')); break; } catch {}
      }
    }
    // Lo que se puede deducir del nombre y la carpeta; se puede corregir en el formulario
    const nombre = rutas[0].split('/').pop().replace(/\.[^.]+$/, '').replace(/[_ ]\d{1,3}$/, '');
    const anio = (/(?:^|[_ -])(1[0-9]{3}|20[0-2][0-9])(?:[_ -]|$)/.exec(nombre) || [])[1] || '';
    const pistas = { bautis: 'bautismo', nacimiento: 'bautismo', matrimonio: 'matrimonio', boda: 'matrimonio', defunci: 'defunción', entierro: 'defunción', testamento: 'testamento', parti: 'partición', escritura: 'escritura', pleito: 'pleito', hidalgu: 'hidalguía', padron: 'padrón', catastro: 'catastro' };
    const tipo = Object.entries(pistas).find(([k]) => planoTexto(nombre).includes(k))?.[1] || 'otro';
    const r = await formularioDocumento({ fotos: rutas, transcripciones: trans, persona: id ? nombreCompleto(arbol.p(id)) : null, grados: GRADOS,
      datos: { titulo: nombre.replace(/_/g, ' '), fecha: anio, tipo, archivo: rutas[0].split('/')[1] || '' } });
    if (!r) return;
    const docId = idNuevo(nombre, new Set(docsDelArbol().keys()));
    const nuevos = await registrosDocumento({ id: docId, titulo: r.titulo, fecha: r.fecha, tipo: r.tipo, archivo: r.archivo, imagenes: rutas.join('|'), transcripcion: trans.join('|'),
      estado: trans.length ? 'transcrito' : 'sin transcribir', notas: 'Añadido desde la aplicación del árbol' }, bases(ged));
    await operar(`Añadir documento «${r.titulo}»`, () => {
      for (const t of nuevos.textos) editor.crearTexto(t);
      if (id) escribirCita(id, prepararCita(docId, ''), docId, r);
    }, { repetible: true });
  } catch (e) { if (e.name !== 'AbortError') alert('No se ha añadido nada.\n\n' + e.message); }
}

// ---------- Alta desde una partida ----------
// Fotos de un documento del registro (de su fuente en el GEDCOM o, si aún no está, de su fila en el registro)
function fotosDoc(docId) {
  const ged = arbol.ged, sr = docsDelArbol().get(docId)?.sour;
  if (!sr) return [];
  return hijos(ged.porXref.get(sr).arbol, 'OBJE').map(n => ged.porXref.get(n.valor)).filter(r => r && r.raw.includes('reg:' + docId)).map(archivoObje);
}
// El documento a la izquierda: tiras de fotos, la foto grande y su transcripción
async function mostrarDoc(docId, caja) {
  if (!carpeta) { hayCarpeta(caja); return; }
  caja.innerHTML = '<p class="cargando">Abriendo el documento…</p>';
  const fotos = fotosDoc(docId), d = docsDelArbol().get(docId);
  caja.innerHTML = `<div class="tira">${fotos.slice(0, 80).map((f, i) => `<button class="mas" data-f="${i}">${i + 1}</button>`).join('')}</div><div class="foto-doc"></div><div class="md trans-doc"></div>`;
  const ver = async i => {
    const f = fotos[i];
    caja.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('activo', +b.dataset.f === i));
    try { caja.querySelector('.foto-doc').innerHTML = `<img src="${esc(await carpeta.enlace(f))}" alt="">`; } catch (e) { caja.querySelector('.foto-doc').innerHTML = `<p class="aviso">${esc(e.message)}</p>`; }
    let t = null;
    try { t = await carpeta.transcripcion(f); } catch {}
    if (!t && d?.transcripcion && /\.md$/.test(d.transcripcion) && !/[*|]/.test(d.transcripcion)) try { t = await carpeta.texto(d.transcripcion); } catch {}
    caja.querySelector('.trans-doc').innerHTML = t ? md(t.texto) : '<p class="peq">Sin transcripción de esta foto.</p>';
  };
  caja.querySelectorAll('[data-f]').forEach(b => b.onclick = () => ver(+b.dataset.f));
  if (fotos.length) ver(0);
  else if (d?.transcripcion && /\.md$/.test(d.transcripcion)) try { caja.querySelector('.trans-doc').innerHTML = md((await carpeta.texto(d.transcripcion)).texto); } catch {}
  else caja.querySelector('.trans-doc').innerHTML = '<p class="peq">Este documento no tiene fotos ni transcripción en las carpetas.</p>';
}

// Aplica la partida dentro de una operación del editor. Devuelve { rol: xref }.
function aplicarPartida(r) {
  const ids = {};
  for (const [rol, x] of Object.entries(r.personas)) ids[rol] = x.xref || editor.nuevaPersona({ ...x.nueva, nac: { fecha: '', lugar: '' }, def: { fecha: '', lugar: '' } });
  editor.alDia();
  const nodoDe = (xref, tags) => editor.ged.porXref.get(xref).arbol.hijos.find(n => tags.includes(n.tag)) || null;
  const datosDe = n => ({ fecha: n ? valorNodo(n, 'DATE') : '', lugar: n ? valorNodo(n, 'PLAC') : '', nota: n ? (n.hijos.find(x => x.tag === 'NOTE' && !/^@/.test(x.valor)) ? arbol.notaTexto(n.hijos.find(x => x.tag === 'NOTE' && !/^@/.test(x.valor))) : '') : '' });
  // Pone el hecho (o completa el que ya hay) sin borrar lo que ya tenía
  const hecho = (xref, tags, tag, extra) => {
    const n = nodoDe(xref, tags), d0 = datosDe(n);
    const nota = [d0.nota, extra].filter(Boolean).join('\n') || undefined;
    editor.hecho(xref, n, { tag: n ? n.tag : tag, fecha: d0.fecha || r.fecha, lugar: d0.lugar || r.lugar, nota, tipo: n ? valorNodo(n, 'TYPE') : '' });
  };
  if (r.tipo === 'bautismo') {
    const b = ids.bautizado;
    if (ids.padre || ids.madre) editor.asegurarPadres(b, ids.padre, ids.madre);
    if (ids.padre && (ids.abuelo_p || ids.abuela_p)) editor.asegurarPadres(ids.padre, ids.abuelo_p, ids.abuela_p);
    if (ids.madre && (ids.abuelo_m || ids.abuela_m)) editor.asegurarPadres(ids.madre, ids.abuelo_m, ids.abuela_m);
    hecho(b, ['CHR', 'BAPM'], 'CHR', r.texto ? 'Padrinos: ' + r.texto : '');
    if (r.nac && !valorNodo(nodoDe(b, ['BIRT']) || { hijos: [] }, 'DATE')) editor.evento(b, 'BIRT', r.nac, valorNodo(nodoDe(b, ['BIRT']) || { hijos: [] }, 'PLAC'));
  } else if (r.tipo === 'matrimonio') {
    let fam = null;
    if (ids.novio && ids.novia) fam = editor.asegurarPareja(ids.novio, ids.novia);
    if (ids.novio && (ids.padre_novio || ids.madre_novio)) editor.asegurarPadres(ids.novio, ids.padre_novio, ids.madre_novio);
    if (ids.novia && (ids.padre_novia || ids.madre_novia)) editor.asegurarPadres(ids.novia, ids.padre_novia, ids.madre_novia);
    if (fam) hecho(fam, ['MARR'], 'MARR', r.texto ? 'Testigos: ' + r.texto : '');
  } else {
    const d = ids.difunto;
    hecho(d, ['DEAT', 'BURI'], 'DEAT', r.texto);
    const y = anios(r.fecha)[0];
    if (r.edad >= 0 && y && !nodoDe(d, ['BIRT', 'CHR', 'BAPM'])) editor.evento(d, 'BIRT', `ABT ${y - r.edad}`, '');
    if (ids.conyuge) editor.asegurarPareja(d, ids.conyuge);
    if (ids.padre || ids.madre) editor.asegurarPadres(d, ids.padre, ids.madre);
  }
  return ids;
}

async function altaPartida(id) {
  try { return await altaPartidaDentro(id); }
  catch (e) { alert('No se ha guardado nada.\n\n' + e.message); }
  finally { await guardado?.quitarCandado().catch(() => {}); }
}
async function altaPartidaDentro(id) {
  if (!editor) return;
  const docs = documentosCitables();
  const r = await formularioPartida({ arbol, variantes, docs, lugares: lugares(), persona: id, mostrarDoc });
  if (!r) return;
  return enCola(() => guardarPartida(r));
}
// Solo usa códigos y datos del formulario: si el árbol ha cambiado fuera, se aplica sobre la versión nueva sin volver a teclearla.
async function guardarPartida(r, intento = 0) {
  await actualizarSiCambio();
  await esperandoCandado(() => guardado.ponerCandado());
  const principal = r.personas[{ bautismo: 'bautizado', matrimonio: 'novio', defuncion: 'difunto' }[r.tipo]] || r.personas.novia;
  const nombreP = principal.xref ? nombreCompleto(arbol.p(principal.xref)) : `${principal.nueva.nombre} ${principal.nueva.apellidos}`.trim();
  const desc = `Alta de ${PARTIDAS[r.tipo].nombre.toLowerCase()} de ${nombreP}${r.fecha ? ' (' + r.fecha + ')' : ''}`;
  guardando = true;
  editor.empezar(desc);
  let ids;
  try {
    ids = aplicarPartida(r);
    if (r.doc) {
      const que = `${PARTIDAS[r.tipo].nombre} de ${nombreP}${r.fecha ? ', ' + r.fecha : ''}${r.lugar ? ', ' + r.lugar : ''}`;
      const prep = prepararCita(r.doc.id, r.imagenes);
      for (const [rol, x] of Object.entries(ids)) escribirCita(x, prep, r.doc.id, { papel: PAPEL[rol], que, imagenes: r.imagenes, grado: 'A' });
    }
  } catch (e) { editor.cancelar(); guardando = false; alert('No se ha guardado nada.\n\n' + e.message); return; }
  const tx = editor.terminar();
  guardando = false;
  try { await guardarAhora(desc, [...tx.antes.keys()]); flotante(`Guardado: ${desc}. ${Object.keys(ids).length} personas${r.doc ? ', con su cita' : ''}.`); }
  catch (e) {
    editor.deshacer();
    if (e.cambiadoFuera && !intento) { await actualizarSiCambio(); return guardarPartida(r, 1); }
    alert('No se ha guardado nada.\n\n' + e.message); if (e.cambiadoFuera) await terminarEdicion(); return;
  }
  estadoEdicion();
  const pr = Object.entries(ids).find(([rol]) => ['bautizado', 'novio', 'difunto', 'novia'].includes(rol))?.[1];
  if (pr && location.hash !== '#/p/' + pr.slice(1, -1)) location.hash = '#/p/' + pr.slice(1, -1); else ir();
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

async function accion(tipo, id, famId, ds = {}) {
  if (!editor) return;
  if (await actualizarSiCambio()) return;   // se ha actualizado: el usuario lo ve y vuelve a pulsar
  const p = arbol.p(id), nom = nombreCompleto(p);
  const base = { arbol, variantes, lugares: lugares(), excluir: new Set([id]) };
  if (tipo === 'editar') {
    const r = await formularioPersona({ ...base, titulo: 'Editar a ' + nom, datos: datosDe(id),
      contexto: { padres: arbol.padres(id).flatMap(f => [f.marido, f.mujer]).filter(Boolean).map(x => arbol.p(x)), hijos: p.fams.flatMap(f => arbol.f(f)?.hijos || []).map(x => arbol.p(x)) } });
    if (r?.nueva) await operar('Editar a ' + nom, () => editor.datosPersona(id, r.nueva), { repetible: true });
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
    await operar('Añadir hijo de ' + quien, () => { const h = r.nueva ? editor.nuevaPersona(r.nueva) : r.existente; editor.hijo(id, famId, h); }, { repetible: true });
    return;
  }
  if (tipo === 'padre' || tipo === 'madre') {
    const ap = tipo === 'padre' ? apellidosPadre(p) : apellidosMadre(p);
    const r = await formularioPersona({ ...base, titulo: `Añadir ${tipo} de ${nom}`, existente: true, propuesta: ap,
      datos: { apellidos: ap, sexo: tipo === 'padre' ? 'M' : 'F' }, contexto: { hijos: [p] } });
    if (!r) return;
    await operar(`Añadir ${tipo} de ${nom}`, () => { const x = r.nueva ? editor.nuevaPersona(r.nueva) : r.existente; editor.progenitor(id, tipo === 'padre' ? 'HUSB' : 'WIFE', x); }, { repetible: true });
    return;
  }
  // ---------- Quitar enlaces y borrar ----------
  const nomDe = x => nombreCompleto(arbol.p(x));
  if (tipo === 'quitar-padres') {
    const f = arbol.f(famId), padres = [f.marido, f.mujer].filter(Boolean).map(nomDe).join(' y ');
    if (!confirm(`¿Quitar a ${nom} como hijo de ${padres}?\n\nLas personas no se borran: solo se deshace el enlace. Se puede deshacer.`)) return;
    return operar(`Quitar a ${nom} como hijo de ${padres}`, () => editor.quitarHijo(famId, id));
  }
  if (tipo === 'quitar-conyuge') {
    if (!confirm(`¿Quitar el matrimonio de ${nom} con ${nomDe(ds.otro)}?\n\nLos hijos se quedan con ${nom}. Las personas no se borran. Se puede deshacer.`)) return;
    return operar(`Quitar el matrimonio de ${nom} con ${nomDe(ds.otro)}`, () => editor.quitarConyuge(famId, ds.otro));
  }
  if (tipo === 'quitar-hijo') {
    if (!confirm(`¿Quitar a ${nomDe(ds.hijo)} como hijo de esta pareja?\n\nNo se borra a nadie. Se puede deshacer.`)) return;
    return operar(`Quitar a ${nomDe(ds.hijo)} como hijo`, () => editor.quitarHijo(famId, ds.hijo));
  }
  if (tipo === 'borrar') {
    const familias = p.famc.length + p.fams.length;
    if (!confirm(`¿Borrar a ${nom} (${id})?\n\nSe quitan también sus ${familias} enlaces con padres y cónyuges. Hay copia de seguridad y se puede deshacer.`)) return;
    const destino = arbol.padres(id).flatMap(f => [f.marido, f.mujer]).find(Boolean) || p.fams.map(f => arbol.f(f)).flatMap(f => [f.marido, f.mujer, ...f.hijos]).find(x => x && x !== id);
    await operar(`Borrar a ${nom}`, () => editor.borrarPersona(id));
    if (!arbol.p(id)) location.hash = destino ? '#/p/' + destino.slice(1, -1) : '#/';
    return;
  }
  if (tipo === 'fusionar') {
    const r = await formularioFusion(arbol, id, variantes, ds.otro || null);
    if (!r) return;
    let res;
    await operar(`Fusionar a ${nom} con ${nomDe(r.otro)} (${r.otro})`, () => { res = editor.fusionar(id, r.otro, r.usar); });
    if (res?.dosFamiliasDePadres) alert('Ojo: ahora tiene dos familias de padres (las de las dos fichas). Revisa cuál es la buena y quita la otra con «✕ No son sus padres».');
    return;
  }
  // ---------- Hechos ----------
  if (tipo === 'hecho' || tipo === 'boda') {
    const deFamilia = !!famId;
    const dueño = deFamilia ? famId : id;
    let ev = null;
    const arbol0 = arbol;
    if (tipo === 'boda') ev = arbol.f(famId).eventos.find(e => e.tag === 'MARR') || null;
    else if (ds.fev != null && ds.fev !== '') ev = arbol.f(famId).eventos[+ds.fev];
    else if (ds.ev != null && ds.ev !== '') ev = p.eventos[+ds.ev];
    const notaDe = e => { const n = e?.nodo.hijos.find(x => x.tag === 'NOTE' && !/^@[^@]+@$/.test(x.valor)); return n ? arbol.notaTexto(n) : ''; };
    const quien = deFamilia ? [arbol.f(famId).marido, arbol.f(famId).mujer].filter(Boolean).map(nomDe).join(' y ') : nom;
    const d = await formularioHecho({ titulo: (ev ? 'Cambiar ' + ev.etiqueta.toLowerCase() : tipo === 'boda' ? 'Boda' : 'Añadir un hecho') + ' · ' + quien,
      tipos: deFamilia ? TIPOS_FAMILIA : TIPOS_PERSONA, lugares: lugares(),
      datos: ev ? { tag: ev.tag, tipo: ev.tipo, fecha: ev.fecha, lugar: ev.lugar, valor: ev.valor, nota: notaDe(ev) } : { tag: tipo === 'boda' ? 'MARR' : 'CHR' } });
    if (!d) return;
    return operar(`${ev ? 'Cambiar' : 'Añadir'} ${(TIPOS_PERSONA.concat(TIPOS_FAMILIA).find(([t]) => t === d.tag)?.[1] || d.tag).toLowerCase()} de ${quien}`, () => {
      // Si el árbol se ha releído mientras tanto, se busca el mismo hecho en la versión nueva
      let nodo = ev?.nodo || null;
      if (ev && arbol !== arbol0) {
        const igual = (deFamilia ? arbol.f(famId).eventos : arbol.p(id).eventos).find(e => e.tag === ev.tag && e.fecha === ev.fecha && e.lugar === ev.lugar && e.valor === ev.valor);
        if (!igual) throw new Error('Ese hecho ha cambiado fuera de la aplicación mientras lo editabas. Míralo y repite el cambio.');
        nodo = igual.nodo;
      }
      editor.hecho(dueño, nodo, d);
    }, { repetible: true });
  }
  if (tipo === 'borrar-hecho') {
    const ev = famId ? arbol.f(famId).eventos[+ds.fev] : p.eventos[+ds.ev];
    if (!ev || !confirm(`¿Quitar «${ev.etiqueta}${ev.fecha ? ' ' + ev.fecha : ''}» de ${nom}? Se puede deshacer.`)) return;
    return operar(`Quitar ${ev.etiqueta.toLowerCase()} de ${nom}`, () => editor.borrarHecho(famId || id, ev.nodo));
  }
  // ---------- Notas ----------
  if (tipo === 'partida') return altaPartida(id);
  if (tipo === 'tarea') {
    const t = await formularioNota('Tarea pendiente de ' + nom, 'PENDIENTE: ');
    if (t == null) return;
    const texto = /^\s*(PENDIENTE|TAREA)\s*:/i.test(t) ? t : 'PENDIENTE: ' + t;
    return operar('Añadir tarea a ' + nom, () => editor.nota(id, null, texto), { repetible: true, rescate: texto });
  }
  if (tipo === 'tarea-hecha') {
    const n = hijos(arbol.registro(id).arbol, 'NOTE')[+ds.nota]; if (!n) return;
    const t = arbol.notaTexto(n).replace(ES_TAREA, `HECHO (${new Date().toLocaleDateString('es')}):`);
    return operar('Tarea hecha de ' + nom, () => editor.nota(id, n, t));
  }
  if (tipo === 'nota' || tipo === 'borrar-nota') {
    const nodos = hijos(arbol.registro(id).arbol, 'NOTE'), n = ds.nota != null && ds.nota !== '' ? nodos[+ds.nota] : null;
    if (tipo === 'borrar-nota') {
      if (!n || !confirm(`¿Quitar esta nota de ${nom}? Se puede deshacer.`)) return;
      return operar(`Quitar una nota de ${nom}`, () => editor.borrarNota(id, n));
    }
    const arbol0 = arbol, original = n ? arbol.notaTexto(n) : '';
    const t = await formularioNota((n ? 'Cambiar nota de ' : 'Nota nueva de ') + nom, original);
    if (t == null) return;
    let comoNueva = false;
    await operar(`${n ? 'Cambiar' : 'Añadir'} nota de ${nom}`, () => {
      // Si el árbol se ha releído mientras tanto, se busca la misma nota; si ya no está igual, lo escrito se guarda como nota nueva
      const nodo = !n || arbol === arbol0 ? n : hijos(arbol.registro(id).arbol, 'NOTE').find(x => arbol.notaTexto(x) === original) || null;
      comoNueva = !!n && !nodo;
      editor.nota(id, nodo, t);
    }, { repetible: true, rescate: t });
    if (comoNueva) alert('Esa nota cambió fuera de la aplicación mientras la editabas. Tu texto se ha guardado como una nota nueva, sin tocar la otra.');
    return;
  }
  if (tipo === 'documento') return anadirDocumento(id);
  if (tipo === 'citar') {
    const d = await formularioCita({ titulo: 'Citar un documento en ' + nom, grados: GRADOS, docs: documentosCitables(), familia: docsDeFamilia(arbol, id, docsDelArbol()), vida: vidaEstimada(arbol, id), mostrarDoc, datos: { grado: 'A' } });
    if (d) await citar(id, d.doc, d);
    return;
  }
  if (tipo === 'conyuge') {
    const r = await formularioPersona({ ...base, titulo: 'Añadir cónyuge de ' + nom, existente: true, boda: true,
      datos: { sexo: p.sexo === 'M' ? 'F' : p.sexo === 'F' ? 'M' : 'U' } });
    if (!r) return;
    await operar('Añadir cónyuge de ' + nom, () => { const x = r.nueva ? editor.nuevaPersona(r.nueva) : r.existente; editor.conyuge(id, x, r.nueva?.boda); }, { repetible: true });
  }
}

$('#b-editar').onclick = () => editor ? terminarEdicion() : entrarEdicion();
$('#b-deshacer').onclick = deshacer;
window.addEventListener('beforeunload', ev => { if (guardando) { ev.preventDefault(); ev.returnValue = ''; } });
// Al cerrar o salir de la pestaña, se quita el candado si es nuestro (no se deja bloqueado el GEDCOM)
window.addEventListener('pagehide', () => { guardado?.quitarCandado(); });
window.addEventListener('beforeunload', () => { if (!guardando) guardado?.quitarCandado(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && !guardando && guardado?.tengo) guardado.quitarCandado(); });

// ---------- Árboles ----------

function verArbol(id) {
  const vista = vistaArbol();
  if (!arbol.p(id)) return pantalla(`<div class="caja"><p class="aviso">No existe la persona ${esc(id)}.</p></div>`);
  const p = arbol.p(id);
  document.title = 'Árbol de ' + nombreCompleto(p);
  main.dataset.persona = id;
  const cuerpo = vista === 'lista' ? lista(arbol, id) : vista === 'desc' ? descendientes(arbol, id) : vista === 'gdesc' ? graficoDescendientes(arbol, id) : grafico(arbol, id);
  pantalla(`<div class="arbol-vista"><h2 class="tit-arbol">Árbol de ${esc(nombreCompleto(p))}
      <a class="boton imprimir" href="#/imprimir/${esc(id.slice(1, -1))}">🖨 Imprimir / PDF</a></h2>
    <section class="detalle">${pestanasArbol(vista)}<div class="cuerpo">${cuerpo}</div></section></div>`);
  recordar(id);
  main.querySelectorAll('[data-vista]').forEach(b => b.onclick = () => { LS.set('vista', b.dataset.vista); verArbol(id); });
  // «Ir al n.º»: abre su generación, la lleva a la vista y la resalta.
  $('#ir-num')?.addEventListener('submit', ev => {
    ev.preventDefault();
    const n = parseInt($('#num').value.replace(/[.\s]/g, ''), 10);
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
    <p class="botones"><b>Informe de ascendientes en texto</b> (generación a generación, con fechas, lugares y fuentes; usa las generaciones elegidas arriba):
      <button id="inf-pdf">Ver e imprimir / PDF</button> <button id="inf-word">Descargar para Word</button>
      <label class="check"><input type="checkbox" id="inf-notas"> con notas</label></p>
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
  const informe = () => informeAscendientes(arbol, id, { gens: Math.max(+$('#o-gens').value, 3), notas: $('#inf-notas').checked });
  $('#inf-pdf').onclick = () => {
    const h = informe(), v = window.open('', '_blank');
    if (v) { v.document.write(h); v.document.close(); setTimeout(() => v.print(), 400); }
    else alert('El navegador ha bloqueado la ventana nueva. Permite las ventanas emergentes para esta página o usa «Descargar para Word».');
  };
  $('#inf-word').onclick = () => {
    // Word abre una página HTML guardada como .doc (y desde ahí se puede guardar como .docx)
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + informe()], { type: 'application/msword' }));
    a.download = `ascendientes_${nombreCompleto(p).replace(/[^\p{L}\p{N}]+/gu, '_')}_${$('#o-gens').value}gen.doc`; a.click();
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
function hayCarpeta(caja, falta) {
  if (carpeta && !falta) return true;
  caja.innerHTML = hayDisco
    ? `${carpetasMovidas.length ? `<p class="aviso">${carpetasMovidas.map(n => '«' + esc(n) + '»').join(', ')} ya no está donde estaba (ha cambiado de sitio). Elige la carpeta donde están ahora las fotos.</p>` : ''}<p class="peq">${falta ? esc(falta) + '<br>Si está en otra carpeta, añádela. Lo más sencillo: elegir la carpeta «Genealogia» entera (o toda la de Dropbox):'
                              : 'Para ver fotos y transcripciones, elige la carpeta donde están (por ejemplo «Genealogia», o toda la de Dropbox). Puedes añadir varias.'}
       ${carpetaPendiente.length ? `<button data-c="re">Volver a usar ${carpetaPendiente.map(h => '«' + esc(h.name) + '»').join(', ')}</button>` : ''} <button data-c="elegir">${carpeta ? 'Añadir otra carpeta…' : 'Elegir carpeta…'}</button></p>`
    : '<p class="peq">En este aparato no se pueden ver fotos ni transcripciones: solo el árbol. Se ven en el ordenador, con Chrome o Edge.</p>';
  caja.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => {
    try {
      await anadirCarpeta(b.dataset.c === 'elegir');
      caja.innerHTML = `<p class="peq">Carpetas: ${esc(carpeta?.nombre || 'ninguna')}. Cierra y vuelve a abrirlo.</p>`;
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

// El visor de documentos es el mismo que el de «Revisar transcripciones»: js/visordoc.js. Aquí solo se le dice qué abrir.
let visorDoc = null;
const enVisor = { lista: [], i: 0, doc: null };
function elVisor() {
  if (visorDoc) return visorDoc;
  visorDoc = VisorDoc.crear($('#visor'), {
    reparto: 62,
    activo: () => !$('#visor').hidden,
    ir: async d => {
      const k = enVisor.i + d;
      if (k < 0 || k >= enVisor.lista.length) { visorDoc.toast(d > 0 ? 'Es la última foto de este documento.' : 'Es la primera foto de este documento.', 1800); return; }
      if (await visorDoc.puedoSalir()) { enVisor.i = k; abrirFoto(); }
    },
    irHermana: v => { enVisor.i = +v; abrirFoto(); },
    haySiguiente: () => enVisor.i < enVisor.lista.length - 1,
    alEscape: cerrarVisor,
    alIrPersona: href => { ocultarVisor(); location.hash = href; },
    avisoNoMd: 'No se encuentra el texto en la carpeta.',
  });
  const x = document.createElement('button');
  x.textContent = '✕'; x.title = 'Cerrar (Esc)'; x.setAttribute('aria-label', 'Cerrar'); x.onclick = cerrarVisor;
  visorDoc.ranura('izq').append(x);
  return visorDoc;
}
function ocultarVisor() { $('#visor').hidden = true; document.body.classList.remove('con-visor'); }
async function cerrarVisor() { if (!visorDoc || await visorDoc.puedoSalir()) ocultarVisor(); }
function mostrarVisor() { const v = elVisor(); $('#visor').hidden = false; document.body.classList.add('con-visor'); return v; }

// Las transcripciones de una foto: las suyas y después las del documento entero.
async function versionesFoto(m, doc) {
  if (!carpeta) return [];
  const out = [];
  if (m.ruta) { try { out.push(...await carpeta.versiones(m.ruta)); } catch (e) { if (!e.noExiste) throw e; } }
  const propias = out.length;
  for (const t of doc?.transcripciones || []) {
    try { const v = await carpeta.ubicarTexto(t); if (!out.some(o => o.ruta === v.ruta)) out.push(v); } catch (e) { if (!e.noExiste) throw e; }
  }
  return { lista: out, propias };
}
// Quién cita este documento en el árbol: se llega a su ficha con un clic.
function gentePorDoc(doc) {
  if (!doc?.id) return [];
  const out = [];
  for (const p of arbol.personas.values()) {
    if (!arbol.registro(p.id)?.raw?.includes(doc.id)) continue;
    out.push({ nombre: nombreCompleto(p), titulo: vida(p) || 'Ver su ficha', href: '#/p/' + p.id.slice(1, -1) });
    if (out.length >= 15) break;
  }
  return out;
}
// Avisos y fiabilidad medida: los de la lista del revisor (9 Sistema/Herramientas/datos_revisar.js), si está en la carpeta.
let datosRev = null;
function datosRevisar() {
  if (datosRev?.carpeta === carpeta) return datosRev.promesa;
  const promesa = (async () => {
    try {
      const { texto } = await carpeta.texto('9 Sistema/Herramientas/datos_revisar.js');
      const D = JSON.parse(texto.slice(texto.indexOf('=') + 1).replace(/;\s*$/, '')), idx = new Map();
      D.filas.forEach((f, i) => idx.set(D.dirs[f[0]] + '/' + f[1], i));
      return { D, idx };
    } catch { return null; }
  })();
  datosRev = { carpeta, promesa };
  return promesa;
}
async function extrasDeRevisar(m, pagina) {
  if (!carpeta || !m.ruta) return;
  const dr = await datosRevisar();
  if (!dr) return;
  let rel; try { rel = (await carpeta.buscar(m.ruta)).rel; } catch { return; }
  const k = rel.findIndex(x => x.toLowerCase() === '2 documentos'), i = k < 0 ? undefined : dr.idx.get(rel.slice(k).join('/'));
  if (i === undefined || visorDoc.pagina !== pagina) return;
  const f = dr.D.filas[i];
  visorDoc.ponExtras({ medida: f[13] ? f[12] : null, avisos: dr.D.avisos[i] || null });
}

function abrirFoto() {
  const { lista, i, doc } = enVisor, m = lista[i], v = elVisor();
  const nombre = (m.ruta || '').split(/[\\/]/).pop();
  const pagina = {
    titulo: m.titulo, ruta: (m.ruta || '').replace(/^(\.\.[\\/])+/, ''), nombre, clave: m.ruta || m.titulo, form: m.form,
    foto: m.ruta ? () => { if (!carpeta) { const e = new Error('Falta la carpeta'); e.noExiste = true; e.sinCarpeta = true; throw e; } return carpeta.enlace(m.ruta); } : null,
    sinFoto: (caja, e) => { if (e.sinCarpeta) hayCarpeta(caja); else if (e.noExiste) hayCarpeta(caja, e.message); else caja.innerHTML = `<p>${esc(e.message)}</p>`; },
    hermanas: lista.length > 1 ? lista.map((x, k) => ({ valor: k, etiqueta: `${k + 1} / ${lista.length}` })) : [], actual: i,
    gente: gentePorDoc(doc),
    versiones: async () => { const r = await versionesFoto(m, doc); if (!r.lista) return []; pagina.tieneDeLaFoto = r.propias > 0; return r.lista; },
    nueva: async () => {
      if (!carpeta || !m.ruta) return null;
      const n = await carpeta.versionNueva(m.ruta);
      n.cab = { archivo: doc?.publ || '', personas: pagina.gente.map(g => g.nombre) };
      return n;
    },
    sinTexto: carpeta ? null : caja => hayCarpeta(caja),
  };
  v.abrir(pagina);
  extrasDeRevisar(m, pagina);
}

function visor(lista, i, fuenteDoc) {
  mostrarVisor();
  enVisor.lista = lista; enVisor.i = i; enVisor.doc = fuenteDoc || null;
  abrirFoto();
}

// Un texto citado por su ruta. Si tiene foto (al lado o en su encabezado), sale con ella; si no, el texto ocupa todo.
async function verTexto(ruta, titulo) {
  const v = mostrarVisor();
  enVisor.lista = []; enVisor.i = 0; enVisor.doc = null;
  const base = { titulo, ruta, clave: ruta, gente: [] };
  if (!carpeta) { v.abrir({ ...base, foto: null, sinTexto: caja => hayCarpeta(caja) }); return; }
  let ver, foto = null;
  try { ver = await carpeta.ubicarTexto(ruta); foto = await carpeta.fotoDeTexto(ver, await ver.leer()); }
  catch (e) {
    if (e.noExiste) { v.abrir({ ...base, foto: null, sinTexto: caja => hayCarpeta(caja, e.message) }); return; }
    v.abrir({ ...base, foto: null, sinTexto: caja => { caja.textContent = e.message; } }); return;
  }
  v.abrir({ ...base, ruta: ver.ruta, nombre: foto ? foto.split('/').pop() : ver.etiqueta, foto: foto ? () => carpeta.enlace(foto) : null, versiones: [ver], tieneDeLaFoto: true,
    sinFoto: (caja, e) => { if (e.noExiste) hayCarpeta(caja, e.message); else caja.innerHTML = `<p>${esc(e.message)}</p>`; } });
}

// ---------- Base de nombres y lugares (9 Sistema/Control/nombres_lugares.db) ----------

let baseNombres = null;
const accionesDoc = {
  texto: (ruta, titulo) => verTexto(ruta, titulo),
  imagen: (ruta, titulo) => visor([{ titulo, ruta, form: ruta.split('.').pop().toLowerCase() }], 0, null),
  archivo: async (ruta, titulo) => {
    if (!carpeta) return verTexto(ruta, titulo);   // explica cómo elegir las carpetas
    try { const u = await carpeta.enlace(ruta); window.open(u, '_blank'); } catch (e) { alert(e.message); }
  },
};

async function leerBase(asaOArchivo) {
  const f = asaOArchivo.getFile ? await asaOArchivo.getFile() : asaOArchivo;
  const bytes = new Uint8Array(await f.arrayBuffer());
  baseNombres?.cerrar();
  baseNombres = null;
  baseNombres = await BaseNombres.abrir(bytes, f.name, f.lastModified);
}

// Si la base no está abierta, explica y ofrece abrirla. Llama a «listo» cuando lo esté. Devuelve true si ya lo estaba.
async function necesitaBase(caja, listo) {
  if (baseNombres) return true;
  if (pruebas()) {   // servidor de pruebas: la base del proyecto, sin elegir archivo
    caja.innerHTML = '<p class="cargando">Abriendo la base de nombres…</p>';
    const r = await fetch(encodeURI('/Genealogia/9 Sistema/Control/nombres_lugares.db'), { cache: 'no-store' });
    baseNombres = await BaseNombres.abrir(new Uint8Array(await r.arrayBuffer()), 'nombres_lugares.db', Date.parse(r.headers.get('Last-Modified')));
    listo(); return false;
  }
  let guardada = await bdLeer('nombresDb');
  try { if (guardada && await permiso(guardada, false)) {
    caja.innerHTML = '<p class="cargando">Abriendo la base de nombres…</p>';
    try { await leerBase(guardada); listo(); return false; } catch (e) { if (seHaMovido(e)) throw e; caja.innerHTML = `<p class="aviso">${esc(e.message)}</p>`; }
  } } catch (e) { if (!seHaMovido(e)) throw e; await bdGuardar('nombresDb', null); guardada = null; }   // la base cambió de sitio: se elige otra vez
  caja.innerHTML = `<div class="caja-base"><p>Para ver dónde sale cada persona en los documentos, abre la <b>base de nombres y lugares</b>
      (<code>9 Sistema/Control/nombres_lugares.db</code>). Se lee aquí mismo, sin internet.</p>
    ${!hayDisco ? '<p class="aviso">Pesa unos 180 MB: en el móvil puede ir muy lento o no abrir.</p>' : ''}
    <p class="botones">${guardada ? `<button data-b="re" class="principal">Abrir «${esc(guardada.name)}»</button>` : ''}
      ${hayDisco ? `<button data-b="elegir"${guardada ? '' : ' class="principal"'}>Elegir base de nombres (.db)…</button>`
                 : '<label class="boton principal">Elegir base de nombres (.db)…<input type="file" hidden data-b="archivo"></label>'}</p>
    <p class="aviso" data-error></p></div>`;
  const error = e => {
    if (e.name === 'AbortError') return;
    if (seHaMovido(e)) { bdGuardar('nombresDb', null); caja.querySelector('[data-error]').textContent = 'La base de nombres ha cambiado de sitio. Pulsa «Elegir base de nombres» y búscala donde está ahora.'; return; }
    caja.querySelector('[data-error]').textContent = e.message;
  };
  const abrir = async obtener => {
    try {
      const x = await obtener();
      caja.querySelector('.botones').innerHTML = '<span class="cargando">Leyendo la base (unos 180 MB)…</span>';
      await leerBase(x); listo();
    } catch (e) { error(e); }
  };
  caja.querySelector('[data-b=re]')?.addEventListener('click', () => abrir(async () => { if (!await permiso(guardada, true)) throw new Error('Sin permiso para leer el archivo.'); return guardada; }));
  caja.querySelector('[data-b=elegir]')?.addEventListener('click', () => abrir(async () => {
    const [asa] = await window.showOpenFilePicker({ id: 'arbol-nombres', types: [{ description: 'Base de nombres', accept: { 'application/x-sqlite3': ['.db', '.sqlite'] } }] });
    await bdGuardar('nombresDb', asa); return asa;
  }));
  caja.querySelector('[data-b=archivo]')?.addEventListener('change', ev => ev.target.files[0] && abrir(async () => ev.target.files[0]));
  return false;
}

async function mencionesDe(id) {
  const caja = $('#menciones');
  if (!caja) return;
  if (!await necesitaBase(caja, () => mencionesDe(id))) return;
  try { pintarMenciones(caja, baseNombres.menciones(id), { ...accionesDoc, confirmar: editor ? m => confirmarMencion(id, m) : null }, arbol.p(id)); }
  catch (e) { caja.innerHTML = `<p class="aviso">${esc(e.message)}</p>`; }
}

// ---------- Revisar el árbol: dónde se corta cada línea, incoherencias y duplicados ----------

function verRevisar(tab) {
  document.title = 'Árbol · Revisar';
  main.dataset.persona = '';
  const raiz = LS.get('revisarRaiz') && arbol.p(LS.get('revisarRaiz')) ? LS.get('revisarRaiz') : arbol.raices[0]?.id;
  const sub = (k, t) => `<a class="pest${tab === k ? ' activa' : ''}" href="#/revisar/${k}">${t}</a>`;
  pantalla(`<div class="buscador">
    <nav class="pestanas donde"><a class="pest" href="#/buscar">Buscar</a><a class="pest" href="#/texto">Texto libre</a><a class="pest activa" href="#/revisar">Revisar el árbol</a></nav>
    <nav class="pestanas">${sub('fronteras', 'Dónde se corta la línea')}${sub('incoherencias', 'Incoherencias')}${sub('duplicados', 'Posibles duplicados')}${sub('pruebas', 'Qué falta por probar')}${sub('repetidos', 'Antepasados repetidos')}${sub('tareas', 'Tareas pendientes')}${sub('lugares', 'Lugares')}${sub('salud', 'Salud del archivo')}${sub('copias', 'Copias e historial')}</nav>
    ${['fronteras', 'pruebas', 'repetidos'].includes(tab) ? `<label class="raiz-rev">Antepasados de <select id="r-raiz">${arbol.raices.map(r => `<option value="${esc(r.id)}"${r.id === raiz ? ' selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select></label>` : ''}
    <div id="r-res"><p class="cargando">Revisando…</p></div><p class="exportar" id="r-excel"></p></div>`);
  if (!['salud', 'copias'].includes(tab)) $('#r-excel').append(botonExcel('revisar_' + tab, $('#r-res'), tab === 'lugares' ? () => ({
    cabecera: ['Lugar', 'Hechos', 'Personas'], filas: listaDeLugares(arbol).todos.map(x => [x.lugar, x.hechos, x.personas.size]) }) : null));
  $('#r-raiz')?.addEventListener('change', ev => { LS.set('revisarRaiz', ev.target.value); verRevisar(tab); });
  setTimeout(() => {
    const caja = $('#r-res'); if (!caja) return;
    if (tab === 'salud') return verSalud(caja);
    if (tab === 'lugares') return verLugares(caja);
    if (tab === 'pruebas') { caja.innerHTML = pintarFaltaProbar(arbol, raiz, antepasados.length ? (a, r) => antepasados(a, r, 40) : null);
      const f = () => caja.querySelector('table')?.classList.toggle('solo-huecos', $('#fp-huecos').checked); $('#fp-huecos').onchange = f; f(); return; }
    if (tab === 'repetidos') { caja.innerHTML = pintarRepetidos(arbol, raiz); return; }
    if (tab === 'tareas') { caja.innerHTML = pintarTareas(arbol); return; }
    if (tab === 'copias') return verCopias(caja);
    caja.innerHTML = tab === 'incoherencias' ? pintarIncoherencias(arbol) : tab === 'duplicados' ? pintarDuplicados(arbol, !!editor) : pintarFronteras(arbol, raiz);
    caja.querySelectorAll('[data-fusionar]').forEach(b => b.onclick = async () => {
      const a = b.dataset.fusionar, r = await formularioFusion(arbol, a, variantes, b.dataset.con);
      if (!r) return;
      await operar(`Fusionar a ${nombreCompleto(arbol.p(a))} con ${nombreCompleto(arbol.p(r.otro))} (${r.otro})`, () => editor.fusionar(a, r.otro, r.usar));
      verRevisar(tab);
    });
  }, 30);
}

// ---------- Salud del archivo ----------
function verSalud(caja) {
  const l = revisarSalud(arbol.ged), arreglables = l.filter(x => x.arreglo);
  const grupos = new Map();
  for (const x of l) { if (!grupos.has(x.tipo)) grupos.set(x.tipo, []); grupos.get(x.tipo).push(x); }
  caja.innerHTML = `<p class="peq">${l.length ? `${l.length} avisos en el archivo (${arbol.personas.size.toLocaleString('es')} personas). ${arreglables.length} se pueden arreglar solos.` : '✔ El archivo está sano: no hay enlaces rotos, familias vacías ni líneas raras.'}</p>
    ${arreglables.length ? (editor ? `<p class="botones"><button id="s-arreglar" class="principal">Arreglar los ${arreglables.length} seguros</button></p>` : '<p class="peq">Para arreglarlos, activa antes «Editar».</p>') : ''}
    ${[...grupos.entries()].map(([t, xs]) => `<details class="gen"${xs.length < 30 ? ' open' : ''}><summary><b>${esc(t)}</b> <span class="peq">${xs.length}</span></summary>
      ${xs.slice(0, 300).map(x => `<div class="fila-rev">${esc(x.texto)}${x.arreglo ? ' <span class="falta">se puede arreglar</span>' : ''}</div>`).join('')}</details>`).join('')}`;
  $('#s-arreglar')?.addEventListener('click', async () => {
    if (!confirm(`¿Arreglar ${arreglables.length} problemas? Se quitan los enlaces a registros que no existen, se completan los enlaces sin vuelta y se quitan las familias vacías. Se puede deshacer.`)) return;
    let n = 0;
    await operar('Arreglar la salud del archivo', () => { n = repararSalud(editor, arreglables); });
    flotante(`Arreglados ${n} problemas.`); verRevisar('salud');
  });
}

// ---------- Copias e historial ----------
async function verCopias(caja) {
  if (!guardado) { caja.innerHTML = '<p class="peq">Para ver, comparar y restaurar las copias de seguridad, activa antes «Editar» (da acceso a la carpeta del archivo).</p>'; return; }
  const [lista, diario] = await Promise.all([guardado.copias(), guardado.diario()]);
  const mb = b => (b / 1e6).toLocaleString('es', { maximumFractionDigits: 1 }) + ' MB';
  const deApp = lista.filter(x => x.deApp);
  caja.innerHTML = `<h3>Copias de seguridad (${lista.length}, ${mb(lista.reduce((s, x) => s + x.tam, 0))})</h3>
    <p class="peq">Las «_app_» las hace esta aplicación; las demás, los scripts. Además, Dropbox guarda 30 días de versiones de cada archivo.</p>
    ${deApp.length > 10 ? `<p class="botones"><button id="c-limpiar">Borrar ${deApp.length - 10} copias antiguas de la aplicación (deja las 10 últimas)</button></p>` : ''}
    <div class="copias">${lista.map((x, i) => `<div class="fila-rev"><b>${esc(x.nombre)}</b> <span class="peq">${esc(new Date(x.fecha).toLocaleString('es'))} · ${mb(x.tam)}</span>
      <span class="botones"><button class="mas" data-comparar="${i}">Comparar con el actual</button><button class="mas" data-restaurar="${i}">Restaurar todo</button></span>
      <div class="diff" id="diff${i}"></div></div>`).join('')}</div>
    <h3>Diario de cambios (${diario.length})</h3>
    <div class="diario">${diario.slice(-300).reverse().map(d => `<div class="fila-rev"><span class="peq">${esc(d.fecha)} · ${esc(d.aparato)}</span> ${esc(d.desc)}
      ${d.xrefs.length ? `<span class="peq"> · ${d.xrefs.slice(0, 6).map(x => arbol.p(x) ? `<a href="#/p/${esc(x.slice(1, -1))}">${esc(nombreCompleto(arbol.p(x)))}</a>` : esc(x)).join(', ')}${d.xrefs.length > 6 ? '…' : ''}</span>` : ''}</div>`).join('') || '<p class="nada">Todavía no hay cambios apuntados.</p>'}</div>`;
  $('#c-limpiar')?.addEventListener('click', async () => {
    if (!confirm(`¿Borrar ${deApp.length - 10} copias antiguas hechas por la aplicación? Se quedan las 10 últimas, las de los scripts y las versiones de Dropbox.`)) return;
    const r = await guardado.limpiarCopias(10);
    flotante(`Borradas ${r.borradas} copias (${mb(r.bytes)} liberados).`); verRevisar('copias');
  });
  caja.querySelectorAll('[data-comparar]').forEach(b => b.onclick = async () => {
    const x = lista[+b.dataset.comparar], div = $('#diff' + b.dataset.comparar);
    div.innerHTML = '<p class="cargando">Comparando…</p>';
    const { ged: g } = personasDe(await guardado.leerCopia(x.nombre));
    const d = diferencias(arbol.ged, g);
    const nom = (xr, gg) => { const p = arbol.p(xr); if (p) return nombreCompleto(p); const r = gg.porXref.get(xr); return r ? (r.raw.match(/\n1 NAME ([^\r\n]*)/)?.[1] || '').replace(/\//g, '') || xr : xr; };
    const filaCambio = xr => `<div class="cambio"><a href="#/p/${esc(xr.slice(1, -1))}">${esc(nom(xr, g))}</a> <span class="peq">${esc(xr)}</span>
      ${editor ? `<button class="mas" data-rest="${esc(xr)}">Volver a como estaba en la copia</button>` : ''}
      <details><summary class="peq">ver qué cambió</summary>${(() => { const l = lineasDistintas(arbol.ged.porXref.get(xr).texto(), g.porXref.get(xr).texto());
        return `<pre class="ged">${l.soloCopia.map(t => '− ' + esc(t)).join('\n')}\n${l.soloAhora.map(t => '+ ' + esc(t)).join('\n')}</pre>`; })()}</details></div>`;
    div.innerHTML = `<p class="peq">Desde esa copia: ${d.anadidas.length} personas o familias nuevas, ${d.cambiadas.length} cambiadas, ${d.quitadas.length} quitadas${d.otros ? ` y ${d.otros} registros de fuentes, notas o fotos` : ''}.
      «−» es lo que había en la copia y «+» lo que hay ahora.</p>
      ${d.cambiadas.slice(0, 200).map(filaCambio).join('')}
      ${d.quitadas.length ? `<p class="peq">Quitadas desde la copia: ${d.quitadas.slice(0, 50).map(xr => `${esc(nom(xr, g))} ${editor ? `<button class="mas" data-rest="${esc(xr)}">recuperar</button>` : ''}`).join(' · ')}</p>` : ''}
      ${d.anadidas.length ? `<p class="peq">Nuevas desde la copia: ${d.anadidas.slice(0, 50).map(xr => `<a href="#/p/${esc(xr.slice(1, -1))}">${esc(nom(xr, g))}</a>`).join(' · ')}</p>` : ''}`;
    div.querySelectorAll('[data-rest]').forEach(bb => bb.onclick = async () => {
      const xr = bb.dataset.rest;
      if (!confirm(`¿Volver a poner ${nom(xr, g)} (${xr}) tal como estaba en «${x.nombre}»? Solo cambia esa ficha. Se puede deshacer.`)) return;
      await operar(`Restaurar ${nom(xr, g)} desde ${x.nombre}`, () => editor.restaurarRegistro(xr, g.porXref.get(xr).texto()));
      verRevisar('copias');
    });
  });
  caja.querySelectorAll('[data-restaurar]').forEach(b => b.onclick = async () => {
    const x = lista[+b.dataset.restaurar];
    if (!confirm(`¿Volver TODO el árbol a la copia «${x.nombre}» (${new Date(x.fecha).toLocaleString('es')})?\n\nLo de ahora se guarda antes como copia, así que también se puede volver atrás.`)) return;
    try {
      const bytes = await guardado.leerCopia(x.nombre), { personas } = personasDe(bytes);
      guardando = true;
      try { await guardado.guardar(bytes, personas); } finally { guardando = false; }
      await guardado.apuntar(`Restaurar todo el árbol desde ${x.nombre}`);
      info.fecha = 0; await actualizarSiCambio();
      flotante(`Restaurado desde ${x.nombre}.`); verRevisar('copias');
    } catch (e) { alert('No se ha restaurado nada.\n\n' + e.message); }
  });
}

// Historial de una persona (diario de cambios) en la pestaña GEDCOM
async function historialDe(id) {
  const caja = $('#historial'); if (!caja) return;
  if (!guardado) { caja.innerHTML = '<p class="peq">El historial de cambios se ve con «Editar» activado.</p>'; return; }
  const l = (await guardado.diario()).filter(d => d.xrefs.includes(id)).reverse();
  caja.innerHTML = `<h4>Historial de cambios</h4>${l.map(d => `<div class="fila-rev"><span class="peq">${esc(d.fecha)} · ${esc(d.aparato)}</span> ${esc(d.desc)}</div>`).join('') || '<p class="nada">Sin cambios apuntados en el diario.</p>'}`;
}

// ---------- Parentesco ----------
function parentescoRaices(id) {
  const l = arbol.raices.filter(r => r.id !== id).map(r => {
    const ns = arbol.ahnentafel(r.id).get(id);
    const pa = parentesco(arbol, r.id, id);
    return pa ? `<span>De ${esc(r.nombre.split(' ')[0])}: <b>${esc(pa.texto)}</b>${ns ? ` (n.º ${ns.slice(0, 2).map(miles).join(' y ')})` : ''}</span>` : '';
  }).filter(Boolean);
  return l.length ? `<p class="parentesco-raiz">${l.join(' · ')}</p>` : '';
}
function elegirParentesco(id) {
  const capa = $('#dialogo');
  capa.hidden = false; document.body.classList.add('con-visor');
  capa.innerHTML = `<div class="caja dialogo"><h2>Parentesco de ${esc(nombreCompleto(arbol.p(id)))} con…</h2>
    <label>Busca a la otra persona<input id="pa-buscar" autocomplete="off"></label><div id="pa-res" class="elegir"></div><div id="pa-sal"></div>
    <p class="botones"><button id="pa-cerrar">Cerrar</button></p></div>`;
  const cerrar = () => { capa.hidden = true; capa.innerHTML = ''; document.body.classList.remove('con-visor'); };
  $('#pa-cerrar').onclick = cerrar;
  let t;
  $('#pa-buscar').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => {
    const r = buscar(arbol, $('#pa-buscar').value, { variantes, limite: 12 });
    $('#pa-res').innerHTML = r.lista.filter(p => p.id !== id).map(p => `<button type="button" data-id="${esc(p.id)}"><b>${esc(nombreCompleto(p))}</b> <span class="peq">${esc(vida(p))}</span></button>`).join('');
    $('#pa-res').querySelectorAll('[data-id]').forEach(b => b.onclick = () => { $('#pa-res').innerHTML = ''; $('#pa-sal').innerHTML = pintarParentesco(arbol, id, b.dataset.id);
      $('#pa-sal').querySelectorAll('a').forEach(a => a.addEventListener('click', cerrar)); });
  }, 150); });
  $('#pa-buscar').focus();
}

// ---------- Lugares: lista y unificar variantes ----------
function verLugares(caja) {
  const { todos, grupos } = listaDeLugares(arbol);
  caja.innerHTML = `<p class="peq">${todos.length.toLocaleString('es')} lugares distintos en los hechos del árbol. Arriba, grupos que parecen el mismo lugar escrito de varias formas.
      ${editor ? 'Elige la forma buena y pulsa «Unificar»: se cambia en todos los hechos (se puede deshacer).' : 'Para unificar, activa «Editar».'}</p>
    <h3>Posibles variantes (${grupos.length})</h3>
    ${grupos.slice(0, 200).map((g, i) => `<div class="fila-rev grupo-lugar">${g.map((e, k) => `<label class="check"><input type="radio" name="gl${i}" value="${k}"${k === 0 ? ' checked' : ''}> ${esc(e.lugar)} <span class="peq">${e.hechos} hechos</span></label>`).join('')}
      ${editor ? `<button class="mas" data-unificar="${i}">Unificar en la elegida</button>` : ''}</div>`).join('') || '<p class="nada">No se ven variantes.</p>'}
    <h3>Todos los lugares</h3>
    <label>Filtrar<input id="lg-filtro" placeholder="Escribe parte del nombre"></label>
    <div id="lg-lista"></div>`;
  const pintar = () => {
    const q = planoTexto($('#lg-filtro').value);
    $('#lg-lista').innerHTML = todos.filter(e => !q || planoTexto(e.lugar).includes(q)).slice(0, 400).map(e => `<div class="fila-rev">${esc(e.lugar)} <span class="peq">${e.hechos} hechos · ${e.personas.size} personas</span>
      ${editor ? `<button class="mas" data-renombrar="${esc(e.lugar)}">Cambiar nombre</button>` : ''}</div>`).join('');
    $('#lg-lista').querySelectorAll('[data-renombrar]').forEach(b => b.onclick = async () => {
      const v = b.dataset.renombrar, n = prompt(`Nuevo nombre para «${v}» (se cambia en todos los hechos):`, v);
      if (!n || n.trim() === v) return;
      let c = 0; await operar(`Cambiar el lugar «${v}» por «${n.trim()}»`, () => { c = editor.renombrarLugar([v], n.trim()); });
      flotante(`Cambiado en ${c} hechos.`); verRevisar('lugares');
    });
  };
  $('#lg-filtro').addEventListener('input', pintar); pintar();
  caja.querySelectorAll('[data-unificar]').forEach(b => b.onclick = async () => {
    const g = grupos[+b.dataset.unificar], k = +caja.querySelector(`input[name=gl${b.dataset.unificar}]:checked`).value, buena = g[k].lugar;
    if (!confirm(`¿Poner «${buena}» en lugar de:\n${g.filter((e, j) => j !== k).map(e => '· ' + e.lugar).join('\n')}\n\nen todos los hechos? Se puede deshacer.`)) return;
    let c = 0; await operar(`Unificar el lugar «${buena}»`, () => { c = editor.renombrarLugar(g.map(e => e.lugar), buena); });
    flotante(`Unificado en ${c} hechos.`); verRevisar('lugares');
  });
}

// ---------- Texto libre ----------
let busquedaTexto = 0;
function verTexto2() {
  document.title = 'Árbol · Texto libre';
  main.dataset.persona = '';
  const e = JSON.parse(sessionStorage.getItem('arbol.texto') || '{}');
  pantalla(`<div class="buscador">
    <nav class="pestanas donde"><a class="pest" href="#/buscar">Buscar</a><a class="pest activa" href="#/texto">Texto libre</a><a class="pest" href="#/revisar">Revisar el árbol</a></nav>
    <div class="filtros nombres"><label class="ancho">Frase o palabra<input id="t-q" value="${esc(e.q || '')}" placeholder="molino de Illade · Casa de Andeiro · escribano"></label></div>
    <label class="check"><input type="checkbox" id="t-trans"${e.trans ? ' checked' : ''}> Buscar también dentro de los archivos de transcripción (más lento)</label>
    <p class="peq">Busca en las notas del árbol${baseNombres ? ', en el texto de las menciones de la base de nombres' : ' (y en la base de nombres, si la abres en «En los documentos»)'} y, si lo marcas, en las transcripciones. Pulsa Intro.</p>
    <div id="t-res"></div></div>`);
  const lanzarT = async () => {
    const q = $('#t-q').value.trim(), trans = $('#t-trans').checked;
    sessionStorage.setItem('arbol.texto', JSON.stringify({ q, trans }));
    const caja = $('#t-res'), yo = ++busquedaTexto;
    if (q.length < 3) { caja.innerHTML = '<p class="peq">Escribe al menos 3 letras.</p>'; return; }
    const notas = enNotas(arbol, q), menc = enMenciones(baseNombres, q);
    caja.innerHTML = `<h3>En las notas del árbol: ${notas.length}</h3>${pintarNotas(notas, q)}
      ${baseNombres ? `<h3>En las menciones (base de nombres): ${menc.length}</h3>${menc.map(m => `<div class="fila-rev"><b>${esc(m.nombre)}</b>${m.xref && arbol.p(m.xref) ? ` → <a href="#/p/${esc(m.xref.slice(1, -1))}">${esc(nombreCompleto(arbol.p(m.xref)))}</a>` : ''}
        <div class="peq">${esc((m.titulo || '').trim())}</div><div class="peq">${resaltar(m.contexto || '', planoTexto(q))}</div></div>`).join('') || '<p class="nada">Nada.</p>'}` : ''}
      ${trans ? `<h3>En las transcripciones: <span id="t-av">buscando…</span></h3><div id="t-tr"></div>` : ''}`;
    if (!trans) return;
    if (!carpeta) { $('#t-tr').innerHTML = ''; hayCarpeta($('#t-tr')); $('#t-av').textContent = ''; return; }
    const l = await enTranscripciones(carpeta, q, { alAvance: n => { if (yo === busquedaTexto && $('#t-av')) $('#t-av').textContent = `${n.toLocaleString('es')} archivos leídos…`; }, parar: () => yo !== busquedaTexto });
    if (yo !== busquedaTexto || !$('#t-tr')) return;
    $('#t-av').textContent = l.length;
    $('#t-tr').innerHTML = pintarTranscripciones(l, q);
    $('#t-tr').querySelectorAll('[data-tr]').forEach(b => b.onclick = () => verTexto(l[+b.dataset.tr].ruta, l[+b.dataset.tr].ruta.split('/').pop()));
  };
  $('#t-q').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); lanzarT(); } });
  $('#t-trans').addEventListener('change', lanzarT);
  if (e.q) lanzarT();
}

// ---------- Estadísticas ----------

function verEstadisticas() {
  document.title = 'Árbol · Estadísticas';
  pantalla(`<div class="caja ancha"><p class="cargando">Contando…</p></div>`);
  setTimeout(() => {
    pantalla(`<div class="caja ancha">${pintarEstadisticas(arbol, info)}
      <p><a class="boton principal" href="#/buscar">Ver el árbol</a> <label class="boton">Abrir otro GEDCOM…<input id="otro-ged" type="file" hidden></label></p></div>`);
    $('#otro-ged').onchange = ev => ev.target.files[0] && abrirArchivo(ev.target.files[0]);
    abrirConCuadro($('#otro-ged').closest('label'));
    main.querySelectorAll('[data-apellido]').forEach(a => a.onclick = ev => {
      ev.preventDefault();
      Object.assign(estadoBusqueda, { q: '', nombre: '', apellidos: a.dataset.apellido, lugar: '', desde: null, hasta: null, linea: null });
      $('#q').value = '';
      sessionStorage.setItem('arbol.busqueda', JSON.stringify(estadoBusqueda));
      location.hash = '#/buscar';
    });
  }, 20);
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
    <p><label class="boton principal">Abrir otro GEDCOM…<input id="otro-ged" type="file" hidden></label> <a class="boton" href="#/estadisticas">Estadísticas</a> <button id="otro">Cerrar este árbol</button></p>
    <h3>Exportar para compartir</h3>
    <p class="peq">Un GEDCOM para la familia o para FamilySearch y MyHeritage: las personas que pueden estar vivas salen como «Privado» (sin datos, con sus enlaces).</p>
    <label class="check"><input type="checkbox" id="x-notas" checked> Quitar también las notas</label>
    <p><button id="x-compartir">Descargar GEDCOM para compartir</button></p>
    <h3>Personas de referencia</h3>
    <p class="peq">Salen en la barra de arriba y en el filtro de línea, y numeran a sus antepasados (Ahnentafel). Se marcan con la estrella en la ficha de cada persona.</p>
    <ul>${arbol.raices.map(r => `<li>${esc(r.letra)} · <a href="#/p/${esc(r.id.slice(1, -1))}">${esc(r.nombre)}</a> <button data-quitar="${esc(r.id)}">Quitar</button></li>`).join('')}</ul>
    <h3>Base de nombres y lugares</h3>
    <p>${baseNombres ? `<b>${esc(baseNombres.nombre)}</b>, del ${esc(new Date(baseNombres.fecha).toLocaleString('es'))}` : 'Sin abrir'}
      · se abre al usar la pestaña «Menciones» o «En los documentos».</p>
    ${baseNombres ? '<p><button id="sinbase">Cerrar y olvidar la base</button></p>' : ''}
    <h3>Carpeta de fotos y transcripciones</h3>
    ${hayDisco ? `<p>${carpeta ? carpeta.lista.map(c => `<b>${esc(c.nombre)}</b>`).join(' + ') : 'Ninguna'}${carpetaPendiente.length ? ` · pendientes de permiso: ${carpetaPendiente.map(h => esc(h.name)).join(', ')}` : ''}</p>
      <p><button id="carpeta">Añadir carpeta…</button> ${carpeta || carpetaPendiente.length ? '<button id="sincarpeta">Quitar todas</button>' : ''}</p>
      <p class="peq">Elige las carpetas que contienen las fotos y las transcripciones (lo más sencillo, la carpeta «Genealogia» entera, o toda la de Dropbox). El programa las busca dentro aunque el GEDCOM tenga otra ruta delante (otra letra de disco, otro ordenador).</p>`
    : '<p class="peq">En este aparato no se pueden ver fotos: solo en el ordenador, con Chrome o Edge.</p>'}
    <hr><p class="peq">Fase 1: solo lectura. El programa no cambia ningún archivo.</p>
  </div>`);
  $('#otro').onclick = async () => { await Fuente.olvidar(); LS.set('modo', null); location.hash = '#/'; location.reload(); };
  $('#otro-ged').onchange = ev => ev.target.files[0] && abrirArchivo(ev.target.files[0]);
  abrirConCuadro($('#otro-ged').closest('label'));
  $('#sinbase')?.addEventListener('click', async () => { baseNombres?.cerrar(); baseNombres = null; await bdGuardar('nombresDb', null); ajustes(); });
  $('#x-compartir').onclick = () => {
    const bytes = paraCompartir(arbol.ged, arbol, { vivos: true, notas: $('#x-notas').checked, utf8: true });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    a.download = info.nombre.replace(/\.ged$/i, '') + '_para_compartir.ged'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  main.querySelectorAll('[data-quitar]').forEach(b => b.onclick = () => { alternarRaiz(b.dataset.quitar); ajustes(); });
  if (hayDisco) {
    $('#carpeta').onclick = async () => { try { await anadirCarpeta(true); ajustes(); } catch (e) { if (e.name !== 'AbortError') alert(e.message); } };
    $('#sincarpeta')?.addEventListener('click', async () => { await Carpetas.guardar([]); carpeta = null; carpetaPendiente = []; ajustes(); });
  }
}

// ---------- Cabecera ----------

$('#q').value = estadoBusqueda.q || '';
$('#q').addEventListener('input', desdeCuadro);
$('#q').addEventListener('focus', () => { if (!$('#n-nombre')) location.hash = '#/buscar'; });
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#q').blur(); if ($('#n-nombre')) buscarTodo(0); } });

arrancar();
