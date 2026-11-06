// Entiende lo escrito en el cuadro de arriba: «maria fernandez jubia 1731-1735 defunción» → nombre, apellidos, lugar, años y tipo.
// Lo que dude se ve después en los campos de la pestaña «En los documentos», donde se puede corregir.
import { buscar, clave } from './buscar.js?v=202611062159';
import { clavePalabra, plano, PARTICULAS, grupo } from './nombresdb.js?v=202611062159';

const TIPO_PALABRA = {
  bautismo: 'Bautismo o nacimiento', bautizo: 'Bautismo o nacimiento', nacimiento: 'Bautismo o nacimiento', bautismos: 'Bautismo o nacimiento',
  boda: 'Matrimonio', matrimonio: 'Matrimonio', casamiento: 'Matrimonio', matrimonios: 'Matrimonio',
  defuncion: 'Defunción o entierro', entierro: 'Defunción o entierro', muerte: 'Defunción o entierro', defunciones: 'Defunción o entierro',
  testamento: 'Testamento', testamentos: 'Testamento',
  particion: 'Partición o herencia', herencia: 'Partición o herencia', inventario: 'Partición o herencia',
  escritura: 'Escritura notarial', compraventa: 'Escritura notarial',
  pleito: 'Pleito', pleitos: 'Pleito',
  hidalguia: 'Hidalguía y nobleza',
  catastro: 'Catastro de Ensenada', ensenada: 'Catastro de Ensenada',
  padron: 'Padrón o censo de población', censo: 'Padrón o censo de población', padrones: 'Padrón o censo de población',
  prensa: 'Prensa y esquelas', esquela: 'Prensa y esquelas',
};

// Cuántas veces es cada palabra nombre de pila, apellido o lugar en el árbol: así se decide qué es cada una.
const diccionarios = new WeakMap();
function diccionario(arbol, lugares) {
  let d = diccionarios.get(arbol);
  if (d) return d;
  d = { pila: new Map(), ap: new Map(), lug: new Map() };
  const suma = (m, texto, n = 1) => { for (const w of String(texto || '').match(/\p{L}+/gu) || []) { if (PARTICULAS.has(plano(w))) continue; const k = clavePalabra(w); if (k) m.set(k, (m.get(k) || 0) + n); } };
  for (const p of arbol.personas.values()) { suma(d.pila, p.nombre); suma(d.ap, p.apellidos); }
  for (const l of lugares()) suma(d.lug, l.lugar.split(/[,(]/)[0], l.hechos);
  diccionarios.set(arbol, d);
  return d;
}

export function entender(texto, arbol, lugares) {
  const d = diccionario(arbol, lugares);
  let t = ` ${texto || ''} `;
  const r = { nombre: '', apellidos: '', lugar: '', desde: null, hasta: null, tipo: '', palabras: '' };
  // Años: «1731-1735», «1731 a 1735», dos sueltos o uno solo
  const rango = /(?<!\d)(\d{3,4})\s*(?:-|–|\/|\ba\b|\bal\b|\bhasta\b)\s*(\d{3,4})(?!\d)/i.exec(t);
  if (rango) { r.desde = Math.min(+rango[1], +rango[2]); r.hasta = Math.max(+rango[1], +rango[2]); t = t.replace(rango[0], ' '); }
  else {
    const ys = [...t.matchAll(/(?<!\d)\d{3,4}(?!\d)/g)].map(m => +m[0]);
    if (ys.length) { r.desde = Math.min(...ys); r.hasta = Math.max(...ys); t = t.replace(/(?<!\d)\d{3,4}(?!\d)/g, ' '); }
  }
  // Lugar escrito con «en»: «maria fernandez en san martin de jubia»
  const en = /\s(?:en)\s+(.+)$/i.exec(t);
  if (en) { r.lugar = en[1].trim(); t = t.slice(0, en.index) + ' '; }
  const pals = t.match(/\p{L}+\*?/gu) || [];
  const nombres = [];
  for (const w of pals) {
    const tipo = TIPO_PALABRA[plano(w)];
    if (tipo && !r.tipo) r.tipo = tipo; else nombres.push(w);
  }
  if (r.lugar && r.tipo === '') for (const w of r.lugar.match(/\p{L}+/gu) || []) { if (TIPO_PALABRA[plano(w)]) { r.tipo = TIPO_PALABRA[plano(w)]; r.lugar = r.lugar.replace(w, '').trim(); break; } }
  // Lugar sin «en»: las últimas palabras, si en el árbol son más lugar que nombre o apellido
  if (!r.lugar) {
    const lug = [];
    while (nombres.length) {
      const w = nombres[nombres.length - 1], k = clavePalabra(w.replace(/\*$/, ''));
      if (PARTICULAS.has(plano(w))) { if (lug.length) { nombres.pop(); continue; } break; }
      const n = d.lug.get(k) || 0;
      if (n > 0 && n > (d.ap.get(k) || 0) + (d.pila.get(k) || 0)) { lug.unshift(w); nombres.pop(); } else break;
    }
    r.lugar = lug.join(' ');
  }
  // Nombre: la primera palabra que sea más nombre de pila que apellido; lo demás, apellidos
  const quien = nombres.filter(w => !PARTICULAS.has(plano(w)));
  r.palabras = quien.join(' ');
  const i = quien.findIndex(w => { const k = clavePalabra(w.replace(/\*$/, '')); return (d.pila.get(k) || 0) > (d.ap.get(k) || 0); });
  if (i >= 0) { r.nombre = quien[i]; quien.splice(i, 1); }
  r.apellidos = quien.join(' ');
  return r;
}

// Lo entendido, en una frase para enseñársela al usuario
export function comoSeEntiende(c) {
  return [c.nombre && `nombre ${c.nombre}`, c.apellidos && `apellidos ${c.apellidos}`, c.lugar && `lugar ${c.lugar}`,
    c.desde != null && (c.desde === c.hasta ? `año ${c.desde}` : `años ${c.desde}–${c.hasta}`), c.tipo && `tipo ${c.tipo}`].filter(Boolean).join(' · ');
}

// Personas del árbol que coinciden, leídas del GEDCOM abierto (siempre al día), con el mismo criterio de grupos que los documentos.
export function personasDelArbol(arbol, e, variantes) {
  const quien = `${e.nombre || ''} ${e.apellidos || ''}`.trim();
  const hayQuien = !!quien;
  if (!hayQuien && !e.lugar?.trim() && !e.linea) return { lista: [], filtros: false };
  const cL = clave(e.lugar || '');
  // Sin nombre, el lugar elige a quién se mira; con nombre, lo que no coincide se cuenta aparte
  const base = buscar(arbol, quien, { nombre: e.nombre, apellidos: e.apellidos, linea: e.linea, variantes, lugar: hayQuien ? '' : e.lugar, limite: 1e7 }).lista;
  const hayF = e.desde != null || e.hasta != null;
  const lista = base.map(p => {
    const notas = [];
    let f = 'na', l = 'na';
    if (hayF) {
      if (p.ymin == null) { f = 'sin'; notas.push('sin fechas'); }
      else {
        const a = p.ymax > p.ymin ? p.ymin : p.ymin - 60, b = p.ymax > p.ymin ? p.ymax : p.ymin + 60;
        f = (e.desde == null || b >= e.desde) && (e.hasta == null || a <= e.hasta) ? 'si' : 'no';
      }
    }
    if (cL && hayQuien) {
      if (!p.claveLugar) { l = 'sin'; notas.push('sin lugar'); }
      else l = p.claveLugar.includes(cL) ? 'si' : 'no';
    }
    return { p, _g: grupo(f, l), notas };
  });
  return { lista: lista.map((x, i) => [x, i]).sort((a, b) => a[0]._g - b[0]._g || a[1] - b[1]).map(x => x[0]), filtros: hayF || !!(cL && hayQuien) };
}
