// Arranque, apertura del GEDCOM y de la carpeta de fotos, y navegación entre pantallas.
import { Gedcom } from './gedcom.js';
import { Arbol, nombreCompleto } from './modelo.js';
import { buscar, prepararVariantes } from './buscar.js';
import { Fuente, Carpeta, Servidor, LS, hayDisco, permiso } from './almacen.js';
import { resultados, familia, detalle, citas } from './vistas.js';
import { md, esc } from './md.js';
import { grafico, lista, descendientes, pestanasArbol, irANumero } from './arboles.js';

const $ = s => document.querySelector(s);
const main = $('#main');
const esLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const PRUEBA = '/Genealogia_2/01_arboles/edmundo_actualizado/edmundo.ged';   // solo para el servidor de pruebas
let fuente = null, carpeta = null, carpetaPendiente = null, arbol, variantes = [], info = {};
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
      info = { nombre: datos.nombre, fecha: datos.fecha, tam: datos.bytes.length, cod: ged.cod, copia: fuente?.esCopia, cuando: datos.cuando };
      arbol.ponerRaices(raicesGuardadas());
      try { variantes = prepararVariantes(await (await fetch('variantes.json')).json()); } catch { variantes = []; }
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
}

// ---------- Navegación ----------

window.addEventListener('hashchange', () => arbol && ir());

function ir() {
  const h = decodeURIComponent(location.hash.slice(1)) || '/';
  let m;
  if ((m = /^\/p\/([^/]+)(?:\/(\w+))?$/.exec(h))) return verPersona('@' + m[1] + '@', m[2] || 'datos');
  if ((m = /^\/arbol\/([^/]+)(?:\/(\w+))?$/.exec(h))) return verArbol('@' + m[1] + '@', m[2] || (matchMedia('(max-width: 760px)').matches ? 'lista' : 'grafico'));
  if (h === '/arbol') return verArbol(main.dataset.persona || arbol.raices[0]?.id, null);
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

function verPersona(id, pestana) {
  const p = arbol.p(id);
  if (!p) return pantalla(`<div class="caja"><p class="aviso">No existe la persona ${esc(id)}.</p></div>`);
  document.title = nombreCompleto(p);
  const antes = main.dataset.persona === id;
  const y = window.scrollY;
  const raiz = esRaiz(id);
  main.innerHTML = `<div class="persona">${familia(arbol, id)}
    <p class="acciones"><a class="boton" href="#/arbol/${esc(id.slice(1, -1))}">🌳 Ver su árbol</a> <button id="raiz" title="Las personas de referencia salen arriba y numeran a sus antepasados">${raiz ? '★ Persona de referencia' : '☆ Marcar como persona de referencia'}</button></p>
    <section class="detalle">${detalle(arbol, id, pestana)}</section></div>`;
  main.dataset.persona = id;
  if (antes) window.scrollTo(0, y); else window.scrollTo(0, 0);
  $('#raiz').onclick = () => { alternarRaiz(id); verPersona(id, pestana); };
  const { docs, sueltas } = citas(arbol, id);
  main.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => {
    const k = b.dataset.fotos;
    const lista = k === 'sueltas' ? sueltas : b.dataset.todas ? docs[k].todas : docs[k].fotos;
    galeria($('#gal' + k), lista, docs[k]?.fuente);
  });
  main.querySelectorAll('[data-md]').forEach(b => b.onclick = () => verTexto(b.dataset.md, b.textContent));
}

// ---------- Árboles ----------

function verArbol(id, vista) {
  if (!vista) vista = matchMedia('(max-width: 760px)').matches ? 'lista' : 'grafico';
  if (!arbol.p(id)) return pantalla(`<div class="caja"><p class="aviso">No existe la persona ${esc(id)}.</p></div>`);
  if (location.hash !== `#/arbol/${id.slice(1, -1)}/${vista}`) history.replaceState(null, '', `#/arbol/${id.slice(1, -1)}/${vista}`);
  const p = arbol.p(id);
  document.title = 'Árbol de ' + nombreCompleto(p);
  main.dataset.persona = id;
  const cuerpo = vista === 'lista' ? lista(arbol, id) : vista === 'desc' ? descendientes(arbol, id) : grafico(arbol, id);
  pantalla(`<div class="arbol-vista"><h2 class="tit-arbol">Árbol de <a href="#/p/${esc(id.slice(1, -1))}">${esc(nombreCompleto(p))}</a></h2>
    <section class="detalle">${pestanasArbol(id, vista)}<div class="cuerpo">${cuerpo}</div></section></div>`);
  $('#ir-num')?.addEventListener('submit', ev => {
    ev.preventDefault();
    const n = parseInt($('#num').value, 10);
    if (!(n >= 1)) return;
    const x = irANumero(arbol, id, n);
    if (x) location.hash = '#/p/' + x.slice(1, -1);
    else alert(`No hay antepasado n.º ${n} en el árbol.`);
  });
}

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
