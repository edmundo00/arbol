// Base de nombres y lugares (9 Sistema/Control/nombres_lugares.db, la genera 9 Sistema/Control/scripts/nombres_lugares.py).
// Se lee del disco con sql.js, que va dentro del programa (vendor/sqljs): no hace falta internet.
// sql.js no trae FTS5, así que en vez de la tabla «buscar» se consulta la columna «clave» de cada tabla:
// da lo mismo que 9 Sistema/Control/scripts/buscar_nombres.py.

// ---------- Clave fonética: la misma que clave_palabra() de nombres_lugares.py ----------
export const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'del', 'la', 'las', 'los', 'y', 'e', 'i', 'd', 'lo', 'a', 'o', 'as', 'os']);
export const TRATAMIENTOS = new Set(['don', 'dona', 'dna', 'dn', 'sr', 'sra', 'senor', 'senora', 'fray', 'frai', 'br', 'lic', 'licdo', 'ldo', 'dr', 'dª', 'da.', 'sor', 'mosen', 'padre', 'p']);
const PILA = { josef: 'jose', josep: 'jose', jph: 'jose', joan: 'juan', jan: 'juan', manoel: 'manuel', elisabet: 'isabel', elizabet: 'isabel',
  isabela: 'isabel', ieronimo: 'jeronimo', domingos: 'domingo', bieito: 'benito', pero: 'pedro', jakobo: 'santiago', iago: 'santiago',
  xpobal: 'kristobal', krisptobal: 'kristobal', maruja: 'maria', ma: 'maria', fko: 'franzisko', ant: 'antonio', anto: 'antonio',
  bertolameu: 'bartolome', lourenzo: 'lorenzo', afonso: 'alfonso', alonso: 'alfonso', ilfonso: 'alfonso', estebo: 'esteban',
  estebon: 'esteban', bernaldo: 'bernardo', ruy: 'rodrigo', rui: 'rodrigo', gomes: 'gomez', pelaio: 'pelayo', xoan: 'juan' };

export const plano = t => t.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase();

export function clavePalabra(w) {
  w = plano(w.toLowerCase().replace(/ç/g, 'z')).replace(/[^a-z]/g, '');
  if (!w) return '';
  w = w.replace(/ph/g, 'f').replace(/th/g, 't').replace(/xpt/g, 'krist').replace(/christ/g, 'krist');
  w = w.replace(/y(?![aeiou])/g, 'i');
  w = w.replace(/(?<!c)h/g, '');
  w = w.replace(/[vw]/g, 'b');
  w = w.replace(/gu(?=[ei])/g, 'g').replace(/g(?=[ei])/g, 'j').replace(/x/g, 'j');
  w = w.replace(/qu(?=[ei])/g, 'k').replace(/q/g, 'k');
  w = w.replace(/c(?=[ei])/g, 'z').replace(/c(?!h)/g, 'k');
  w = w.replace(/(.)\1+/g, '$1');
  return PILA[w] ?? w;
}

const memoClave = new Map();
export function tokensClave(texto, quitar = true) {
  const out = [];
  for (const w of (texto || '').replace(/ª/g, 'a').replace(/º/g, 'o').match(/\p{L}+/gu) || []) {
    if (quitar && PARTICULAS.has(plano(w))) continue;
    let k = memoClave.get(w);   // las palabras se repiten mucho: buscar por lugar trocea decenas de miles de contextos
    if (k === undefined) { k = clavePalabra(w); memoClave.set(w, k); }
    if (k) out.push(k);
  }
  return out;
}

// Texto del usuario → condiciones sobre una columna «clave» (todas las palabras, en cualquier orden; «Ferr*» por el comienzo).
function condiciones(texto, columna) {
  const conds = [], params = [];
  for (const m of texto.match(/\p{L}+\*?/gu) || []) {
    const pref = m.endsWith('*'), w = m.replace(/\*$/, '');
    if (PARTICULAS.has(plano(w)) || TRATAMIENTOS.has(plano(w))) continue;
    const k = clavePalabra(w);
    if (!k) continue;
    conds.push(`(' ' || ${columna} || ' ') LIKE ?`);
    params.push(pref ? `% ${k}%` : `% ${k} %`);
  }
  return { sql: conds.join(' AND '), params };
}

// Nombre de pila y apellidos por separado. En la clave, el nombre de pila va delante (los tratamientos ya se quitaron):
// la 1.ª palabra del nombre tiene que ser la 1.ª de la clave; los apellidos, cualquier palabra salvo la 1.ª.
function palabras(texto) {
  const out = [];
  for (const m of (texto || '').match(/\p{L}+\*?/gu) || []) {
    const pref = m.endsWith('*'), w = m.replace(/\*$/, '');
    if (PARTICULAS.has(plano(w)) || TRATAMIENTOS.has(plano(w))) continue;
    const k = clavePalabra(w);
    if (k) out.push({ k, pref });
  }
  return out;
}
function condicionesNA(nombre, apellidos, col) {
  const conds = [], params = [];
  palabras(nombre).forEach(({ k, pref }, i) => {
    if (i === 0) { conds.push(`(${col} || ' ') LIKE ?`); params.push(pref ? `${k}%` : `${k} %`); }
    else { conds.push(`(' ' || ${col} || ' ') LIKE ?`); params.push(pref ? `% ${k}%` : `% ${k} %`); }
  });
  for (const { k, pref } of palabras(apellidos)) {
    conds.push(`(' ' || ${col} || ' ') LIKE ? AND (${col} || ' ') NOT LIKE ?`);
    params.push(pref ? `% ${k}%` : `% ${k} %`, pref ? `${k}%` : `${k} %`);
  }
  return { sql: conds.join(' AND '), params };
}

// Fiabilidad del enlace de una mención con una persona del árbol (columna «enlace»).
export function fiabilidad(enlace) {
  if (!enlace) return 'ninguno';
  if (/^cita|n\.º en el texto|xref en el texto|^cabecera/.test(enlace)) return 'seguro';
  if (/^nombre/.test(enlace)) return 'pista';
  return 'ninguno';
}

// ---------- sql.js, cargado una sola vez desde vendor/ ----------
let motor = null;
async function sqljs() {
  if (motor) return motor;
  if (!window.initSqlJs) await new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/sqljs/sql-wasm.js', import.meta.url).href;
    s.onload = ok; s.onerror = () => mal(new Error('No se ha podido cargar el lector de bases de datos (vendor/sqljs).'));
    document.head.appendChild(s);
  });
  motor = await window.initSqlJs({ locateFile: f => new URL('../vendor/sqljs/' + f, import.meta.url).href });
  return motor;
}

const ORDEN_ORIGEN = `CASE d.origen WHEN 'registro' THEN 0 WHEN 'transcripcion' THEN 1 WHEN 'gedcom' THEN 3 WHEN 'gedcom_notas' THEN 3 WHEN 'arbol' THEN 4 ELSE 2 END`;

export class BaseNombres {
  constructor(db, nombre, fecha) { this.db = db; this.nombre = nombre; this.fecha = fecha; }

  static async abrir(bytes, nombre, fecha) {
    const SQL = await sqljs();
    const db = new SQL.Database(bytes);
    const b = new BaseNombres(db, nombre, fecha);
    const tablas = new Set(b.filas("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name));
    for (const t of ['menciones', 'documentos', 'personas_gedcom', 'lugares']) if (!tablas.has(t)) { db.close(); throw new Error(`«${nombre}» no es la base de nombres y lugares: le falta la tabla «${t}».`); }
    return b;
  }
  cerrar() { try { this.db.close(); } catch {} }

  filas(sql, params = []) {
    const st = this.db.prepare(sql), out = [];
    try { st.bind(params); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); }
    return out;
  }

  info() { try { return Object.fromEntries(this.filas('SELECT clave, valor FROM info').map(r => [r.clave, r.valor])); } catch { return {}; } }

  // Ficha de una persona: menciones enlazadas por xref y posibles por nombre (sin enlace).
  menciones(xref, limite = 400) {
    const sel = `SELECT m.*, d.titulo, d.ruta, d.ruta_original, d.origen, d.fecha AS dfecha, d.anio AS danio, d.reg_id, d.transcripcion
      FROM menciones m JOIN documentos d ON d.id = m.doc_id`;
    const enlazadas = this.filas(`${sel} WHERE m.xref = ? ORDER BY ${ORDEN_ORIGEN}, IFNULL(m.anio, d.anio), d.ruta LIMIT ?`, [xref, limite]);
    const p = this.filas('SELECT clave FROM personas_gedcom WHERE xref = ?', [xref])[0];
    const posibles = p?.clave ? this.filas(`${sel} WHERE m.clave = ? AND m.xref IS NULL ORDER BY ${ORDEN_ORIGEN}, IFNULL(m.anio, d.anio), d.ruta LIMIT ?`, [p.clave, limite]) : [];
    return { enlazadas, posibles };
  }

  // Años de cada documento del registro, sacados de sus transcripciones (el registro casi nunca trae fecha propia).
  aniosRegistro() {
    if (!this._aniosReg) {
      this._aniosReg = new Map();
      for (const r of this.filas("SELECT reg_id, anio FROM documentos WHERE origen = 'transcripcion' AND anio IS NOT NULL AND IFNULL(reg_id, '') != ''")) {
        if (!this._aniosReg.has(r.reg_id)) this._aniosReg.set(r.reg_id, []);
        this._aniosReg.get(r.reg_id).push(r.anio);
      }
    }
    return this._aniosReg;
  }
  // Documentos con un lugar propio (cabecera, transcripción enlazada o carpeta), no solo un lugar nombrado en el texto.
  docsConLugar() {
    return this._docsLugar ??= new Set(this.filas("SELECT DISTINCT doc_id FROM doc_lugares WHERE origen != 'texto'").map(r => r.doc_id));
  }

  // ¿Dónde aparece…? Devuelve todas las coincidencias con el nombre, ya clasificadas y ordenadas: nada se corta aquí.
  // Cada resultado lleva _g (ver GRUPO) y _p.notas, que dicen por qué está en ese grupo.
  donde(texto, { desde = null, hasta = null, lugar = '', nombre = '', apellidos = '', ...otros } = {}) {
    const na = (nombre || apellidos) && !texto;
    const cp = na ? condicionesNA(nombre, apellidos, 'clave') : condiciones(texto, 'clave');
    const cm = na ? condicionesNA(nombre, apellidos, 'm.clave') : condiciones(texto, 'm.clave');
    const vacio = { personas: [], menciones: [], lugares: [] };
    if (!cp.sql) return vacio;
    const quien = (na ? [...palabras(nombre), ...palabras(apellidos)] : palabras(texto)).map(x => x.pref ? null : x.k);
    const exacto = quien.includes(null) ? null : quien.join(' ');   // «María Fernández» antes que «María Rosa Fernández»
    const hayFecha = desde != null || hasta != null;
    const lq = palabrasLugar(lugar), hayLugar = lq.length > 0;
    const lc = hayLugar ? condiciones(lugar, 'clave') : null;
    const lugares = hayLugar ? this.filas(`SELECT * FROM lugares WHERE ${lc.sql} ORDER BY n_eventos + n_documentos DESC`, lc.params) : [];
    const marca = lugares.map(() => '?').join(',');
    // Personas del árbol: sus años de vida y sus lugares salen de sus hechos.
    const hechos = new Map();
    if (hayFecha || hayLugar) for (const e of this.filas(`SELECT e.xref, e.anio, e.lugar FROM eventos_gedcom e JOIN personas_gedcom p ON p.xref = e.xref WHERE ${cp.sql.replaceAll('clave', 'p.clave')}`, cp.params)) {
      if (!hechos.has(e.xref)) hechos.set(e.xref, []);
      hechos.get(e.xref).push(e);
    }
    const personas = this.filas(`SELECT * FROM personas_gedcom WHERE ${cp.sql}`, cp.params);
    for (const p of personas) {
      const ev = hechos.get(p.xref) || [], notas = [];
      const f = hayFecha ? estadoVida(p, ev, desde, hasta) : 'na';
      if (f === 'sin') notas.push('sin fechas');
      const lug = !hayLugar ? 'na' : ev.some(e => e.lugar && contieneLugar(e.lugar, lq)) ? 'si' : ev.some(e => e.lugar) ? 'no' : 'sin';
      if (lug === 'sin') notas.push('sin lugar');
      p._g = grupo(f, lug); p._p = { n: 0, notas };
      p._rango = [p.clave === exacto ? 0 : 1, p.anio_nac ?? p.anio_def ?? 9999];
    }
    // Menciones en documentos
    const dl = new Map();
    if (lugares.length) for (const r of this.filas(`SELECT doc_id, MIN(origen) AS como FROM doc_lugares WHERE lugar_id IN (${marca}) GROUP BY doc_id`, lugares.map(l => l.id))) dl.set(r.doc_id, r.como);
    const conLugar = hayLugar ? this.docsConLugar() : null, regs = hayFecha ? this.aniosRegistro() : null;
    const menciones = this.filas(`SELECT m.*, d.titulo, d.ruta, d.ruta_original, d.origen, d.fecha AS dfecha, d.anio AS danio, d.reg_id, d.transcripcion, d.tipo AS dtipo,
      p.nombre AS enlazado FROM menciones m JOIN documentos d ON d.id = m.doc_id LEFT JOIN personas_gedcom p ON p.xref = m.xref
      WHERE ${cm.sql}`, cm.params);
    for (const m of menciones) {
      const notas = [];
      const f = hayFecha ? estadoFecha(m, desde, hasta, regs) : { e: 'na' };
      if (f.nota) notas.push(f.nota);
      const l = hayLugar ? estadoLugar(m, lq, dl, conLugar) : { e: 'na' };
      if (l.nota) notas.push(l.nota);
      const x = estadosOtros(m, otros);
      for (const o of x) if (o.nota) notas.push(o.nota);
      m._g = grupo(f.e, l.e, ...x.map(o => o.e)); m._p = { n: m._g === GRUPO.CUMPLE ? 1 : m._g === GRUPO.FUERA ? -1 : 0, notas };
      m._rango = [m.clave === exacto ? 0 : 1, f.fuerte === false || l.fuerte === false ? 1 : 0, ORDEN[m.origen] ?? 2,
        m.anio ?? m.danio ?? 9999, m.ruta || ''];
    }
    return { personas: personas.sort(porRango), menciones: menciones.sort(porRango), lugares, filtros: hayFecha || hayLugar || hayOtros(otros) };
  }

  // Archivos que hay en la base, para el desplegable (carpetas de 2 Documentos, y la Biblioteca).
  archivos() {
    if (!this._archivos) {
      const c = new Map();
      for (const d of this.filas('SELECT ruta_original, transcripcion, ruta FROM documentos')) {
        const a = archivoDe(d);
        if (a) c.set(a, (c.get(a) || 0) + 1);
      }
      this._archivos = [...c.keys()].sort((a, b) => a.localeCompare(b, 'es'));
    }
    return this._archivos;
  }

  // ¿Quién hay en el lugar…? (sin nombre). Con años, lo que no tiene fecha no se esconde: va en su grupo.
  enLugar(texto, { desde = null, hasta = null, ...otros } = {}) {
    const c = condiciones(texto, 'clave');
    if (!c.sql) return { lugares: [], eventos: [], menciones: [] };
    const lugares = this.filas(`SELECT * FROM lugares WHERE ${c.sql} ORDER BY n_eventos + n_documentos DESC`, c.params);
    if (!lugares.length) return { lugares, eventos: [], menciones: [] };
    const ids = lugares.map(l => l.id), marca = ids.map(() => '?').join(',');
    const hayFecha = desde != null || hasta != null, regs = hayFecha ? this.aniosRegistro() : null;
    const eventos = this.filas(`SELECT e.tipo, e.fecha, e.anio, e.lugar, p.xref, p.nombre, p.anio_nac, p.anio_def, p.ahnentafel, p.ahnentafel_diana
      FROM eventos_gedcom e JOIN personas_gedcom p ON p.xref = e.xref
      WHERE e.lugar_id IN (${marca}) ORDER BY e.anio IS NULL, e.anio, p.nombre`, ids);
    for (const e of eventos) e._g = grupo(!hayFecha ? 'na' : e.anio == null ? 'sin' : (desde == null || e.anio >= desde) && (hasta == null || e.anio <= hasta) ? 'si' : 'no', 'na');
    const filas = this.filas(`SELECT m.*, d.titulo, d.ruta, d.ruta_original, d.origen, d.transcripcion, d.reg_id, d.anio AS danio, d.tipo AS dtipo, p.nombre AS enlazado, MIN(l.origen) AS como
      FROM doc_lugares l JOIN documentos d ON d.id = l.doc_id JOIN menciones m ON m.doc_id = d.id LEFT JOIN personas_gedcom p ON p.xref = m.xref
      WHERE l.lugar_id IN (${marca}) GROUP BY m.id ORDER BY como, IFNULL(m.anio, d.anio) IS NULL, IFNULL(m.anio, d.anio), d.ruta`, ids);
    // El lugar en la cabecera de una transcripción vale para todo el documento; en texto libre solo cuenta la persona
    // si el lugar sale en su contexto.
    const claves = lugares.map(l => ' ' + l.clave + ' ');
    const menciones = [];
    for (const m of filas) {
      if (m.como === 'texto') {
        const ctx = ' ' + tokensClave(m.contexto || '').join(' ') + ' ';
        if (!claves.some(k => ctx.includes(k))) continue;
      }
      const f = hayFecha ? estadoFecha(m, desde, hasta, regs) : { e: 'na' };
      const x = estadosOtros(m, otros);
      m._g = grupo(f.e, ...x.map(o => o.e)); m._p = { n: m._g === GRUPO.CUMPLE ? 1 : m._g === GRUPO.FUERA ? -1 : 0, notas: [f.nota, ...x.map(o => o.nota)].filter(Boolean) };
      menciones.push(m);
    }
    menciones.sort((a, b) => a._g - b._g);   // estable: dentro de cada grupo sigue el orden de la consulta
    return { lugares, eventos, menciones, filtros: hayFecha || hayOtros(otros) };
  }
}

// ---------- Filtros de lugar y año: cómo queda cada resultado ----------
// Grupos: 0 cumple todo lo pedido · 1 cumple lo que consta, falta el otro dato · 2 no consta ningún dato de lo pedido · 3 lo contradice.
export const GRUPO = { CUMPLE: 0, PARCIAL: 1, SIN_DATO: 2, FUERA: 3 };
const ORDEN = { transcripcion: 0, registro: 0, gedcom: 3, gedcom_notas: 3, arbol: 4 };
const porRango = (a, b) => {
  if (a._g !== b._g) return a._g - b._g;
  for (let i = 0; i < a._rango.length; i++) {
    const x = a._rango[i], y = b._rango[i];
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};
export function grupo(...estados) {
  const v = estados.filter(e => e !== 'na');
  if (v.includes('no')) return GRUPO.FUERA;
  if (v.every(e => e === 'si')) return GRUPO.CUMPLE;
  return v.includes('si') ? GRUPO.PARCIAL : GRUPO.SIN_DATO;
}

// Años escritos en un texto, sin confundirlos con páginas, folios, legajos ni números de orden.
const RX_ANIO = /(?<!\b(?:pp?|p[aá]gs?|fols?|folios?|leg|legajos?|caja|n\.?\s?[º°o]|n[uú]m)\.?\s*)(?<![\d/.,])(1[1-9]\d\d|20[0-2]\d)(?![\d,]|\.\d)/gi;
export const aniosEnTexto = t => [...new Set([...String(t || '').matchAll(RX_ANIO)].map(x => +x[1]))];
const dentro = (y, desde, hasta) => (desde == null || y >= desde) && (hasta == null || y <= hasta);
const solapa = (a, b, desde, hasta) => (desde == null || b >= desde) && (hasta == null || a <= hasta);

// Año de una mención: el de su fecha o la de su documento; si no hay, el escrito junto al nombre, y si no, el del documento enlazado.
function estadoFecha(m, desde, hasta, regs) {
  if (m.origen === 'arbol') {               // árbol antiguo: el contexto dice nacimiento y muerte, vale toda la vida
    const ys = aniosEnTexto(m.contexto);
    if (m.anio != null) ys.push(m.anio);
    if (!ys.length) return { e: 'sin', nota: 'sin fecha' };
    const a = Math.min(...ys), b = Math.max(...ys) === a ? a + 90 : Math.max(...ys);
    return solapa(a, b, desde, hasta) ? { e: 'si', nota: `vida ${a}–${b}` } : { e: 'no', nota: `vida ${a}–${b}: fuera de los años pedidos` };
  }
  const ff = aniosEnTexto(m.fecha);          // «1640-1660»: un periodo vale entero
  const propios = ff.length ? ff : m.anio != null ? [m.anio] : m.danio != null ? [m.danio] : [];
  if (propios.length) {
    const a = Math.min(...propios), b = Math.max(...propios), t = a === b ? String(a) : `${a}–${b}`;
    return solapa(a, b, desde, hasta) ? { e: 'si', nota: `año ${t}` } : { e: 'no', nota: `año ${t}: fuera de los años pedidos` };
  }
  const leidos = aniosEnTexto(m.contexto).length ? aniosEnTexto(m.contexto)
    : ['registro', 'transcripcion'].includes(m.origen) ? aniosEnTexto(m.titulo) : [];
  if (leidos.length) {
    const hay = leidos.filter(y => dentro(y, desde, hasta));
    return hay.length ? { e: 'si', nota: `año ${hay.join(', ')} en el texto`, fuerte: false } : { e: 'no', nota: `año ${leidos.slice(0, 4).join(', ')} en el texto: fuera de los años pedidos` };
  }
  const reg = (m.reg_id && regs.get(m.reg_id)) || [];
  if (reg.length) {
    const hay = reg.filter(y => dentro(y, desde, hasta));
    return hay.length ? { e: 'si', nota: `año ${hay.join(', ')} en su transcripción`, fuerte: false } : { e: 'no', nota: `año ${reg.slice(0, 4).join(', ')} en su transcripción: fuera de los años pedidos` };
  }
  return { e: 'sin', nota: 'sin fecha' };
}

function palabrasLugar(t) {
  const out = [];
  for (const m of String(t || '').match(/\p{L}+\*?/gu) || []) {
    const pref = m.endsWith('*'), w = m.replace(/\*$/, '');
    if (PARTICULAS.has(plano(w))) continue;
    const k = clavePalabra(w);
    if (k) out.push({ k, pref });
  }
  return out;
}
const cacheTok = new Map();
function tok(t) {
  let r = cacheTok.get(t);
  if (!r) { if (cacheTok.size > 200000) cacheTok.clear(); r = tokensClave(t); cacheTok.set(t, r); }
  return r;
}
const contieneLugar = (t, q) => { const ks = tok(t); return q.every(({ k, pref }) => ks.some(x => pref ? x.startsWith(k) : x === k)); };

// Lugar de una mención: su propio lugar, el contexto, el título o los lugares del documento.
function estadoLugar(m, q, dl, conLugar) {
  if (m.lugar && contieneLugar(m.lugar, q)) return { e: 'si', nota: `lugar: ${m.lugar.split(';').find(x => contieneLugar(x, q))?.trim() || m.lugar}` };
  if (m.contexto && contieneLugar(m.contexto, q)) return { e: 'si', nota: 'lugar en el texto', fuerte: false };
  const como = dl.get(m.doc_id);
  if (como && como !== 'texto') return { e: 'si', nota: 'lugar del documento' };
  if (['registro', 'transcripcion'].includes(m.origen) && contieneLugar(m.titulo || '', q)) return { e: 'si', nota: 'lugar en el título' };
  if (m.lugar) return { e: 'no', nota: `lugar: ${m.lugar}` };
  if (conLugar.has(m.doc_id)) return { e: 'no', nota: 'el documento es de otro lugar' };
  if (como) return { e: 'sin', nota: 'el lugar sale en el documento, pero no junto al nombre' };
  return { e: 'sin', nota: 'sin lugar' };
}

// ---------- Tipo de documento ----------
// El tipo se escribió a mano en cada transcripción («defunción (partida de sepultura)», «pleito (ejecutoria)»…): estos grupos lo reúnen.
// Un documento puede ser de dos («pleito criminal con probanza de hidalguía»). «no» excluye lo que se parece sin serlo: una escritura de censo es un préstamo.
export const TIPOS = [
  { nom: 'Bautismo o nacimiento', rx: /bautism|bautiz|bautis(?!ta)|nacimiento/i },
  { nom: 'Matrimonio', rx: /matrimonio|boda|velaci|capitulaciones/i },
  { nom: 'Defunción o entierro', rx: /defunci|entierro|enterramiento|sepultura|esquela/i },
  { nom: 'Testamento', rx: /testament|codicilo|[uú]ltimas voluntades/i },
  { nom: 'Partición o herencia', rx: /parti[cj]i?|hijuela|herencia|inventario/i, no: /partida/i },
  { nom: 'Escritura notarial', rx: /escritura|compraventa|venta|notarial|protocolo|foro|poder|donaci|dote|censo de|mejora/i, no: /padr[oó]n/i },
  { nom: 'Pleito', rx: /pleito|ejecutoria|querella|memorial|demanda|alegaci/i },
  { nom: 'Hidalguía y nobleza', rx: /hidalg|nobleza|limpieza|[oó]rdenes?_?\s?militar|her[aá]ldica/i },
  { nom: 'Catastro de Ensenada', rx: /catastro|ensenada/i },
  { nom: 'Padrón o censo de población', rx: /padr[oó]n|censo|vecindario/i, no: /escritura|censo de/i },
  { nom: 'Prensa y esquelas', rx: /prensa|esquela|peri[oó]dico/i },
];
const conTipo = o => ['registro', 'transcripcion'].includes(o);
const tipoGenerico = t => /^(documento|sin clasificar|nota|notas.*|)$/i.test(String(t || '').trim());
const encaja = (c, t) => c.rx.test(t) && !(c.no && c.no.test(t));
function estadoTipo(m, tipo) {
  if (!tipo) return { e: 'na' };
  const c = TIPOS.find(x => x.nom === tipo);
  if (!conTipo(m.origen)) return { e: 'sin', nota: 'sin tipo de documento' };   // libros, fichas y notas: no consta
  if (!tipoGenerico(m.dtipo)) return encaja(c, m.dtipo) ? { e: 'si', nota: `tipo: ${m.dtipo}` } : { e: 'no', nota: `tipo: ${m.dtipo}` };
  // Sin tipo escrito: lo dice el título o el nombre del archivo («fernandez_maria_defuncion»).
  const t = `${m.titulo || ''} ${(m.transcripcion || m.ruta_original || '').split('|')[0].split('/').pop()}`;
  if (encaja(c, t)) return { e: 'si', nota: 'tipo por el título', fuerte: false };
  return TIPOS.some(x => encaja(x, t)) ? { e: 'no', nota: 'su título es de otro tipo' } : { e: 'sin', nota: 'sin tipo de documento' };
}

// ---------- Archivo de procedencia: lo dice la carpeta (2 Documentos/<archivo>/…) ----------
function archivoDe(d) {
  for (const r of [d.ruta_original, d.transcripcion, d.ruta]) {
    const p = String(r || '').split('|')[0].split('/');
    if (p[0] === '2 Documentos' && p.length > 2 && !p[1].startsWith('_')) return p[1];
    if (p[0] === '7 Biblioteca') return 'Biblioteca (publicado)';
  }
  return null;
}
function estadoArchivo(m, archivo) {
  if (!archivo) return { e: 'na' };
  const a = archivoDe(m);
  if (!a) return { e: 'sin', nota: 'sin archivo' };
  return a === archivo ? { e: 'si', nota: `archivo: ${a}` } : { e: 'no', nota: `archivo: ${a}` };
}

// ---------- Papel de la persona en el documento, y lo que el documento tiene ----------
export const PAPELES_DOC = [
  { nom: 'Difunto o difunta', rx: /difunt|fallecid|enterrad|muert/i },
  { nom: 'Novio o novia', rx: /novi[oa]|contrayente|c[oó]nyuge|espos[oa]|marido|mujer/i },
  { nom: 'Bautizado o nacido', rx: /bautizad|nacid/i },
  { nom: 'Padre o madre', rx: /padre|madre/i, no: /padrino/i },
  { nom: 'Hijo o hija', rx: /hij[oa]/i },
  { nom: 'Padrino o madrina', rx: /padrino|madrina/i },
  { nom: 'Testigo', rx: /testig/i },
  { nom: 'Otorgante o parte de un pleito', rx: /otorgante|testador|vendedor|comprador|demandante|demandad|litigante|pleiteante/i },
];
const IMAGEN_DOC = /\.(jpe?g|png|gif|tiff?|bmp|webp)$/i;
const hayOtros = o => !!(o.tipo || o.archivo || o.papel || o.ancestros || o.conFoto || o.transcrito || o.enlazado);
function estadosOtros(m, o) {
  const out = [estadoTipo(m, o.tipo), estadoArchivo(m, o.archivo)];
  if (o.papel) {
    const c = PAPELES_DOC.find(x => x.nom === o.papel), p = String(m.papel || '').trim();
    if (!p || /^(texto|extracto|persona del [aá]rbol)$/i.test(p)) out.push({ e: 'sin', nota: 'sin papel' });
    else out.push(c.rx.test(p) && !(c.no && c.no.test(p)) ? { e: 'si', nota: `papel: ${p.slice(0, 40)}` } : { e: 'no', nota: `papel: ${p.slice(0, 40)}` });
  }
  if (o.ancestros) out.push(!m.xref ? { e: 'sin', nota: 'sin enlace al árbol' } : o.ancestros.has(m.xref) ? { e: 'si', nota: 'es de esa línea' } : { e: 'no', nota: 'no es de esa línea' });
  if (o.conFoto) out.push(IMAGEN_DOC.test(String(m.ruta_original || '').split('|')[0].trim()) ? { e: 'si' } : { e: 'no', nota: 'sin foto' });
  if (o.transcrito) out.push(m.transcripcion ? { e: 'si' } : { e: 'no', nota: 'sin transcribir' });
  if (o.enlazado) out.push(m.xref ? { e: 'si' } : { e: 'no', nota: 'sin enlace al árbol' });
  return out;
}

// Años de vida de una persona del árbol, con lo que haya: nacimiento, muerte u otros hechos.
function estadoVida(p, ev, desde, hasta) {
  const ys = ev.map(e => e.anio).filter(y => y != null);
  const ini = p.anio_nac ?? (p.anio_def != null ? p.anio_def - 90 : ys.length ? Math.min(...ys) - 60 : null);
  const fin = p.anio_def ?? (p.anio_nac != null ? p.anio_nac + 90 : ys.length ? Math.max(...ys) + 60 : null);
  if (ini == null) return 'sin';
  return solapa(ini, fin, desde, hasta) ? 'si' : 'no';
}
