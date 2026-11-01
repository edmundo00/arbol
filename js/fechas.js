// Fechas escritas en español → fecha GEDCOM, y avisos de imposibles (las reglas de 00_control/scripts/auditar_gedcom.py).
import { anios } from './modelo.js?v=202611011155';

const MESES = { ene: 'JAN', enero: 'JAN', feb: 'FEB', febrero: 'FEB', mar: 'MAR', marzo: 'MAR', abr: 'APR', abril: 'APR',
  may: 'MAY', mayo: 'MAY', jun: 'JUN', junio: 'JUN', jul: 'JUL', julio: 'JUL', ago: 'AUG', agosto: 'AUG',
  sep: 'SEP', sept: 'SEP', septiembre: 'SEP', setiembre: 'SEP', oct: 'OCT', octubre: 'OCT', nov: 'NOV', noviembre: 'NOV',
  dic: 'DEC', diciembre: 'DEC', jan: 'JAN', apr: 'APR', aug: 'AUG', dec: 'DEC' };
const NUM = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Una fecha simple: «1974», «6 mar 1974», «6 de marzo de 1974», «6/3/1974», «marzo 1974».
function simple(t) {
  t = t.trim().toLowerCase().replace(/\bde\b/g, ' ').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  let m;
  if ((m = /^(\d{3,4})$/.exec(t))) return m[1];
  if ((m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{3,4})$/.exec(t))) {
    const d = +m[1], mes = +m[2];
    if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
    return `${d} ${NUM[mes]} ${m[3]}`;
  }
  if ((m = /^(\d{1,2})[/-](\d{3,4})$/.exec(t)) && +m[1] >= 1 && +m[1] <= 12) return `${NUM[+m[1]]} ${m[2]}`;
  if ((m = /^(\d{1,2}) ([a-z]+) (\d{3,4})$/.exec(t)) && MESES[m[2]] && +m[1] >= 1 && +m[1] <= 31) return `${+m[1]} ${MESES[m[2]]} ${m[3]}`;
  if ((m = /^([a-z]+) (\d{3,4})$/.exec(t)) && MESES[m[1]]) return `${MESES[m[1]]} ${m[2]}`;
  // Ya en GEDCOM: «6 MAR 1974»
  if ((m = /^(\d{1,2} )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec) (\d{3,4})$/.exec(t))) return `${m[1] || ''}${m[2].toUpperCase()} ${m[3]}`;
  return null;
}

// Devuelve { ged, error }. Vacío → { ged: '' }.
export function aGedcom(texto) {
  const t = (texto || '').trim();
  if (!t) return { ged: '' };
  const l = t.toLowerCase();
  let m;
  if ((m = /^(?:entre|bet)\s+(.+?)\s+(?:y|and|-)\s+(.+)$/.exec(l))) {
    const a = simple(m[1]), b = simple(m[2]);
    return a && b ? { ged: `BET ${a} AND ${b}` } : { error: 'No entiendo alguna de las dos fechas de «entre … y …».' };
  }
  const prefijos = [[/^(?:h\.?|hacia|c\.?|ca\.?|circa|aprox\.?|aproximadamente|abt)\s*/, 'ABT'], [/^(?:antes de|ant\.?|bef)\s*/, 'BEF'],
    [/^(?:después de|despues de|desp\.?|aft)\s*/, 'AFT'], [/^(?:calc\.?|calculada|cal)\s*/, 'CAL'], [/^(?:est\.?|estimada)\s*/, 'EST']];
  for (const [re, ged] of prefijos) {
    if (re.test(l)) {
      const s = simple(l.replace(re, ''));
      return s ? { ged: `${ged} ${s}` } : { error: 'No entiendo la fecha que va detrás.' };
    }
  }
  const s = simple(l);
  return s ? { ged: s } : { error: 'No entiendo la fecha. Ejemplos: 1750 · 6 mar 1974 · 6/3/1974 · h. 1750 · antes de 1733 · entre 1700 y 1710' };
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
