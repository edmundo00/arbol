// Fechas escritas en español → fecha GEDCOM, y avisos de imposibles (las reglas de 9 Sistema/Control/scripts/auditar_gedcom.py).
import { anios } from './modelo.js?v=202611042026';

const MESES = { ene: 'JAN', enero: 'JAN', henero: 'JAN', xan: 'JAN', xaneiro: 'JAN', jan: 'JAN', january: 'JAN',
  feb: 'FEB', febrero: 'FEB', hebrero: 'FEB', febreiro: 'FEB', february: 'FEB', mar: 'MAR', marzo: 'MAR', march: 'MAR',
  abr: 'APR', abril: 'APR', apr: 'APR', april: 'APR', may: 'MAY', mayo: 'MAY', maio: 'MAY',
  jun: 'JUN', junio: 'JUN', xun: 'JUN', xuno: 'JUN', june: 'JUN', jul: 'JUL', julio: 'JUL', xul: 'JUL', xullo: 'JUL', july: 'JUL',
  ago: 'AUG', agosto: 'AUG', aug: 'AUG', august: 'AUG', sep: 'SEP', sept: 'SEP', septiembre: 'SEP', setiembre: 'SEP', setembro: 'SEP', september: 'SEP',
  oct: 'OCT', octubre: 'OCT', outubro: 'OCT', october: 'OCT', nov: 'NOV', noviembre: 'NOV', novembro: 'NOV', november: 'NOV',
  dic: 'DEC', diciembre: 'DEC', decembro: 'DEC', dec: 'DEC', december: 'DEC' };
const NUM = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ROMANOS = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Una fecha simple: «1974», «6 mar 1974», «6 de marzo de 1974», «6/3/1974», «6.3.1974», «4-VII-1734», «1734-07-04», «marzo 1974».
function simple(t) {
  t = sinTildes(t).trim().toLowerCase();
  let m;
  if ((m = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/.exec(t)) && +m[2] <= 12 && +m[2] >= 1 && +m[3] >= 1 && +m[3] <= 31) return `${+m[3]} ${NUM[+m[2]]} ${m[1]}`;
  t = t.replace(/\b(?:de|del|dia|el|ano)\b/g, ' ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if ((m = /^(\d{3,4})$/.exec(t))) return m[1];
  if ((m = /^(\d{1,2})[/\- ](\d{1,2})[/\- ](\d{3,4})$/.exec(t))) {
    const d = +m[1], mes = +m[2];
    if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
    return `${d} ${NUM[mes]} ${m[3]}`;
  }
  if ((m = /^(\d{1,2})[/\- ]([ivx]+)[/\- ](\d{3,4})$/.exec(t)) && ROMANOS[m[2]] && +m[1] >= 1 && +m[1] <= 31) return `${+m[1]} ${NUM[ROMANOS[m[2]]]} ${m[3]}`;
  if ((m = /^([ivx]+)[/\- ](\d{3,4})$/.exec(t)) && ROMANOS[m[1]]) return `${NUM[ROMANOS[m[1]]]} ${m[2]}`;
  if ((m = /^(\d{1,2})[/\- ](\d{3,4})$/.exec(t)) && +m[1] >= 1 && +m[1] <= 12) return `${NUM[+m[1]]} ${m[2]}`;
  if ((m = /^(\d{1,2})[ -]?([a-z]+)[ -]?(\d{3,4})$/.exec(t)) && MESES[m[2]] && +m[1] >= 1 && +m[1] <= 31) return `${+m[1]} ${MESES[m[2]]} ${m[3]}`;
  if ((m = /^([a-z]+) (\d{1,2}) (\d{3,4})$/.exec(t)) && MESES[m[1]] && +m[2] >= 1 && +m[2] <= 31) return `${+m[2]} ${MESES[m[1]]} ${m[3]}`;   // «july 4 1734»
  if ((m = /^([a-z]+)[ -]?(\d{3,4})$/.exec(t)) && MESES[m[1]]) return `${MESES[m[1]]} ${m[2]}`;
  return null;
}

const ROMANOS_SIGLO = { xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20, xxi: 21 };
// Lo que puede ir delante de la fecha. Cada palabra tiene que ser entera: «hacia» no es «h» + «acia».
const PREFIJOS = [
  ['ABT', ['aproximadamente', 'aproximado', 'aproximada', 'alrededor', 'approximately', 'approx', 'around', 'circa', 'cerca', 'sobre', 'hacia', 'about', 'aprox', 'abt', 'ca', 'h', 'c', '~', '±']],
  ['BEF', ['anterior', 'antes', 'before', 'ante', 'ant', 'bef', 'a', '<']],
  ['AFT', ['posterior', 'despues', 'after', 'desp', 'dsp', 'post', 'tras', 'aft', 'd', '>']],
  ['CAL', ['calculada', 'calculado', 'calc', 'cal']],
  ['EST', ['estimada', 'estimado', 'est']],
];
const RE_PREFIJOS = PREFIJOS.map(([ged, ps]) => [ged, new RegExp(`^(?:${ps.join('|')})(?![a-z])[.:]?\\s*(?:(?:de la|de|del|a la|a|el|ano|en)\\s+)*`)]);

// Devuelve { ged, error }. Vacío → { ged: '' }.
export function aGedcom(texto) {
  const t = (texto || '').trim();
  if (!t) return { ged: '' };
  let l = sinTildes(t).toLowerCase().replace(/\s+/g, ' ');
  let m;
  // Siglo: «s. XVIII», «siglo 18»
  if ((m = /^(?:s\.?|siglo) ?([ivxl]+|\d{1,2})$/.exec(l))) {
    const n = ROMANOS_SIGLO[m[1]] || +m[1];
    if (n >= 1 && n <= 21) return { ged: `BET ${(n - 1) * 100 + 1} AND ${n * 100}` };
  }
  // Periodos: «entre 1700 y 1710», «de 1700 a 1710», «desde 1700 hasta 1710», «between 1700 and 1710», «1700-1710», «1797/1800»
  m = /^(?:entre|between|bet\.?|bt\.?|btw\.?|desde|de|del|from)\s+(.+?)\s*(?:\s(?:y|e|and|a|al|hasta|to)\s|-|–)\s*(.+)$/.exec(l) || /^(\d{3,4})\s*(?:-|–|\/)\s*(\d{3,4})$/.exec(l);
  if (m) {
    const a = simple(m[1]), b = simple(m[2]);
    if (a && b) return { ged: `BET ${a} AND ${b}` };
    if (/^(?:entre|between|bet|bt)/.test(l)) return { error: 'No entiendo alguna de las dos fechas de «entre … y …».' };
  }
  // Una interrogación al final es una fecha dudosa: «1734?», «¿1734?»
  if (/\?$/.test(l)) { const s = simple(l.replace(/[¿?]/g, '')); if (s) return { ged: `ABT ${s}` }; }
  for (const [ged, re] of RE_PREFIJOS) {
    if (re.test(l)) {
      const s = simple(l.replace(re, ''));
      if (s) return { ged: `${ged} ${s}` };
    }
  }
  const s = simple(l);
  return s ? { ged: s } : { error: 'No entiendo la fecha. Ejemplos: 1750 · 6 mar 1974 · 6/3/1974 · 4-VII-1734 · h. 1750 · antes de 1733 · entre 1700 y 1710' };
}

// GEDCOM → como se escribe en el formulario
const ES = { JAN: 'ene', FEB: 'feb', MAR: 'mar', APR: 'abr', MAY: 'may', JUN: 'jun', JUL: 'jul', AUG: 'ago', SEP: 'sep', OCT: 'oct', NOV: 'nov', DEC: 'dic' };
export function aTexto(ged) {
  if (!ged) return '';
  let s = ged.replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g, x => ES[x]);
  s = s.replace(/^BET (.+) AND (.+)$/, 'entre $1 y $2').replace(/^ABT /, 'h. ').replace(/^BEF /, 'antes de ').replace(/^AFT /, 'después de ')
       .replace(/^CAL /, 'calc. ').replace(/^EST /, 'est. ');
  return s;
}

// Año de nacimiento a partir de la edad en una fecha: (1790, 45) → «h. 1745»
export function nacimientoPorEdad(fechaGed, edad) {
  const a = anios(fechaGed)[0];
  return a && edad >= 0 ? `h. ${a - edad}` : '';
}

const y = d => anios(d)[0] ?? null;

// Avisos para una persona con sus datos nuevos (nac y def en GEDCOM), sus padres y sus hijos.
export function avisos(arbol, { nac, def, padres = [], hijos = [], conyuges = [] }) {
  const out = [], b = y(nac), d = y(def);
  if (b && d && d < b) out.push(`Muere (${d}) antes de nacer (${b}).`);
  if (b && d && d - b > 105) out.push(`Viviría ${d - b} años.`);
  for (const p of padres) {
    if (!p) continue;
    const bp = y(p.nac?.fecha), dp = y(p.def?.fecha), rol = p.sexo === 'F' ? 'La madre' : 'El padre';
    if (b && bp) {
      const e = b - bp;
      if (e < 14) out.push(`${rol} (${p.nombre}) tendría ${e} años al nacer.`);
      else if (p.sexo === 'F' && e > 52) out.push(`La madre (${p.nombre}) tendría ${e} años al nacer.`);
      else if (p.sexo !== 'F' && e > 75) out.push(`El padre (${p.nombre}) tendría ${e} años al nacer.`);
    }
    if (b && dp && p.sexo === 'F' && b > dp) out.push(`Nacería (${b}) después de morir su madre (${dp}).`);
    if (b && dp && p.sexo !== 'F' && b > dp + 1) out.push(`Nacería (${b}) más de un año después de morir su padre (${dp}).`);
  }
  for (const h of hijos) {
    if (!h) continue;
    const bh = y(h.nac?.fecha);
    if (bh && b) {
      const e = bh - b;
      if (e < 14) out.push(`Tendría ${e} años al nacer su hijo ${h.nombre}.`);
    }
    if (bh && d && bh > d + 1) out.push(`Su hijo ${h.nombre} nacería (${bh}) después de su muerte (${d}).`);
  }
  for (const c of conyuges) if (c?.boda && b && y(c.boda) - b < 14) out.push(`Se casaría con ${y(c.boda) - b} años.`);
  return out;
}

// Posibles duplicados: mismo nombre y nacimiento a ±2 años (o sin fecha).
export function posiblesDuplicados(arbol, nombreClave, nac, excluir = new Set()) {
  const b = y(nac), out = [];
  for (const p of arbol.personas.values()) {
    if (excluir.has(p.id) || p.clave !== nombreClave) continue;
    const bp = p.nac ? y(p.nac.fecha) : null;
    if (!b || !bp || Math.abs(b - bp) <= 2) out.push(p);
    if (out.length >= 5) break;
  }
  return out;
}
