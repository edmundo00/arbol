// Pantallas: resultados de búsqueda, vista de familia, datos, notas y documentos de cada persona.
import { hijo, hijos, valor, textoLargo } from './gedcom.js?v=202611072151';
import { fechaES, vida, nombreCompleto, anios, miles } from './modelo.js?v=202611072151';
import { esc } from './md.js?v=202611072151';
import { pruebasDe, resumenPruebas, cronologia, ES_TAREA } from './investigar.js?v=202611072151';

export function insignias(arbol, id) {
  return arbol.raices.map(({ id: r, letra, nombre: quien }) => {
    const n = arbol.ahnentafel(r).get(id);
    return n ? `<span class="ahn" title="Antepasado n.º ${n.map(miles).join(', ')} de ${esc(quien)}">${esc(letra)}&nbsp;${n.slice(0, 2).map(miles).join(' · ')}${n.length > 2 ? '…' : ''}</span>` : '';
  }).join('');
}

export function tarjeta(arbol, id, { grande = false, rol = '' } = {}) {
  const p = arbol.p(id);
  if (!p) return `<div class="tarjeta vacia">${esc(rol || 'Desconocido')}</div>`;
  const lugar = p.nac?.lugar || p.def?.lugar || '';
  const n = p.nombre ? `${esc(p.nombre)} <b>${esc(p.apellidos)}</b>` : `<b>${esc(p.apellidos || '(sin nombre)')}</b>`;
  return `<a class="tarjeta s${p.sexo}${grande ? ' grande' : ''}" href="#/p/${p.id.slice(1, -1)}">
    ${rol ? `<span class="rol">${esc(rol)}</span>` : ''}
    <span class="nom">${n}${p.sufijo ? ' ' + esc(p.sufijo) : ''}</span>
    <span class="vida">${esc(vida(p))}${lugar ? ` · ${esc(lugar)}` : ''}</span>
    <span class="insig">${insignias(arbol, p.id)}</span></a>`;
}

export function resultados(arbol, r) {
  if (!r.lista.length) return '<p class="aviso">No hay nadie con esos datos. Prueba con menos letras o quita algún filtro.</p>';
  return `<p class="cuenta">${r.total} persona${r.total === 1 ? '' : 's'}${r.total > r.lista.length ? ` (se muestran ${r.lista.length})` : ''}</p>
    <div class="lista">${r.lista.map(p => tarjeta(arbol, p.id)).join('')}</div>`;
}

const rol = (p, h, m) => p?.sexo === 'F' ? m : p?.sexo === 'M' ? h : `${h}/${m}`;

// Vista de familia, como en FamilySearch: la persona y sus cónyuges con los hijos; los padres y los hermanos.
export function familia(arbol, id, editando = false) {
  const p = arbol.p(id);
  const padres = arbol.padres(id);
  const boton = (accion, texto, fam = '') => editando ? `<button class="mas" data-accion="${accion}"${fam ? ` data-fam="${esc(fam)}"` : ''}>${texto}</button>` : '';
  const quitar = (accion, datos, titulo) => editando ? `<button class="quitar" data-accion="${accion}" ${Object.entries(datos).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} title="${esc(titulo)}" aria-label="${esc(titulo)}">✕</button>` : '';
  const conQuitar = (html, boton) => editando && boton ? `<div class="con-quitar">${html}${boton}</div>` : html;
  const hueco = (rolTxt, accion) => editando ? `<div class="tarjeta vacia">${boton(accion, '+ Añadir ' + rolTxt)}</div>` : tarjeta(arbol, null, { rol: rolTxt[0].toUpperCase() + rolTxt.slice(1) + (rolTxt === 'madre' ? ' desconocida' : ' desconocido') });
  const bloquePadres = padres.length ? padres.map(f => `
      <div class="pareja">${f.marido ? tarjeta(arbol, f.marido, { rol: 'Padre' }) : hueco('padre', 'padre')}${f.mujer ? tarjeta(arbol, f.mujer, { rol: 'Madre' }) : hueco('madre', 'madre')}</div>
      ${matrimonio(f)}${editando ? `<p class="botones">${quitar('quitar-padres', { fam: f.id }, 'No son sus padres: quitarla de esta familia').replace('>✕<', '>✕ No son sus padres<')}</p>` : ''}`).join('')
    : `<div class="pareja">${hueco('padre', 'padre')}${hueco('madre', 'madre')}</div>`;
  const hermanos = arbol.hermanos(id).sort(porNacimiento(arbol));
  const conyuges = p.fams.map(fid => arbol.f(fid)).filter(Boolean).map(f => {
    const otro = f.marido === id ? f.mujer : f.marido;
    const ch = [...f.hijos].sort(porNacimiento(arbol));
    return `<div class="union">
      ${conQuitar(tarjeta(arbol, otro, { rol: otro ? rol(arbol.p(otro), 'Marido', 'Mujer') : 'Cónyuge desconocido' }), otro && quitar('quitar-conyuge', { fam: f.id, otro }, 'Quitar este matrimonio'))}
      ${matrimonio(f)}${editando ? boton('boda', '✎ Boda', f.id) : ''}
      ${ch.length ? `<div class="hijos"><h4>Hijos (${ch.length})</h4>${ch.map(c => conQuitar(tarjeta(arbol, c), quitar('quitar-hijo', { fam: f.id, hijo: c }, 'No es hijo de esta pareja'))).join('')}</div>` : '<p class="nada">Sin hijos registrados</p>'}
      ${boton('hijo', '+ Añadir hijo', f.id)}
    </div>`;
  }).join('');
  return `<div class="familia${editando ? ' editando' : ''}">
    <section class="col-padres"><h3>Padres</h3>${bloquePadres}
      ${hermanos.length ? `<details class="hermanos"${hermanos.length <= 6 ? ' open' : ''}><summary>Hermanos (${hermanos.length})</summary>${hermanos.map(h => tarjeta(arbol, h)).join('')}</details>` : ''}
    </section>
    <section class="col-centro">${tarjeta(arbol, id, { grande: true })}
      ${editando ? `<p class="botones">${boton('editar', '✎ Editar sus datos')}${boton('partida', '📜 Alta desde una partida…')}${boton('fusionar', '⇆ Fusionar con otra ficha…')}${boton('borrar', '🗑 Borrar')}</p>` : ''}
      ${conyuges ? `<h3>Cónyuges e hijos</h3>${conyuges}` : '<p class="nada">Sin cónyuges registrados</p>'}
      ${editando ? `<p class="botones">${boton('conyuge', '+ Añadir cónyuge')}${p.fams.length ? '' : boton('hijo', '+ Añadir hijo (sin cónyuge)')}</p>` : ''}
    </section>
  </div>`;
}

function matrimonio(f) {
  const m = f.eventos.find(e => e.tag === 'MARR');
  return m && (m.fecha || m.lugar) ? `<p class="boda">⚭ ${esc(fechaES(m.fecha))}${m.lugar ? ' · ' + esc(m.lugar) : ''}</p>` : '';
}

function porNacimiento(arbol) {
  const y = x => arbol.p(x)?.ymin ?? 9999;
  return (a, b) => y(a) - y(b);
}

// ---------- Datos, notas y documentos ----------

export const GRADO = { 3: 'A', 2: 'B', 1: 'C', 0: '?' };

export function media(arbol, nodo) {
  let n = nodo, id = null;
  if (/^@[^@]+@$/.test(nodo.valor)) { const r = arbol.registro(nodo.valor); if (!r) return null; n = r.arbol; id = nodo.valor; }
  const file = valor(n, '_FILE') || valor(n, 'FILE');
  return { id, titulo: valor(n, 'TITL') || file.split(/[\\/]/).pop(), file, ruta: file || null, reg: valor(n, 'REFN'), form: (valor(n, 'FORM') || file.split('.').pop() || '').toLowerCase() };
}

export function fuente(arbol, x) {
  const r = arbol.registro(x);
  if (!r) return { id: x, titulo: x, objs: [] };
  const a = r.arbol, nota = hijos(a, 'NOTE').map(n => arbol.notaTexto(n)).join('\n');
  const campo = k => (new RegExp('^' + k + ':\\s*(.*)$', 'm').exec(nota) || [])[1] || '';
  return { id: x, titulo: valor(a, 'TITL') || valor(a, 'ABBR') || x, publ: valor(a, 'PUBL'), autor: valor(a, 'AUTH'),
           refn: valor(a, 'REFN'), nota, objs: hijos(a, 'OBJE').map(o => media(arbol, o)).filter(Boolean),
           transcripciones: (() => { const l = hijos(a, '_TRANS').map(n => n.valor).filter(t => /\.md$/.test(t)); const t = campo('Transcripción'); return l.length ? l : /\.md$/.test(t) && !t.includes('*') ? [t] : []; })(),
           ficha: campo('Ficha'), texto: textoLargo(hijo(a, 'TEXT') || { valor: '', hijos: [] }) };
}

// «img. 015, 021» o «img. 003–005» → [15, 21] o [3, 4, 5]
function numerosDeImagen(pagina) {
  const m = /\bimg\.?\s*([\d\s,–-]+)/i.exec(pagina || ''), out = [];
  if (!m) return out;
  for (const t of m[1].split(',')) {
    const [a, b] = t.split(/[–-]/).map(x => parseInt(x, 10));
    if (isNaN(a)) continue;
    if (isNaN(b) || b < a || b - a > 500) out.push(a); else for (let k = a; k <= b; k++) out.push(k);
  }
  return out;
}
const numeroDeImagen = titulo => numerosDeImagen(/\bimg\.[^—]*$/i.exec(titulo || '')?.[0])[0];
const baseDeArchivo = r => r.trim().split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/ \(claude\)$/i, '').toLowerCase();
const etiquetaPagina = m => /\bimg\.[^—]*$/i.exec(m.titulo || '')?.[0].trim() || (m.ruta || m.titulo || '').split(/[\\/]/).pop();

// Todas las citas de una persona (las suyas y las de sus hechos), agrupadas por fuente.
export function citas(arbol, id) {
  const a = arbol.registro(id).arbol, grupos = new Map();
  const ver = (n, hecho) => {
    for (const h of n.hijos) {
      if (h.tag === 'SOUR') {
        const x = /^@[^@]+@$/.test(h.valor) ? h.valor : null;
        const k = x || 'txt:' + h.valor;
        if (!grupos.has(k)) grupos.set(k, { fuente: x ? fuente(arbol, x) : { id: null, titulo: h.valor, objs: [] }, citas: [] });
        grupos.get(k).citas.push({ hecho, pagina: valor(h, 'PAGE'), grado: valor(h, 'QUAY'), nota: hijos(h, 'NOTE').map(nn => arbol.notaTexto(nn)).join(' · '), reg: valor(h, '_REG') });
      } else if (n === a && h.tag !== 'NOTE' && h.tag !== 'OBJE') ver(h, h.tag);
    }
  };
  ver(a, null);
  const objs = hijos(a, 'OBJE').map(o => media(arbol, o)).filter(Boolean);
  const usados = new Set();
  const docs = [...grupos.values()].map(g => {
    const regs = new Set(g.citas.map(c => c.reg).filter(Boolean).map(r => 'reg:' + r));
    if (g.fuente.refn) regs.add(g.fuente.refn);
    const mias = objs.filter(o => o.reg && regs.has(o.reg));
    mias.forEach(o => usados.add(o));
    // Las páginas citadas: las fotos enlazadas a la persona y las que dice la cita («img. 015, 021»)
    const nums = new Set(g.citas.flatMap(c => numerosDeImagen(c.pagina)));
    const rutas = new Set(mias.map(o => o.ruta));
    const citadas = [...mias, ...g.fuente.objs.filter(o => !rutas.has(o.ruta) && nums.has(numeroDeImagen(o.titulo)))];
    const fotos = citadas.length ? citadas : g.fuente.objs;
    // Su transcripción, la que se llama como la foto; sin página citada, no se elige ninguna
    const parcial = citadas.length > 0 && citadas.length < g.fuente.objs.length;
    const bases = new Set(citadas.map(o => baseDeArchivo(o.ruta || '')));
    const transCitadas = parcial ? (g.fuente.transcripciones || []).filter(t => bases.has(baseDeArchivo(t))) : [];
    return { ...g, fotos, todas: g.fuente.objs, parcial, transCitadas };
  });
  docs.sort((x, y) => (y.citas.some(c => c.reg) - x.citas.some(c => c.reg)) || Math.max(...y.citas.map(c => +c.grado || 0)) - Math.max(...x.citas.map(c => +c.grado || 0)));
  return { docs, sueltas: objs.filter(o => !usados.has(o)) };
}

const ETQ_HECHO = { BIRT: 'nacimiento', CHR: 'bautismo', BAPM: 'bautismo', DEAT: 'defunción', BURI: 'entierro', MARR: 'matrimonio', RESI: 'residencia', OCCU: 'oficio', WILL: 'testamento', NAME: 'nombre' };

export function detalle(arbol, id, pestana, editando = false) {
  const p = arbol.p(id), r = arbol.registro(id);
  const { docs, sueltas } = citas(arbol, id);
  const nodosNota = hijos(r.arbol, 'NOTE');
  const notas = nodosNota.map(n => arbol.notaTexto(n)).filter(Boolean);
  const nDocs = docs.length + (sueltas.length ? 1 : 0);
  const pest = (k, t) => `<a class="pest${pestana === k ? ' activa' : ''}" href="#/p/${id.slice(1, -1)}/${k}">${t}</a>`;
  let cuerpo = '';
  if (pestana === 'notas') cuerpo = (nodosNota.length ? nodosNota.map((n, i) => `<div class="nota">${esc(arbol.notaTexto(n)).replace(/\n/g, '<br>')}
      ${ES_TAREA.test(arbol.notaTexto(n)) ? '<span class="tarea">tarea pendiente</span>' : ''}${editando ? `<p class="botones">${ES_TAREA.test(arbol.notaTexto(n)) ? `<button class="mas si" data-accion="tarea-hecha" data-nota="${i}">✓ Hecha</button>` : ''}<button class="mas" data-accion="nota" data-nota="${i}">✎ Cambiar</button><button class="mas" data-accion="borrar-nota" data-nota="${i}">✕ Quitar</button></p>` : ''}</div>`).join('') : '<p class="nada">Sin notas.</p>')
      + (editando ? '<p class="botones"><button class="mas" data-accion="nota">+ Añadir nota</button><button class="mas" data-accion="tarea">+ Añadir tarea pendiente</button></p>' : '');
  else if (pestana === 'docs') cuerpo = documentos(docs, sueltas) + (editando ? '<p class="botones"><button class="mas" data-accion="documento">+ Añadir documento (foto nueva)</button><button class="mas" data-accion="citar">+ Citar uno que ya está</button></p>' : '');
  else if (pestana === 'ged') cuerpo = `<div id="historial"></div><pre class="ged">${esc(r.texto())}</pre>`;
  else if (pestana === 'crono') cuerpo = cronologia(arbol, id);
  else if (pestana === 'menc') cuerpo = '<div id="menciones"><p class="cargando">Buscando en la base de nombres…</p></div>';
  else cuerpo = resumenPruebas(arbol, id) + hechos(arbol, p, editando);
  return `<nav class="pestanas">${pest('datos', 'Datos')}${pest('docs', `Documentos (${nDocs})`)}${pest('notas', `Notas (${notas.length})`)}${pest('menc', 'Menciones')}${pest('crono', 'Cronología')}${pest('ged', 'GEDCOM')}</nav>
    <div class="cuerpo">${cuerpo}</div>`;
}

function hechos(arbol, p, editando) {
  const y = e => anios(e.fecha)[0] ?? 99999;
  const pr = pruebasDe(arbol, p.id) || {};
  const LET = { 3: 'A', 2: 'B', 1: 'C', 0: '?' };
  const grado = tag => { const k = ['BIRT', 'CHR', 'BAPM'].includes(tag) ? 'nac' : ['DEAT', 'BURI'].includes(tag) ? 'muerte' : tag === 'MARR' ? 'boda' : null;
    return k ? (pr[k] == null ? ' <span class="grado gN" title="Sin documento">—</span>' : ` <span class="grado g${LET[pr[k]]}" title="${esc((pr.docs[k] || []).slice(0, 3).join(' · '))}">${LET[pr[k]]}</span>`) : ''; };
  const ed = (datos, quitar = true) => editando ? `<span class="ed">${`<button class="mas" data-accion="hecho" ${datos}>✎</button>`}${quitar ? `<button class="mas" data-accion="borrar-hecho" ${datos}>✕</button>` : ''}</span>` : '';
  const filas = [...p.eventos].sort((a, b) => y(a) - y(b)).map(e => {
    const notas = hijos(e.nodo, 'NOTE').map(n => arbol.notaTexto(n)).filter(Boolean);
    const fuentes = hijos(e.nodo, 'SOUR').map(s => /^@/.test(s.valor) ? fuente(arbol, s.valor).titulo : s.valor);
    return `<div class="hecho"><span class="et">${esc(e.etiqueta)}${e.tipo ? ' (' + esc(e.tipo) + ')' : ''}${grado(e.tag)}</span>
      <span class="dato">${esc(fechaES(e.fecha))}${e.fecha && e.lugar ? ' · ' : ''}${esc(e.lugar)}${e.valor ? `${e.fecha || e.lugar ? ' · ' : ''}${esc(e.valor)}` : ''}</span>
      ${notas.map(n => `<span class="nh">${esc(n).replace(/\n/g, '<br>')}</span>`).join('')}
      ${fuentes.length ? `<span class="fh">Fuente: ${fuentes.map(esc).join(' · ')}</span>` : ''}${ed(`data-ev="${p.eventos.indexOf(e)}"`)}</div>`;
  });
  const otros = p.otros.length ? `<div class="hecho"><span class="et">Otros nombres</span><span class="dato">${p.otros.map(esc).join(' · ')}</span></div>` : '';
  const fams = p.fams.map(f => arbol.f(f)).filter(Boolean).flatMap(f => f.eventos.filter(e => e.tag !== 'MARR' || e.fecha || e.lugar).map(e => {
    const otro = arbol.p(f.marido === p.id ? f.mujer : f.marido);
    return `<div class="hecho"><span class="et">${esc(e.etiqueta)}${otro ? ' con ' + esc(nombreCompleto(otro)) : ''}${grado(e.tag)}</span><span class="dato">${esc(fechaES(e.fecha))}${e.fecha && e.lugar ? ' · ' : ''}${esc(e.lugar)}</span>${ed(`data-fam="${esc(f.id)}" data-fev="${f.eventos.indexOf(e)}"`)}</div>`;
  }));
  const ids = `<div class="hecho"><span class="et">Identificador</span><span class="dato">${esc(p.id)}</span></div>`;
  return (filas.join('') + fams.join('') + otros + ids || '<p class="nada">Sin datos.</p>')
    + (editando ? '<p class="botones"><button class="mas" data-accion="hecho">+ Añadir hecho (bautismo, oficio, residencia…)</button></p>' : '');
}

function documentos(docs, sueltas) {
  if (!docs.length && !sueltas.length) return '<p class="nada">Sin documentos enlazados todavía.</p>';
  const bloque = (d, k) => {
    const f = d.fuente;
    const grado = Math.max(...d.citas.map(c => +c.grado).filter(n => !isNaN(n)), -1);
    const paginas = d.parcial ? d.fotos.map(etiquetaPagina).join(', ') : '';
    const trans = d.parcial ? d.transCitadas : f.transcripciones;
    const nombreTrans = t => trans.length === 1 ? (d.parcial ? `Transcripción (${esc(paginas)})` : 'Transcripción') : esc(t.split('/').pop().replace(/\.md$/, ''));
    return `<article class="doc">
      <h4>${grado >= 0 ? `<span class="grado g${GRADO[grado]}" title="Grado de prueba">${GRADO[grado]}</span>` : ''}${esc(f.titulo)}</h4>
      ${f.publ ? `<p class="publ">${esc(f.publ)}</p>` : ''}
      <ul class="citas">${d.citas.map(c => `<li>${c.hecho ? `<i>${esc(ETQ_HECHO[c.hecho] || c.hecho)}:</i> ` : ''}${esc(c.nota || '')}${c.pagina ? ` <span class="pag">${esc(c.pagina)}</span>` : ''}</li>`).join('')}</ul>
      <div class="botones">
        ${d.fotos.length ? `<button data-fotos="${k}">📷 ${d.parcial ? `${d.fotos.length === 1 ? 'Foto' : 'Fotos'} (${esc(paginas)})` : `Fotos (${d.fotos.length})`}</button>` : ''}
        ${trans.slice(0, 12).map(t => `<button data-md="${esc(t)}">📜 ${nombreTrans(t)}</button>`).join('')}${trans.length > 12 ? `<span class="peq"> y ${trans.length - 12} transcripciones más</span>` : ''}
        ${d.parcial ? `<button class="mas" data-fotos="${k}" data-todas="1">Todo el documento (${d.todas.length} fotos)</button>` : ''}
        ${(f.ficha || '').split(/,\s*/).filter(x => /\.md$/.test(x)).map((x, i) => `<button data-md="${esc(x)}">🗂 Ficha${i ? ' ' + (i + 1) : ''}</button>`).join('')}
      </div>
      ${!d.parcial && d.todas.length > 1 ? `<p class="peq">Esta cita no dice en qué página está: se ve todo el documento.</p>` : ''}
      <div class="galeria" id="gal${k}"></div>
      ${f.nota ? `<details class="ndoc"><summary>Nota de la fuente</summary>${esc(f.nota).replace(/\n/g, '<br>')}</details>` : ''}
    </article>`;
  };
  return docs.map(bloque).join('') + (sueltas.length ? `<article class="doc"><h4>Otras fotos y archivos</h4>
      <div class="botones"><button data-fotos="sueltas">📷 Ver (${sueltas.length})</button></div><div class="galeria" id="galsueltas"></div></article>` : '');
}
