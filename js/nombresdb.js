// Base de nombres y lugares (00_control/nombres_lugares.db, la genera 00_control/scripts/nombres_lugares.py).
// Se lee del disco con sql.js, que va dentro del programa (vendor/sqljs): no hace falta internet.
// sql.js no trae FTS5, así que en vez de la tabla «buscar» se consulta la columna «clave» de cada tabla:
// da lo mismo que 00_control/scripts/buscar_nombres.py.

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

export function tokensClave(texto, quitar = true) {
  const out = [];
  for (const w of (texto || '').replace(/ª/g, 'a').replace(/º/g, 'o').match(/\p{L}+/gu) || []) {
    if (quitar && PARTICULAS.has(plano(w))) continue;
    const k = clavePalabra(w);
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

  // ¿Dónde aparece…? (como donde() de buscar_nombres.py)
  donde(texto, { desde = null, hasta = null, limite = 300 } = {}) {
    const cp = condiciones(texto, 'clave'), cm = condiciones(texto, 'm.clave');
    if (!cp.sql) return { personas: [], menciones: [] };
    const personas = this.filas(`SELECT * FROM personas_gedcom WHERE ${cp.sql}
      AND (? IS NULL OR COALESCE(anio_def, anio_nac + 90, 9999) >= ?) AND (? IS NULL OR COALESCE(anio_nac, anio_def - 90, 0) <= ?)
      ORDER BY anio_nac LIMIT 500`, [...cp.params, desde, desde, hasta, hasta]);
    const menciones = this.filas(`SELECT m.*, d.titulo, d.ruta, d.ruta_original, d.origen, d.fecha AS dfecha, d.reg_id, d.transcripcion,
      p.nombre AS enlazado FROM menciones m JOIN documentos d ON d.id = m.doc_id LEFT JOIN personas_gedcom p ON p.xref = m.xref
      WHERE ${cm.sql} AND (? IS NULL OR COALESCE(m.anio, d.anio, 9999) >= ?) AND (? IS NULL OR COALESCE(m.anio, d.anio, 0) <= ?)
      ORDER BY ${ORDEN_ORIGEN}, IFNULL(m.anio, d.anio), d.ruta LIMIT ?`, [...cm.params, desde, desde, hasta, hasta, limite]);
    return { personas, menciones };
  }

  // ¿Quién hay en el lugar…? (como en_lugar() de buscar_nombres.py)
  enLugar(texto, { desde = null, hasta = null, limite = 400 } = {}) {
    const c = condiciones(texto, 'clave');
    if (!c.sql) return { lugares: [], eventos: [], menciones: [] };
    const lugares = this.filas(`SELECT * FROM lugares WHERE ${c.sql} ORDER BY n_eventos + n_documentos DESC`, c.params);
    if (!lugares.length) return { lugares, eventos: [], menciones: [] };
    const ids = lugares.map(l => l.id), marca = ids.map(() => '?').join(',');
    const eventos = this.filas(`SELECT e.tipo, e.fecha, e.anio, e.lugar, p.xref, p.nombre, p.anio_nac, p.anio_def, p.ahnentafel, p.ahnentafel_diana
      FROM eventos_gedcom e JOIN personas_gedcom p ON p.xref = e.xref
      WHERE e.lugar_id IN (${marca}) AND (? IS NULL OR e.anio >= ?) AND (? IS NULL OR e.anio <= ?)
      ORDER BY e.anio, p.nombre LIMIT ?`, [...ids, desde, desde, hasta, hasta, limite]);
    const filas = this.filas(`SELECT m.nombre, m.papel, m.fecha, m.xref, m.enlace, m.contexto, d.titulo, d.ruta, d.ruta_original, d.origen, d.transcripcion,
      IFNULL(m.anio, d.anio) AS anio, MIN(l.origen) AS como
      FROM doc_lugares l JOIN documentos d ON d.id = l.doc_id JOIN menciones m ON m.doc_id = d.id
      WHERE l.lugar_id IN (${marca}) AND (? IS NULL OR IFNULL(m.anio, d.anio) >= ?) AND (? IS NULL OR IFNULL(m.anio, d.anio) <= ?)
      GROUP BY m.id ORDER BY como, IFNULL(m.anio, d.anio), d.ruta`, [...ids, desde, desde, hasta, hasta]);
    // El lugar en la cabecera de una transcripción vale para todo el documento; en texto libre solo cuenta la persona
    // si el lugar sale en su contexto.
    const claves = lugares.map(l => ' ' + l.clave + ' ');
    const menciones = [];
    for (const m of filas) {
      if (m.como === 'texto') {
        const ctx = ' ' + tokensClave(m.contexto || '').join(' ') + ' ';
        if (!claves.some(k => ctx.includes(k))) continue;
      }
      menciones.push(m);
      if (menciones.length >= limite) break;
    }
    return { lugares, eventos, menciones };
  }
}
