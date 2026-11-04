// Personas y familias sacadas del GEDCOM, listas para buscar y mostrar.
import { hijo, hijos, valor, textoLargo } from './gedcom.js?v=202611042026';
import { clave } from './buscar.js?v=202611042026';

export const EVENTOS = {
  BIRT: 'Nacimiento', CHR: 'Bautismo', BAPM: 'Bautismo', CONF: 'Confirmación', DEAT: 'Defunción', BURI: 'Entierro',
  MARR: 'Matrimonio', ENGA: 'Esponsales', DIV: 'Divorcio', RESI: 'Residencia', OCCU: 'Oficio', TITL: 'Título',
  EDUC: 'Estudios', EMIG: 'Emigración', IMMI: 'Inmigración', NATU: 'Naturalización', CENS: 'Padrón', WILL: 'Testamento',
  PROB: 'Herencia', RELI: 'Religión', NATI: 'Nacionalidad', GRAD: 'Graduación', RETI: 'Jubilación', EVEN: 'Hecho',
  FACT: 'Dato', ORDN: 'Ordenación', CREM: 'Incineración', ADOP: 'Adopción', DSCR: 'Descripción', PROP: 'Bienes',
  MILI: 'Servicio militar', _MILT: 'Servicio militar', _ATTR: 'Atributo', MARB: 'Amonestaciones', MARC: 'Capitulaciones',
};

const MESES = { JAN: 'ene', FEB: 'feb', MAR: 'mar', APR: 'abr', MAY: 'may', JUN: 'jun', JUL: 'jul', AUG: 'ago', SEP: 'sep', OCT: 'oct', NOV: 'nov', DEC: 'dic' };

// «ABT 1750» → «h. 1750»; «BET 1700 AND 1710» → «entre 1700 y 1710».
export function fechaES(d) {
  if (!d) return '';
  let s = d.trim();
  s = s.replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g, m => MESES[m]);
  s = s.replace(/^BET (.+) AND (.+)$/, 'entre $1 y $2').replace(/^FROM (.+) TO (.+)$/, 'de $1 a $2')
       .replace(/^ABT /, 'h. ').replace(/^CAL /, 'calc. ').replace(/^EST /, 'est. ')
       .replace(/^BEF /, 'antes de ').replace(/^AFT /, 'después de ').replace(/^FROM /, 'desde ').replace(/^TO /, 'hasta ')
       .replace(/^INT (.+) \((.*)\)$/, '$1 ($2)').replace(/@#DJULIAN@ /g, '(juliano) ');
  return s;
}

export function anios(d) {
  return (d || '').match(/\b\d{3,4}\b/g)?.map(Number) || [];
}

export function partirNombre(v) {
  const m = /^(.*?)\/(.*?)\/(.*)$/.exec(v || '');
  if (!m) return { nombre: (v || '').trim(), apellidos: '', sufijo: '' };
  return { nombre: m[1].trim(), apellidos: m[2].trim(), sufijo: m[3].trim() };
}

export class Arbol {
  constructor(ged) {
    this.ged = ged;
    this.personas = new Map();
    this.familias = new Map();
    for (const r of ged.registros) {
      if (r.tipo === 'INDI') this.personas.set(r.xref, this.persona(r));
      else if (r.tipo === 'FAM') this.familias.set(r.xref, this.familia(r));
    }
    this.lineas = {};
    this.raices = [];   // personas de referencia: [{id, letra, nombre}]
  }

  // Personas de referencia (las elige el usuario; por defecto, la primera del archivo).
  ponerRaices(ids) {
    const validos = ids.filter(id => this.p(id));
    if (!validos.length) { const r = this.ged.registros.find(r => r.tipo === 'INDI'); if (r) validos.push(r.xref); }
    const usadas = new Set();
    this.raices = validos.map(id => {
      const p = this.p(id), base = (p.nombre || p.apellidos || '?').normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase() || '?';
      let letra = base[0];
      for (let k = 2; usadas.has(letra) && k <= base.length; k++) letra = base.slice(0, k);
      usadas.add(letra);
      return { id, letra, nombre: nombreCompleto(p) };
    });
  }

  persona(r) {
    const a = r.arbol;
    const n = hijo(a, 'NAME');
    const { nombre, apellidos, sufijo } = partirNombre(n ? n.valor : '');
    const ev = this.eventos(a);
    const nac = ev.find(e => e.tag === 'BIRT') || ev.find(e => e.tag === 'CHR' || e.tag === 'BAPM');
    const def = ev.find(e => e.tag === 'DEAT') || ev.find(e => e.tag === 'BURI');
    const ys = ev.flatMap(e => anios(e.fecha));
    const lugares = [...new Set(ev.map(e => e.lugar).filter(Boolean))];
    const otros = hijos(a, 'NAME').slice(1).map(x => x.valor.replace(/\//g, '').trim());
    return {
      id: r.xref, nombre, apellidos, sufijo, otros,
      sexo: valor(a, 'SEX') || 'U',
      nac, def, eventos: ev, lugares,
      ymin: ys.length ? Math.min(...ys) : null, ymax: ys.length ? Math.max(...ys) : null,
      famc: hijos(a, 'FAMC').map(x => x.valor), fams: hijos(a, 'FAMS').map(x => x.valor),
      clave: clave([nombre, apellidos, sufijo, ...otros].join(' ')),
      claveN: clave(nombre), claveA: clave(apellidos),
      claveLugar: clave(lugares.join(' | ')),
    };
  }

  familia(r) {
    const a = r.arbol;
    return {
      id: r.xref, marido: valor(a, 'HUSB') || null, mujer: valor(a, 'WIFE') || null,
      hijos: hijos(a, 'CHIL').map(x => x.valor), eventos: this.eventos(a),
    };
  }

  eventos(a) {
    const out = [];
    for (const h of a.hijos) {
      if (!(h.tag in EVENTOS) && !(h.hijos.some(x => x.tag === 'DATE' || x.tag === 'PLAC') && !['NAME', 'SOUR', 'OBJE', 'NOTE'].includes(h.tag))) continue;
      out.push({ tag: h.tag, etiqueta: EVENTOS[h.tag] || h.tag, valor: h.valor, tipo: valor(h, 'TYPE'),
                 fecha: valor(h, 'DATE'), lugar: valor(h, 'PLAC'), nodo: h });
    }
    return out;
  }

  p(id) { return this.personas.get(id); }
  f(id) { return this.familias.get(id); }

  padres(id) {
    const p = this.p(id); if (!p) return [];
    return p.famc.map(f => this.f(f)).filter(Boolean);
  }
  hermanos(id) {
    const s = new Set();
    for (const f of this.padres(id)) for (const h of f.hijos) if (h !== id) s.add(h);
    return [...s];
  }

  // Números de Ahnentafel de todos los antepasados de una raíz: Map xref → [n, ...] (puede haber varios por consanguinidad).
  ahnentafel(raiz) {
    if (this.lineas[raiz]) return this.lineas[raiz];
    const m = new Map(), cola = [[raiz, 1]];
    while (cola.length) {
      const [x, n] = cola.shift();
      if (!this.p(x) || n > 2 ** 50) continue;
      if (!m.has(x)) m.set(x, []);
      const l = m.get(x);
      if (l.length >= 8) continue;
      l.push(n);
      const f = this.padres(x)[0];
      if (f) { if (f.marido) cola.push([f.marido, 2 * n]); if (f.mujer) cola.push([f.mujer, 2 * n + 1]); }
    }
    return (this.lineas[raiz] = m);
  }

  registro(id) { return this.ged.porXref.get(id); }
  notaTexto(nodo) {
    if (/^@[^@]+@$/.test(nodo.valor)) {
      const r = this.registro(nodo.valor);
      return r ? textoLargo(r.arbol) : '';
    }
    return textoLargo(nodo);
  }
}

export function vida(p) {
  if (!p) return '';
  const a = p.nac ? (anios(p.nac.fecha)[0] ?? '') : '', b = p.def ? (anios(p.def.fecha)[0] ?? '') : '';
  const pa = p.nac && /^(ABT|BEF|AFT|BET|CAL|EST)/.test(p.nac.fecha) ? 'h. ' : '';
  if (!a && !b) return p.def ? '† ?' : '';
  return `${pa}${a}${p.def || b ? '–' + b : ''}`;
}

export function nombreCompleto(p) {
  return p ? [p.nombre, p.apellidos, p.sufijo].filter(Boolean).join(' ') || '(sin nombre)' : '?';
}

// Números legibles: «536870912» → «536.870.912»; en las cifras de un millón o más, también en palabras.
export const miles = n => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export function enPalabras(n) {
  const r = (x, d) => x.toLocaleString('es-ES', { maximumFractionDigits: x < 10 ? d : 0 });
  if (n >= 1e12) return `${r(n / 1e12, 1)} billones`;
  if (n >= 1e9) return `${r(n / 1e9, 1)} mil millones`;
  if (n >= 1e6) return n < 2e6 && Math.round(n / 1e5) === 10 ? '1 millón' : `${r(n / 1e6, 1)} millones`;
  return '';
}
export const cifra = n => miles(n) + (n >= 1e6 ? ` (${enPalabras(n)})` : '');
