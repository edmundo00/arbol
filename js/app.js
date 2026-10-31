// Arranque, conexión, carga del GEDCOM y navegación entre pantallas.
import { Gedcom } from './gedcom.js';
import { Arbol, nombreCompleto } from './modelo.js';
import { buscar, prepararVariantes } from './buscar.js';
import { Dropbox, Local, LS, RUTAS, urlRedireccion, cacheLeer, cacheGuardar } from './almacen.js';
import { resultados, familia, detalle, citas } from './vistas.js';
import { md, esc } from './md.js';

const $ = s => document.querySelector(s);
const main = $('#main');
const esLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
let almacen, arbol, variantes = [], info = {};
const estadoBusqueda = JSON.parse(sessionStorage.getItem('arbol.busqueda') || '{}');

function pantalla(html) { main.innerHTML = html; window.scrollTo(0, 0); }
function error(e) {
  console.error(e);
  pantalla(`<div class="caja"><h2>Algo ha fallado</h2><p class="aviso">${esc(e.message || e)}</p>
    <p><button onclick="location.reload()">Volver a intentarlo</button> <a href="#/ajustes">Ajustes</a></p></div>`);
}

// ---------- Arranque ----------

async function arrancar() {
  // ?appkey=xxxx en la dirección: se guarda en este navegador y se quita de la dirección.
  const q = new URLSearchParams(location.search);
  if (q.get('appkey')) { LS.set('appkey', q.get('appkey').trim()); LS.set('modo', 'dropbox'); history.replaceState(null, '', urlRedireccion() + location.hash); }
  almacen = esLocal && LS.get('modo') === 'local' ? new Local() : new Dropbox();
  try {
    if (almacen.tipo === 'dropbox') await almacen.terminarConexion();
  } catch (e) { return error(e); }
  if (!almacen.conectado) return bienvenida();
  await cargar();
}

function bienvenida() {
  $('#cabecera').hidden = true;
  pantalla(`<div class="caja">
    <h2>Conectar con tu Dropbox</h2>
    <p>Esta página lee tu árbol (<code>${esc(LS.get('ruta') || RUTAS.gedcom)}</code>) directamente de tu Dropbox.
       No hay servidor: tus datos van de Dropbox a este navegador y a ningún otro sitio.</p>
    <label>Clave de la aplicación de Dropbox («App key»)<input id="appkey" autocomplete="off" spellcheck="false" value="${esc(LS.get('appkey') || '')}"></label>
    <p class="peq">Se pone una sola vez en cada aparato. Está en dropbox.com/developers → tu app → «App key». No es una contraseña.</p>
    <p class="peq">Dirección de vuelta que debe estar dada de alta en la app de Dropbox:<br><code>${esc(urlRedireccion())}</code></p>
    <button id="conectar" class="principal">Conectar con Dropbox</button>
    ${esLocal ? `<hr><p>En este ordenador también puedes usar los archivos tal cual, con <code>servidor_local.py</code>:</p><button id="local">Usar los archivos de este ordenador</button>` : ''}
  </div>`);
  $('#conectar').onclick = async () => {
    const k = $('#appkey').value.trim();
    if (!k) return alert('Pon la clave de la aplicación (App key).');
    LS.set('appkey', k); LS.set('modo', 'dropbox');
    try { almacen = new Dropbox(); await almacen.conectar(); } catch (e) { error(e); }
  };
  if (esLocal) $('#local').onclick = () => { LS.set('modo', 'local'); location.reload(); };
}

async function cargar() {
  const ruta = LS.get('ruta') || RUTAS.gedcom;
  pantalla(`<div class="caja"><p class="cargando">Abriendo el árbol…</p><p class="peq" id="paso"></p></div>`);
  const paso = t => { const e = $('#paso'); if (e) e.textContent = t; };
  try {
    const guardado = await cacheLeer(almacen.tipo + ':' + ruta);
    let datos = null, sinConexion = false;
    try {
      paso('Mirando si el GEDCOM ha cambiado…');
      const m = await almacen.metadatos(ruta);
      if (guardado && guardado.rev === m.rev) { datos = guardado; paso('Sin cambios: se usa la copia de este aparato.'); }
      else {
        paso('Bajando el GEDCOM (unos 8 MB)…');
        datos = await almacen.bajar(ruta);
        datos.cuando = Date.now();
        cacheGuardar(almacen.tipo + ':' + ruta, datos);
      }
    } catch (e) {
      if (!guardado || /volver a conectar|caducado/.test(e.message)) throw e;
      datos = guardado; sinConexion = true;
    }
    paso('Leyendo personas y familias…');
    await new Promise(r => setTimeout(r, 20));
    const ged = Gedcom.desdeBytes(datos.bytes);
    arbol = new Arbol(ged);
    arbol.ahnentafel('@I1@'); arbol.ahnentafel('@I2528@');
    try { variantes = prepararVariantes(await (await fetch('variantes.json')).json()); } catch { variantes = []; }
    info = { ruta, rev: datos.rev, fecha: datos.fecha, tam: datos.bytes.length, cuando: datos.cuando, sinConexion, cod: ged.cod };
    $('#cabecera').hidden = false;
    $('#estado').textContent = sinConexion ? 'Sin conexión: copia guardada' : '';
    window.arbol = arbol;
    ir();
  } catch (e) { error(e); }
}

// ---------- Navegación ----------

window.addEventListener('hashchange', () => arbol && ir());

function ir() {
  const h = decodeURIComponent(location.hash.slice(1)) || '/';
  let m;
  if ((m = /^\/p\/([^/]+)(?:\/(\w+))?$/.exec(h))) return verPersona('@' + m[1] + '@', m[2] || 'datos');
  if (h === '/ajustes') return ajustes();
  return verBuscar();
}

function verBuscar() {
  document.title = 'Árbol · Buscar';
  const e = estadoBusqueda;
  pantalla(`<div class="buscador">
    <div class="filtros">
      <label>Lugar<input id="f-lugar" value="${esc(e.lugar || '')}" placeholder="Ferrol, Corrubedo…"></label>
      <label>Desde<input id="f-desde" inputmode="numeric" value="${esc(e.desde ?? '')}" placeholder="1600"></label>
      <label>Hasta<input id="f-hasta" inputmode="numeric" value="${esc(e.hasta ?? '')}" placeholder="1800"></label>
      <label>Línea<select id="f-linea"><option value="">Todo el árbol</option>
        <option value="@I1@"${e.linea === '@I1@' ? ' selected' : ''}>Antepasados de Edmundo</option>
        <option value="@I2528@"${e.linea === '@I2528@' ? ' selected' : ''}>Antepasados de Diana</option></select></label>
    </div>
    <div id="res"></div>
    ${!e.q && !e.lugar && !e.linea ? `<div class="inicio"><p>Escribe arriba cualquier trozo de nombre o apellido. No importan las tildes ni la ortografía (b/v, y/i, h…).</p>
      <p><a class="tarjeta-enlace" href="#/p/I1">Edmundo Fraga López</a> <a class="tarjeta-enlace" href="#/p/I2528">Diana Rodríguez Fernández</a></p>
      <p class="peq">${arbol.personas.size.toLocaleString('es')} personas · ${arbol.familias.size.toLocaleString('es')} familias</p></div>` : ''}
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
  main.innerHTML = `<div class="persona">${familia(arbol, id)}<section class="detalle">${detalle(arbol, id, pestana)}</section></div>`;
  main.dataset.persona = id;
  if (antes) window.scrollTo(0, y); else window.scrollTo(0, 0);
  const { docs, sueltas } = citas(arbol, id);
  main.querySelectorAll('[data-fotos]').forEach(b => b.onclick = () => {
    const k = b.dataset.fotos;
    const lista = k === 'sueltas' ? sueltas : b.dataset.todas ? docs[k].todas : docs[k].fotos;
    galeria($('#gal' + k), lista, docs[k]?.fuente);
  });
  main.querySelectorAll('[data-md]').forEach(b => b.onclick = () => verTexto(b.dataset.md, b.textContent));
}

// ---------- Fotos y transcripciones (se piden a Dropbox solo al mirarlas) ----------

const IMG = /^(jpe?g|png|gif|tiff?|bmp|webp|heic)$/;

async function galeria(caja, lista, fuente) {
  if (caja.dataset.lista === String(lista.length) && caja.innerHTML) { caja.innerHTML = ''; caja.dataset.lista = ''; return; }
  caja.dataset.lista = String(lista.length);
  const MAX = 60;
  caja.innerHTML = lista.slice(0, MAX).map((m, i) => `<button class="mini" data-i="${i}" title="${esc(m.titulo)}">${IMG.test(m.form) ? '<span class="cargando"></span>' : `<span class="ext">${esc(m.form || '?')}</span>`}<small>${esc(m.titulo)}</small></button>`).join('')
    + (lista.length > MAX ? `<p class="peq">Se muestran ${MAX} de ${lista.length}. Abre una y pasa con las flechas.</p>` : '');
  caja.querySelectorAll('.mini').forEach(b => b.onclick = () => visor(lista, +b.dataset.i, fuente));
  // Miniaturas de pocas en pocas, para no saturar la conexión del móvil.
  const botones = [...caja.querySelectorAll('.mini')];
  let siguiente = 0;
  const trabajar = async () => {
    while (siguiente < botones.length) {
      const b = botones[siguiente], m = lista[siguiente++];
      if (!IMG.test(m.form)) continue;
      if (!m.ruta) { b.querySelector('span').outerHTML = '<span class="ext">sin ruta</span>'; continue; }
      try { const u = await almacen.miniatura(m.ruta); b.querySelector('span').outerHTML = `<img src="${esc(u)}" alt="">`; }
      catch (e) { b.querySelector('span').outerHTML = `<span class="ext" title="${esc(e.message)}">${e.noExiste ? 'no está' : 'error'}</span>`; }
    }
  };
  trabajar(); trabajar(); trabajar();
}

function candidatosTranscripcion(m, fuente) {
  const c = [];
  if (m.ruta) {
    const sin = m.ruta.replace(/\.[^./]+$/, '.md');
    if (/^\/Genealogia\//i.test(sin)) c.push('/Genealogia_2/03_transcripciones/' + sin.slice('/Genealogia/'.length));
    else if (/^\/Genealogia_2\//i.test(sin)) c.push('/Genealogia_2/03_transcripciones/' + sin.slice('/Genealogia_2/'.length));
  }
  if (fuente?.transcripcion && /\.md$/.test(fuente.transcripcion) && !fuente.transcripcion.includes('*')) c.push('/Genealogia_2/' + fuente.transcripcion);
  return [...new Set(c)];
}

async function visor(lista, i, fuente) {
  const capa = $('#visor');
  capa.hidden = false; document.body.classList.add('con-visor');
  let zoom = 1;
  const mostrar = async () => {
    const m = lista[i];
    capa.innerHTML = `<div class="barra"><button data-a="cerrar" aria-label="Cerrar">✕</button>
        <span class="tit">${i + 1}/${lista.length} · ${esc(m.titulo)}</span>
        <button data-a="menos" aria-label="Alejar">−</button><button data-a="mas" aria-label="Acercar">+</button>
        <button data-a="ant" aria-label="Anterior"${i ? '' : ' disabled'}>‹</button><button data-a="sig" aria-label="Siguiente"${i < lista.length - 1 ? '' : ' disabled'}>›</button></div>
      <div class="lienzo"><p class="cargando">Pidiendo la imagen a Dropbox…</p></div>
      <div class="transc"><p class="peq">Buscando transcripción…</p></div>`;
    capa.querySelector('.barra').onclick = ev => {
      const a = ev.target.dataset.a;
      if (a === 'cerrar') cerrarVisor();
      else if (a === 'ant' && i > 0) { i--; mostrar(); }
      else if (a === 'sig' && i < lista.length - 1) { i++; mostrar(); }
      else if (a === 'mas' || a === 'menos') { zoom = Math.max(0.5, Math.min(6, zoom * (a === 'mas' ? 1.5 : 1 / 1.5))); const im = capa.querySelector('.lienzo img'); if (im) im.style.width = (zoom * 100) + '%'; }
    };
    const lienzo = capa.querySelector('.lienzo'), tr = capa.querySelector('.transc');
    if (!m.ruta) lienzo.innerHTML = `<p class="aviso">No sé dónde está este archivo en Dropbox: ${esc(m.file)}</p>`;
    else almacen.enlace(m.ruta).then(u => {
      if (lista[i] !== m) return;
      lienzo.innerHTML = IMG.test(m.form) ? `<img src="${esc(u)}" alt="${esc(m.titulo)}" style="width:${zoom * 100}%">`
        : `<p><a class="boton" href="${esc(u)}" target="_blank" rel="noopener">Abrir ${esc(m.form.toUpperCase())}</a></p>`;
    }).catch(e => { lienzo.innerHTML = `<p class="aviso">${esc(e.message)}</p>`; });
    for (const ruta of candidatosTranscripcion(m, fuente)) {
      try {
        const t = await almacen.texto(ruta);
        if (lista[i] !== m) return;
        tr.innerHTML = `<p class="peq">${esc(ruta)}</p><div class="md">${md(t)}</div>`; return;
      } catch (e) { if (!e.noExiste) { tr.innerHTML = `<p class="aviso">${esc(e.message)}</p>`; return; } }
    }
    if (lista[i] === m) tr.innerHTML = '<p class="peq">Sin transcripción de esta imagen.</p>';
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
  try { capa.querySelector('.transc').innerHTML = `<p class="peq">${esc(ruta)}</p><div class="md">${md(await almacen.texto(ruta))}</div>`; }
  catch (e) { capa.querySelector('.transc').innerHTML = `<p class="aviso">${esc(e.message)}</p>`; }
}

// ---------- Ajustes ----------

function ajustes() {
  document.title = 'Árbol · Ajustes';
  const f = info.fecha ? new Date(info.fecha).toLocaleString('es') : '';
  pantalla(`<div class="caja">
    <h2>Ajustes</h2>
    <p><b>Archivos:</b> ${almacen.tipo === 'local' ? 'los de este ordenador (servidor local)' : 'Dropbox'}</p>
    <p><b>GEDCOM:</b> <code>${esc(info.ruta)}</code><br>${(info.tam / 1e6).toFixed(2)} MB · ${esc(info.cod)} · ${arbol.personas.size} personas${f ? ' · modificado en Dropbox el ' + esc(f) : ''}
      ${info.sinConexion ? '<br><b>Sin conexión: estás viendo la copia guardada en este aparato.</b>' : ''}</p>
    <label>Ruta del GEDCOM en Dropbox<input id="ruta" value="${esc(LS.get('ruta') || RUTAS.gedcom)}"></label>
    <p><button id="g-ruta">Guardar ruta y recargar</button> <button id="recargar">Volver a leer el GEDCOM</button></p>
    <p class="peq">Dirección de vuelta para la app de Dropbox: <code>${esc(urlRedireccion())}</code></p>
    <hr>
    ${almacen.tipo === 'dropbox' ? '<button id="salir">Desconectar este aparato de Dropbox</button>' : '<button id="salir">Dejar de usar los archivos locales</button>'}
    <p class="peq">Fase 1: solo lectura. Esta versión no escribe nada en Dropbox.</p>
  </div>`);
  $('#g-ruta').onclick = () => { LS.set('ruta', $('#ruta').value.trim() || null); location.hash = '#/'; location.reload(); };
  $('#recargar').onclick = () => { location.hash = '#/'; location.reload(); };
  $('#salir').onclick = async () => {
    if (almacen.tipo === 'dropbox') { if (!confirm('¿Desconectar este aparato? Tendrás que volver a dar permiso.')) return; await almacen.desconectar(); }
    LS.set('modo', null); location.hash = '#/'; location.reload();
  };
}

// ---------- Cabecera ----------

$('#q').value = estadoBusqueda.q || '';
$('#q').addEventListener('input', lanzar);
$('#q').addEventListener('focus', () => { if (!$('#res')) location.hash = '#/buscar'; });
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#q').blur(); } });

arrancar();
