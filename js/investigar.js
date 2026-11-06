// Herramientas para investigar: grado de prueba de cada dato, qué falta por probar, parentesco, antepasados repetidos,
// cronología, tareas pendientes y lugares.
import { hijos, valor } from './gedcom.js?v=202611062159';
import { anios, nombreCompleto, vida, fechaES, miles } from './modelo.js?v=202611062159';
import { clave } from './buscar.js?v=202611062159';
import { esc } from './md.js?v=202611062159';

const enlace = p => `<a href="#/p/${esc(p.id.slice(1, -1))}">${esc(nombreCompleto(p))}</a>`;
const LETRA = { 3: 'A', 2: 'B', 1: 'C', 0: '?' };
const insignia = q => q == null ? '<span class="grado gN" title="Sin documento">—</span>' : `<span class="grado g${LETRA[q]}" title="Mejor prueba">${LETRA[q]}</span>`;

// ---------- Grado de prueba: qué prueba cada cita (por su papel y lo que dice) ----------
const ASPECTOS = {
  nac: /bautiz|nac[ií]|nacimiento|naci[oó]|partida de bautismo|baptism|christen/i,
  fil: /\bhij[oa]\b|bautiz|nacid|filiaci|legítim|hijo leg|padres?\b|madre\b/i,
  boda: /matrimon|boda|casad|contray|despos|velaci|esposo|esposa|marido|mujer\b|cónyuge|conyuge/i,
  muerte: /difunt|defunci|entierr|enterr|muert|falleci|sepult|testa|viud/i,
};
// El papel dice que la muerte de la que habla el documento es la de otro: «hijo y heredero» en un testamento o el marido en la
// defunción de su mujer no prueban su propia muerte. «Padre difunto» sí; «madre del difunto», no.
// Solo se aplica a la muerte: en nacimiento, padres y boda el texto de la cita sí puede hablar de la persona («hija, nacido el 13-10-1934»).
const PARIENTE = /\b(c[oó]nyuge|consorte|espos[oa]s?|marido|mujer|muger|viud[oa]|hij[oa]s?|padres?|madres?|herman[oa]s?|abuel[oa]s?|niet[oa]s?|suegr[oa]|yerno|nuera|cuñad[oa]|sobrin[oa]s?|t[ií][oa]|prim[oa]|padrin[oa]|madrina|testigos?|cumplidora?|albacea|herederos?|heredera)\b/i;
function deOtraPersona(nota, aspecto) {
  if (aspecto !== 'muerte') return false;
  const papel = /^([^:]{1,60}):/.exec(nota)?.[1] ?? (nota.length <= 60 ? nota : '');
  return PARIENTE.test(papel) && !/(?<!\bdel |\bde la |\bde los |\bde las )\bdifunt/i.test(papel);
}
function citasDe(arbol, nodoRaiz, hecho = null) {
  const out = [];
  for (const h of nodoRaiz.hijos) {
    if (h.tag === 'SOUR') {
      const q = valor(h, 'QUAY'), nota = hijos(h, 'NOTE').map(n => arbol.notaTexto(n)).join(' ');
      const t = /^@/.test(h.valor) ? (arbol.registro(h.valor) ? valor(arbol.registro(h.valor).arbol, 'TITL') : h.valor) : h.valor;
      out.push({ q: q === '' ? null : +q, nota, titulo: t, hecho });
    } else if (!hecho && ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'WILL'].includes(h.tag)) out.push(...citasDe(arbol, h, h.tag));
  }
  return out;
}
// { nac, fil, boda, muerte }: mejor QUAY (3 = A … 0 = ?) o null si no hay documento; y los títulos
export function pruebasDe(arbol, id) {
  const r = arbol.registro(id); if (!r) return null;
  const c = citasDe(arbol, r.arbol);
  for (const f of arbol.p(id).fams) { const rf = arbol.registro(f); if (rf) for (const m of hijos(rf.arbol, 'MARR')) c.push(...citasDe(arbol, m, 'MARR')); }
  const res = { nac: null, fil: null, boda: null, muerte: null, docs: { nac: [], fil: [], boda: [], muerte: [] } };
  const pon = (k, x) => { const q = x.q ?? 0; if (res[k] == null || q > res[k]) res[k] = q; res.docs[k].push(x.titulo); };
  for (const x of c) {
    if (x.hecho === 'BIRT' || x.hecho === 'CHR' || x.hecho === 'BAPM') pon('nac', x);
    else if (x.hecho === 'DEAT' || x.hecho === 'BURI' || x.hecho === 'WILL') pon('muerte', x);
    else if (x.hecho === 'MARR') pon('boda', x);
    for (const k of Object.keys(ASPECTOS)) if (!x.hecho && ASPECTOS[k].test(x.nota + ' ' + x.titulo) && !deOtraPersona(x.nota, k)) pon(k, x);
  }
  return res;
}
export function resumenPruebas(arbol, id) {
  const p = pruebasDe(arbol, id); if (!p) return '';
  const t = (k, e) => `<span class="prueba" title="${esc(p.docs[k].slice(0, 4).join(' · ') || 'Sin documento')}">${e} ${insignia(p[k])}</span>`;
  return `<p class="pruebas">Pruebas: ${t('nac', 'nacimiento')}${t('fil', 'padres')}${t('boda', 'boda')}${t('muerte', 'muerte')}</p>`;
}

// ---------- Qué falta por probar (línea directa) ----------
export function pintarFaltaProbar(arbol, raiz, ahnentafel) {
  const m = [...ahnentafel(arbol, raiz).entries()].sort((a, b) => a[0] - b[0]), vistos = new Set();
  const filas = [];
  for (const [n, x] of m) {
    if (vistos.has(x) || n === 1) continue; vistos.add(x);
    const p = arbol.p(x), pr = pruebasDe(arbol, x);
    const huecos = ['nac', 'fil', 'boda', 'muerte'].filter(k => pr[k] == null || pr[k] < 3).length;
    filas.push({ n, p, pr, huecos, g: Math.floor(Math.log2(n)) + 1 });
  }
  const sinNada = filas.filter(f => ['nac', 'fil', 'boda', 'muerte'].every(k => f.pr[k] == null)).length;
  return `<p class="peq">${miles(filas.length)} antepasados directos de ${esc(nombreCompleto(arbol.p(raiz)))}; ${miles(sinNada)} sin ningún documento.
      Para cada dato, la mejor prueba: <span class="grado gA">A</span> lo dice el documento, <span class="grado gB">B</span> indirecto, <span class="grado gC">C</span> deducido, <span class="grado gN">—</span> sin documento.
      Es orientativo: se deduce del papel de cada cita (bautizado, padre, contrayente, difunto…).</p>
    <label class="check"><input type="checkbox" id="fp-huecos" checked> Solo los que tienen algún dato sin prueba A</label>
    <div class="tabla"><table class="falta-probar"><tr><th>N.º</th><th>Persona</th><th>Nacimiento</th><th>Padres</th><th>Boda</th><th>Muerte</th></tr>
    ${filas.map(f => `<tr class="${f.huecos ? 'hueco' : 'completo'}"><td class="num">${miles(f.n)}</td><td>${enlace(f.p)} <span class="peq">${esc(vida(f.p))}</span></td>
      ${['nac', 'fil', 'boda', 'muerte'].map(k => `<td title="${esc(f.pr.docs[k].slice(0, 3).join(' · '))}">${insignia(f.pr[k])}</td>`).join('')}</tr>`).join('')}</table></div>`;
}

// ---------- Parentesco ----------
const ORD = ['', 'primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
const ordinal = n => ORD[n] || `${n}.º`;
const ORDF = ['', 'primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava', 'novena', 'décima'];
function g(base, sexo) { return sexo === 'F' ? base.replace(/^padre$/, 'madre').replace(/o\b/g, 'a').replace(/primer a/, 'primera a').replace(/tercer a/, 'tercera a') : base; }
// da: generaciones de A al antepasado común; db: de B. Devuelve qué es B de A.
export function nombreParentesco(da, db, sexoB) {
  if (!da && !db) return 'la misma persona';
  if (!db) { const n = ['', 'padre', 'abuelo', 'bisabuelo', 'tatarabuelo'][da]; return g(n || `${ordinal(da - 1)} abuelo`, sexoB); }
  if (!da) { const n = ['', 'hijo', 'nieto', 'bisnieto', 'tataranieto'][db]; return g(n || `${ordinal(db - 1)} nieto`, sexoB); }
  if (da === 1 && db === 1) return g('hermano', sexoB);
  if (da === 1) return g(['', '', 'sobrino', 'sobrino nieto', 'sobrino bisnieto'][db] || `sobrino ${ordinal(db - 1)} nieto`, sexoB);
  if (db === 1) return g(['', '', 'tío', 'tío abuelo', 'tío bisabuelo'][da] || `tío ${ordinal(da - 1)} abuelo`, sexoB);
  if (da === db) return da === 2 ? g('primo hermano', sexoB) : g(`primo ${['', '', 'hermano', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto'][da] || `en ${da - 1}.º grado`}`, sexoB);
  const m = Math.min(da, db), dif = Math.abs(da - db);
  const grado = m === 2 ? 'hermano' : (['', '', '', 'segundo', 'tercero', 'cuarto', 'quinto'][m] || `de ${m - 1}.º grado`);
  if (dif === 1) return g(da > db ? `tío ${m === 2 ? 'segundo' : `${ordinal(m)}`}` : `sobrino ${m === 2 ? 'segundo' : `${ordinal(m)}`}`, sexoB);
  return g(`primo ${grado}`, sexoB) + ` (${dif} generaciones de diferencia)`;
}
function subir(arbol, x) {
  const dist = new Map([[x, 0]]), prev = new Map(), cola = [x];
  for (let i = 0; i < cola.length; i++) {
    const y = cola[i], d = dist.get(y);
    if (d >= 40) continue;
    for (const f of arbol.p(y)?.famc || []) { const fa = arbol.f(f); if (!fa) continue;
      for (const z of [fa.marido, fa.mujer]) if (z && !dist.has(z) && arbol.p(z)) { dist.set(z, d + 1); prev.set(z, y); cola.push(z); } }
  }
  return { dist, prev };
}
function camino(prev, desde, hasta) { const l = [desde]; let x = desde; while (x !== hasta) { x = prev.get(x); if (!x) break; l.push(x); } return l; }
// Devuelve { texto, camino: [xref…], comun } o null
export function parentesco(arbol, a, b) {
  const A = subir(arbol, a), B = subir(arbol, b);
  let mejor = null;
  for (const [x, da] of A.dist) { const db = B.dist.get(x); if (db == null) continue; if (!mejor || da + db < mejor.da + mejor.db) mejor = { x, da, db }; }
  if (mejor) {
    const subidaA = camino(A.prev, mejor.x, a).reverse(), bajadaB = camino(B.prev, mejor.x, b);
    return { texto: nombreParentesco(mejor.da, mejor.db, arbol.p(b).sexo), camino: [...subidaA, ...bajadaB.slice(1)], comun: mejor.x, da: mejor.da, db: mejor.db };
  }
  // Por matrimonio: cónyuge de un pariente, o pariente del cónyuge
  for (const f of arbol.p(b).fams) { const fa = arbol.f(f); const c = fa && (fa.marido === b ? fa.mujer : fa.marido); if (!c || c === a) continue;
    const r = parentesco0(arbol, a, c); if (r) return { ...r, texto: `${arbol.p(b).sexo === 'F' ? 'mujer' : 'marido'} de ${/a$/.test(r.texto.split(' ')[0]) ? 'una' : 'un'} ${r.texto}`, camino: [...r.camino, b] }; }
  for (const f of arbol.p(a).fams) { const fa = arbol.f(f); const c = fa && (fa.marido === a ? fa.mujer : fa.marido); if (!c || c === b) continue;
    const r = parentesco0(arbol, c, b); if (r) return { ...r, texto: `${r.texto} ${arbol.p(c).sexo === 'F' ? 'de la mujer' : 'del marido'}`, camino: [a, ...r.camino] }; }
  return null;
}
function parentesco0(arbol, a, b) {
  const A = subir(arbol, a), B = subir(arbol, b); let mejor = null;
  for (const [x, da] of A.dist) { const db = B.dist.get(x); if (db == null) continue; if (!mejor || da + db < mejor.da + mejor.db) mejor = { x, da, db }; }
  if (!mejor) return null;
  return { texto: nombreParentesco(mejor.da, mejor.db, arbol.p(b).sexo), camino: [...camino(A.prev, mejor.x, a).reverse(), ...camino(B.prev, mejor.x, b).slice(1)], comun: mejor.x };
}
export function pintarParentesco(arbol, a, b) {
  const r = parentesco(arbol, a, b);
  if (!r) return `<p>${enlace(arbol.p(b))} no tiene parentesco conocido en el árbol con ${enlace(arbol.p(a))}.</p>`;
  return `<p><b>${esc(nombreCompleto(arbol.p(b)))}</b> es <b>${esc(r.texto)}</b> de ${esc(nombreCompleto(arbol.p(a)))}.</p>
    <ol class="camino">${r.camino.map(x => `<li>${enlace(arbol.p(x))} <span class="peq">${esc(vida(arbol.p(x)))}${x === r.comun ? ' · antepasado común' : ''}</span></li>`).join('')}</ol>`;
}

// ---------- Antepasados repetidos (colapso de pedigrí) ----------
export function pintarRepetidos(arbol, raiz) {
  const m = arbol.ahnentafel(raiz);
  const l = [...m.entries()].filter(([, ns]) => ns.length > 1).map(([x, ns]) => ({ p: arbol.p(x), ns: [...ns].sort((a, b) => a - b) })).sort((a, b) => a.ns[0] - b.ns[0]);
  const gen = n => Math.floor(Math.log2(n)) + 1;
  return `<p class="peq">${miles(l.length)} antepasados de ${esc(nombreCompleto(arbol.p(raiz)))} aparecen por más de una rama (por matrimonios entre parientes).
      Por eso hay más números de antepasado que personas distintas. Se muestran hasta 8 números por persona.</p>
    ${l.map(x => `<div class="fila-rev">${enlace(x.p)} <span class="peq">${esc(vida(x.p))}</span><div class="peq">n.º ${x.ns.map(n => `${miles(n)} (gen. ${gen(n)})`).join(' · ')}${x.ns.length >= 8 ? ' …' : ''}</div></div>`).join('') || '<p class="nada">Ninguno.</p>'}`;
}

// ---------- Cronología de una persona ----------
export function cronologia(arbol, id) {
  const p = arbol.p(id), b = p.ymin != null ? (anios(p.nac?.fecha)[0] ?? null) : null;
  const filas = [];
  const pon = (fecha, texto, quien = null, propio = false) => { const y = anios(fecha)[0]; if (y == null) return; filas.push({ y, fecha, texto, quien, propio }); };
  for (const e of p.eventos) pon(e.fecha, `${e.etiqueta}${e.valor ? ': ' + e.valor : ''}${e.lugar ? ' · ' + e.lugar : ''}`, null, true);
  for (const f of p.famc.map(x => arbol.f(x)).filter(Boolean)) for (const x of [f.marido, f.mujer]) { const q = arbol.p(x); if (!q) continue;
    if (q.nac) pon(q.nac.fecha, `Nace su ${q.sexo === 'F' ? 'madre' : 'padre'}`, q); if (q.def) pon(q.def.fecha, `Muere su ${q.sexo === 'F' ? 'madre' : 'padre'}`, q); }
  for (const f of p.fams.map(x => arbol.f(x)).filter(Boolean)) {
    const c = arbol.p(f.marido === id ? f.mujer : f.marido), m = f.eventos.find(e => e.tag === 'MARR');
    if (m) pon(m.fecha, `Se casa${c ? ' con ' + nombreCompleto(c) : ''}${m.lugar ? ' · ' + m.lugar : ''}`, c, true);
    if (c?.def) pon(c.def.fecha, `Muere su ${c.sexo === 'F' ? 'mujer' : 'marido'}`, c);
    for (const h of f.hijos) { const q = arbol.p(h); if (!q) continue; if (q.nac) pon(q.nac.fecha, `Nace su ${q.sexo === 'F' ? 'hija' : 'hijo'}`, q); if (q.def) pon(q.def.fecha, `Muere su ${q.sexo === 'F' ? 'hija' : 'hijo'}`, q); }
  }
  filas.sort((a, b2) => a.y - b2.y);
  return `<div class="crono">${filas.map(f => `<div class="hecho${f.propio ? ' propio' : ''}"><span class="et">${esc(fechaES(f.fecha))}${b != null ? ` <span class="edad">${f.y - b >= 0 ? (f.y - b) + ' años' : ''}</span>` : ''}</span>
      <span class="dato">${esc(f.texto)}${f.quien ? ' · ' + enlace(f.quien) : ''}</span></div>`).join('') || '<p class="nada">Sin fechas.</p>'}</div>
    ${b == null ? '<p class="peq">Sin año de nacimiento: no se puede calcular la edad.</p>' : ''}`;
}

// ---------- Tareas pendientes (notas que empiezan por «PENDIENTE:») ----------
export const ES_TAREA = /^\s*(PENDIENTE|TAREA)\s*:/i;
export function tareas(arbol) {
  const out = [];
  for (const p of arbol.personas.values()) {
    const nodos = hijos(arbol.registro(p.id).arbol, 'NOTE');
    nodos.forEach((n, i) => { const t = arbol.notaTexto(n); if (ES_TAREA.test(t)) out.push({ p, i, texto: t.replace(ES_TAREA, '').trim() }); });
  }
  return out;
}
export function pintarTareas(arbol) {
  const l = tareas(arbol), ahn = new Map();
  for (const r of arbol.raices) for (const [x, ns] of arbol.ahnentafel(r.id)) if (!ahn.has(x)) ahn.set(x, `${r.letra} ${miles(ns[0])}`);
  l.sort((a, b) => (ahn.has(b.p.id) - ahn.has(a.p.id)) || nombreCompleto(a.p).localeCompare(nombreCompleto(b.p), 'es'));
  return `<p class="peq">${l.length} tareas. Se apuntan en la ficha de cada persona (Notas → «+ Añadir tarea»), como notas que empiezan por «PENDIENTE:». Las de la línea directa, primero.</p>
    ${l.map(t => `<div class="fila-rev">${ahn.has(t.p.id) ? `<span class="ahn">${esc(ahn.get(t.p.id))}</span> ` : ''}${enlace(t.p)}: ${esc(t.texto)}</div>`).join('') || '<p class="nada">No hay tareas pendientes.</p>'}`;
}

// ---------- Lugares ----------
export function lugares(arbol) {
  const m = new Map();
  const pon = (lugar, x) => { if (!lugar) return; if (!m.has(lugar)) m.set(lugar, { lugar, hechos: 0, personas: new Set() }); const e = m.get(lugar); e.hechos++; e.personas.add(x); };
  for (const p of arbol.personas.values()) for (const e of p.eventos) pon(e.lugar, p.id);
  for (const f of arbol.familias.values()) for (const e of f.eventos) pon(e.lugar, f.marido || f.mujer || f.id);
  // Grupos de variantes: la misma clave (sin tildes ni grafías), o el mismo lugar antes de la primera coma
  const grupos = new Map();
  for (const e of m.values()) { const k = clave(e.lugar.split(/[,(]/)[0]); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(e); }
  return { todos: [...m.values()].sort((a, b) => b.hechos - a.hechos), grupos: [...grupos.values()].filter(g => g.length > 1).sort((a, b) => b.reduce((s, x) => s + x.hechos, 0) - a.reduce((s, x) => s + x.hechos, 0)) };
}
