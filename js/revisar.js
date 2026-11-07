// Revisar el árbol: dónde se corta cada línea, incoherencias de fechas y posibles duplicados.
// Las reglas son las de 9 Sistema/Control/scripts/auditar_gedcom.py.
import { antepasados } from './arboles.js?v=202611071004';
import { nombreCompleto, vida, miles } from './modelo.js?v=202611071004';
import { esc } from './md.js?v=202611071004';

const y = e => (e ? anio(e.fecha) : null);
// Año de una fecha como en auditar_gedcom.py: el primero entre 1000 y 2099; «entre A y B», el del medio.
function anio(fecha) {
  const m = (fecha || '').match(/\b(1\d{3}|20\d{2})\b/g);
  if (!m) return null;
  if (/^(BET|FROM)/.test(fecha) && m.length > 1) return Math.floor((+m[0] + +m[1]) / 2);
  return +m[0];
}
// Nacimiento y muerte: el primer hecho con fecha (nacimiento, bautismo… / defunción, entierro)
const nac = p => { for (const t of ['BIRT', 'BAPM', 'CHR']) { const e = p.eventos.find(x => x.tag === t && x.fecha); if (e) return anio(e.fecha); } return null; };
const mue = p => { for (const t of ['DEAT', 'BURI']) { const e = p.eventos.find(x => x.tag === t && x.fecha); if (e) return anio(e.fecha); } return null; };
const enlace = (p, extra = '') => `<a href="#/p/${esc(p.id.slice(1, -1))}">${esc(nombreCompleto(p))}</a> <span class="peq">${esc(vida(p))}${extra}</span>`;
const GEN = g => ['', 'la persona', 'padres', 'abuelos', 'bisabuelos', 'tatarabuelos'][g] || `${g - 1}.ª generación`;

// ---------- Dónde se corta cada línea: antepasados a los que les falta el padre, la madre o los dos ----------
export function fronteras(arbol, raiz) {
  const m = antepasados(arbol, raiz, 40), vistos = new Set(), out = [];
  for (const [n, x] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
    if (vistos.has(x)) continue;
    vistos.add(x);
    const f = arbol.padres(x)[0], falta = [];
    if (!f?.marido) falta.push('padre');
    if (!f?.mujer) falta.push('madre');
    if (falta.length) out.push({ n, g: Math.floor(Math.log2(n)) + 1, p: arbol.p(x), falta });
  }
  return out;
}

export function pintarFronteras(arbol, raiz) {
  const l = fronteras(arbol, raiz);
  const porGen = new Map();
  for (const x of l) { if (!porGen.has(x.g)) porGen.set(x.g, []); porGen.get(x.g).push(x); }
  return `<p class="peq">${miles(l.length)} antepasados de ${esc(nombreCompleto(arbol.p(raiz)))} con algún progenitor sin identificar.
      Son las líneas que quedan por investigar; los primeros son los más cercanos.</p>
    ${[...porGen.entries()].map(([g, xs]) => `<details class="gen"${g <= 8 ? ' open' : ''}><summary><b>${esc(GEN(g)[0].toUpperCase() + GEN(g).slice(1))}</b> <span class="peq">${xs.length}</span></summary>
      ${xs.map(x => `<div class="fila-rev"><span class="num">${miles(x.n)}</span> ${enlace(x.p, x.p.nac?.lugar ? ' · ' + x.p.nac.lugar : '')} <span class="falta">falta ${x.falta.join(' y ')}</span></div>`).join('')}</details>`).join('')}`;
}

// ---------- Incoherencias ----------
export function incoherencias(arbol) {
  const directa = new Set();
  for (const r of arbol.raices) for (const x of arbol.ahnentafel(r.id).keys()) directa.add(x);
  const out = [];
  const pon = (grave, ids, texto) => out.push({ grave, directa: ids.every(i => directa.has(i)), ids, texto });
  for (const p of arbol.personas.values()) {
    const b = nac(p), d = mue(p);
    if (b && d && d < b) pon(1, [p.id], `Muere (${d}) antes de nacer (${b})`);
    if (b && d && d - b > 105) pon(2, [p.id], `Vive ${d - b} años (${b}–${d})`);
  }
  for (const f of arbol.familias.values()) {
    const boda = f.eventos.find(e => e.tag === 'MARR'), m = y(boda);
    for (const [rol, x] of [['padre', f.marido], ['madre', f.mujer]]) {
      const par = x && arbol.p(x); if (!par) continue;
      const bp = nac(par), dp = mue(par);
      if (m && bp && m - bp < 14) pon(1, [par.id], `Se casa con ${m - bp} años (${m})`);
      for (const h of f.hijos) {
        const hi = arbol.p(h), bh = hi && nac(hi); if (!bh) continue;
        if (bp) {
          const e = bh - bp;
          if (e < 14) pon(1, [par.id, h], `${rol === 'madre' ? 'Madre' : 'Padre'} con ${e} años al nacer ${nombreCompleto(hi)}`);
          else if ((rol === 'madre' && e > 52) || (rol === 'padre' && e > 75)) pon(2, [par.id, h], `${rol === 'madre' ? 'Madre' : 'Padre'} con ${e} años al nacer ${nombreCompleto(hi)}`);
        }
        if (dp && rol === 'madre' && bh > dp) pon(1, [par.id, h], `${nombreCompleto(hi)} nace (${bh}) después de morir su madre (${dp})`);
        if (dp && rol === 'padre' && bh > dp + 1) pon(1, [par.id, h], `${nombreCompleto(hi)} nace (${bh}) más de un año después de morir su padre (${dp})`);
      }
    }
  }
  out.sort((a, b) => (b.directa - a.directa) || (a.grave - b.grave));
  return out;
}

export function pintarIncoherencias(arbol) {
  const l = incoherencias(arbol);
  const fila = x => `<div class="fila-rev"><span class="grav g${x.grave}">${x.grave === 1 ? 'imposible' : 'raro'}</span> ${esc(x.texto)}
    <div class="peq">${x.ids.map(i => arbol.p(i)).filter(Boolean).map(p => enlace(p)).join(' · ')}</div></div>`;
  const dir = l.filter(x => x.directa), resto = l.filter(x => !x.directa);
  return `<p class="peq">${l.length} avisos. «Imposible»: no puede ser (madre de 9 años, muere antes de nacer…). «Raro»: puede ser, pero conviene mirarlo (madre de 54, más de 105 años).
      Casi siempre es una fecha mal copiada o una persona confundida con otra.</p>
    <details class="gen" open><summary><b>Línea directa</b> <span class="peq">${dir.length}</span></summary>${dir.map(fila).join('') || '<p class="nada">Nada.</p>'}</details>
    <details class="gen"><summary><b>Resto del árbol</b> <span class="peq">${resto.length}</span></summary>${resto.slice(0, 600).map(fila).join('')}${resto.length > 600 ? `<p class="peq">Se muestran 600 de ${resto.length}.</p>` : ''}</details>`;
}

// ---------- Posibles duplicados: mismo nombre (misma clave) y nacimiento a ±2 años ----------
export function duplicados(arbol) {
  const grupos = new Map();
  for (const p of arbol.personas.values()) {
    if (!p.clave || !nac(p)) continue;
    if (!grupos.has(p.clave)) grupos.set(p.clave, []);
    grupos.get(p.clave).push(p);
  }
  const pares = [];
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => nac(a) - nac(b));
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length && nac(g[j]) - nac(g[i]) <= 2; j++) pares.push([g[i], g[j]]);
  }
  return pares;
}

export function pintarDuplicados(arbol, editando) {
  const l = duplicados(arbol);
  const lugar = p => p.nac?.lugar ? ' · ' + p.nac.lugar : '';
  const padres = p => { const f = arbol.padres(p.id)[0]; return f ? [f.marido, f.mujer].filter(Boolean).map(x => nombreCompleto(arbol.p(x))).join(' y ') : 'sin padres'; };
  return `<p class="peq">${l.length} parejas de fichas con el mismo nombre y nacidas con 2 años o menos de diferencia. No todas son la misma persona (primos con el mismo nombre…): compara padres y lugares.
      ${editando ? 'Con «Fusionar» ves las dos fichas lado a lado antes de juntarlas.' : 'Para fusionar, activa antes «Editar».'}</p>
    ${l.slice(0, 500).map(([a, b]) => `<div class="fila-rev dup">
      <div>${enlace(a, lugar(a))}<div class="peq">hijo/a de ${esc(padres(a))} · ${esc(a.id)}</div></div>
      <div>${enlace(b, lugar(b))}<div class="peq">hijo/a de ${esc(padres(b))} · ${esc(b.id)}</div></div>
      ${editando ? `<button class="mas" data-fusionar="${esc(a.id)}" data-con="${esc(b.id)}">⇆ Fusionar</button>` : ''}</div>`).join('')}
    ${l.length > 500 ? `<p class="peq">Se muestran 500 de ${l.length}.</p>` : ''}`;
}
