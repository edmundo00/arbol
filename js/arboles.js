// Árboles: gráfico de ascendientes, lista de antepasados por generaciones y esquema de descendientes.
import { vida, nombreCompleto } from './modelo.js?v=202610312334';
import { esc } from './md.js?v=202610312334';

const enlace = id => `#/p/${id.slice(1, -1)}`;

function padresDe(arbol, id) {
  const f = arbol.padres(id)[0];
  return f ? [f.marido, f.mujer] : [null, null];
}

// Antepasados de una persona: Map número → xref, hasta «gens» generaciones (la persona es la 1).
export function antepasados(arbol, id, gens) {
  const m = new Map([[1, id]]), cola = [1], tope = 2 ** (gens - 1);
  for (let i = 0; i < cola.length; i++) {
    const n = cola[i];
    if (n >= tope) continue;
    const [p, q] = padresDe(arbol, m.get(n));
    if (p) { m.set(2 * n, p); cola.push(2 * n); }
    if (q) { m.set(2 * n + 1, q); cola.push(2 * n + 1); }
  }
  return m;
}

const PARENTESCO = ['', 'La persona', 'Padres', 'Abuelos', 'Bisabuelos', 'Tatarabuelos', 'Trastatarabuelos'];
function nombreGen(g) { return PARENTESCO[g] || `${g - 1}.ª generación de antepasados`; }

export function pestanasArbol(vista) {
  const p = (k, t) => `<button class="pest${vista === k ? ' activa' : ''}" data-vista="${k}">${t}</button>`;
  return `<nav class="pestanas">${p('grafico', 'Gráfico')}${p('lista', 'Antepasados')}${p('desc', 'Descendientes')}</nav>`;
}

// ---------- Gráfico de 5 generaciones ----------
export function grafico(arbol, id, GENS = 5) {
  const m = antepasados(arbol, id, GENS + 1);
  const filas = 2 ** (GENS - 1);
  let celdas = '';
  for (let g = 1; g <= GENS; g++) {
    const alto = filas / 2 ** (g - 1);
    for (let k = 0; k < 2 ** (g - 1); k++) {
      const n = 2 ** (g - 1) + k, x = m.get(n), p = x && arbol.p(x);
      const sigue = g === GENS && x && (m.get(2 * n) || m.get(2 * n + 1));
      const estilo = `grid-column:${g};grid-row:${k * alto + 1} / span ${alto}`;
      celdas += p
        ? `<div class="caja-arbol s${p.sexo}" style="${estilo}"><a href="${enlace(x)}"><span class="num">${n}</span>
             <span class="nom">${esc(p.nombre)} <b>${esc(p.apellidos)}</b></span><span class="vida">${esc(vida(p))}</span></a>
             ${sigue ? '<span class="seguir" aria-hidden="true">▸</span>' : ''}</div>`
        : `<div class="caja-arbol vacia" style="${estilo}"><span class="num">${n}</span>${g > 1 && m.get(Math.floor(n / 2)) ? '<span class="vida">desconocido</span>' : ''}</div>`;
    }
  }
  const hijo = arbol.p(id) && padresHijo(arbol, id);
  return `<div class="grafico" style="grid-template-rows:repeat(${filas}, minmax(44px, auto))">${celdas}</div>
    ${hijo ? `<p class="peq"><a href="${enlace(hijo)}">◂ Bajar una generación (${esc(nombreCompleto(arbol.p(hijo)))})</a></p>` : ''}`;
}

// Un hijo de la persona, para poder volver hacia abajo en el gráfico.
function padresHijo(arbol, id) {
  const p = arbol.p(id);
  for (const f of p.fams) { const fam = arbol.f(f); if (fam?.hijos.length) return fam.hijos[0]; }
  return null;
}

// ---------- Lista de antepasados por generaciones ----------
export function lista(arbol, id) {
  const m = antepasados(arbol, id, 40);
  const porGen = new Map();
  for (const [n, x] of m) {
    if (n === 1) continue;
    const g = Math.floor(Math.log2(n)) + 1;
    if (!porGen.has(g)) porGen.set(g, []);
    porGen.get(g).push([n, x]);
  }
  const bloques = [...porGen.entries()].sort((a, b) => a[0] - b[0]).map(([g, l]) => {
    l.sort((a, b) => a[0] - b[0]);
    return `<details class="gen"${g <= 5 ? ' open' : ''}><summary><b>${esc(nombreGen(g))}</b> <span class="peq">${l.length} de ${2 ** (g - 1)}</span></summary>
      ${l.map(([n, x]) => {
        const p = arbol.p(x), lugar = p.nac?.lugar || p.def?.lugar || '';
        return `<a class="fila s${p.sexo}" href="${enlace(x)}" id="n${n}"><span class="num">${n}</span><span class="nom">${esc(p.nombre)} <b>${esc(p.apellidos)}</b></span>
          <span class="vida">${esc(vida(p))}${lugar ? ' · ' + esc(lugar) : ''}</span></a>`;
      }).join('')}</details>`;
  }).join('');
  return `<p class="peq">Pulsa a cualquiera para ver su árbol; para ver su ficha, pulsa luego «Familia».</p>
    <form class="ir-num" id="ir-num"><label>Ir al antepasado n.º<input id="num" inputmode="numeric" autocomplete="off" placeholder="p. ej. 12"></label><button>Ir</button></form>
    <p class="peq">${new Set([...m.values()]).size - 1} antepasados conocidos${m.size > new Set([...m.values()]).size ? ` (${m.size - 1} contando dos veces a los que aparecen por varias ramas)` : ''}. Padre = 2 × hijo; madre = 2 × hijo + 1.</p>
    ${bloques || '<p class="nada">No hay antepasados registrados.</p>'}`;
}

// ---------- Descendientes ----------
export function descendientes(arbol, id, MAX = 12) {
  let total = 0;
  const vistos = new Set();
  const rama = (x, nivel) => {
    const p = arbol.p(x);
    if (!p) return '';
    if (vistos.has(x)) return `<li><a href="${enlace(x)}">${esc(nombreCompleto(p))}</a> <span class="peq">(ya aparece arriba)</span></li>`;
    vistos.add(x); total++;
    const unions = p.fams.map(f => arbol.f(f)).filter(Boolean);
    const hijos = unions.flatMap(f => f.hijos);
    const persona = `<a class="s${p.sexo}" href="${enlace(x)}"><b>${esc(nombreCompleto(p))}</b></a> <span class="peq">${esc(vida(p))}</span>`;
    const conyuges = unions.map(f => {
      const o = arbol.p(f.marido === x ? f.mujer : f.marido);
      return o ? ` <span class="peq">⚭ <a href="${enlace(o.id)}">${esc(nombreCompleto(o))}</a></span>` : '';
    }).join('');
    if (!hijos.length || nivel >= MAX) return `<li>${persona}${conyuges}${hijos.length ? ` <span class="peq">(${hijos.length} hijos más abajo: <a href="${enlace(x)}">ver</a>)</span>` : ''}</li>`;
    const y = c => arbol.p(c)?.ymin ?? 9999;
    return `<li><details${nivel < 2 ? ' open' : ''}><summary>${persona}${conyuges} <span class="peq">· ${hijos.length} hijo${hijos.length === 1 ? '' : 's'}</span></summary>
      <ul>${[...hijos].sort((a, b) => y(a) - y(b)).map(h => rama(h, nivel + 1)).join('')}</ul></details></li>`;
  };
  const html = rama(id, 0);
  return `<p class="peq">${total - 1} descendientes. Pulsa ▸ para abrir o cerrar cada rama.</p><ul class="desc">${html}</ul>`;
}
