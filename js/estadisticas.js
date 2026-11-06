// Estadísticas del GEDCOM abierto y comprobación de que solo trae a la familia esperada (grupos desconectados, apellidos).
import { anios, nombreCompleto, vida, miles } from './modelo.js?v=202611062216';
import { esc } from './md.js?v=202611062216';

const enlace = id => `#/p/${id.slice(1, -1)}`;
const UNION = new Set(['y', 'e', 'i']);
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'do', 'das', 'dos', 'van', 'von', 'der', 'den', 'ten', 'di']);

// «Pardo de la Torre y López» → ['Pardo', 'de la Torre', 'López']
export function partirApellidos(t) {
  const out = [];
  let pend = [];
  for (const w of (t || '').replace(/[,?]/g, ' ').split(/\s+/).filter(Boolean)) {
    if (UNION.has(w.toLowerCase())) continue;
    if (PARTICULAS.has(w.toLowerCase())) { pend.push(w); continue; }
    out.push([...pend, w].join(' ')); pend = [];
  }
  return out;
}

function contar(lista) {
  const m = new Map();
  for (const x of lista) if (x) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
}
const primerAnio = e => e ? anios(e.fecha)[0] ?? null : null;
const hoy = new Date().getFullYear();
// Los años de 3 cifras suelen ser fechas mal escritas («199» por «1995»): no cuentan para los extremos
const valido = y => y != null && y >= 500 && y <= hoy;

// Grupos de personas unidas por algún parentesco (padres, hijos, cónyuges). Devuelve listas de xrefs, de mayor a menor.
export function grupos(arbol) {
  const padre = new Map();
  const raiz = x => { while (padre.get(x) !== x) { padre.set(x, padre.get(padre.get(x))); x = padre.get(x); } return x; };
  const unir = (a, b) => { a = raiz(a); b = raiz(b); if (a !== b) padre.set(a, b); };
  for (const id of arbol.personas.keys()) padre.set(id, id);
  for (const f of arbol.familias.values()) {
    const miembros = [f.marido, f.mujer, ...f.hijos].filter(x => x && padre.has(x));
    for (let i = 1; i < miembros.length; i++) unir(miembros[0], miembros[i]);
  }
  const g = new Map();
  for (const id of arbol.personas.keys()) { const r = raiz(id); if (!g.has(r)) g.set(r, []); g.get(r).push(id); }
  return [...g.values()].sort((a, b) => b.length - a.length);
}

// Generaciones: la cadena más larga de padres a hijos que hay en el árbol.
function generaciones(arbol) {
  const gen = new Map();
  const de = id => {
    if (gen.has(id)) return gen.get(id) ?? 1;   // null = en curso (bucle en el archivo)
    gen.set(id, null);
    let g = 1;
    const pila = [];
    for (const f of arbol.padres(id)) for (const x of [f.marido, f.mujer]) if (x && arbol.p(x)) pila.push(x);
    for (const x of pila) g = Math.max(g, 1 + de(x));
    gen.set(id, g);
    return g;
  };
  let max = 0, quien = null;
  for (const id of arbol.personas.keys()) { const g = de(id); if (g > max) { max = g; quien = id; } }
  return { max, quien };
}

export function calcular(arbol) {
  const P = [...arbol.personas.values()], F = [...arbol.familias.values()];
  const sexo = { M: 0, F: 0, U: 0 };
  for (const p of P) sexo[p.sexo === 'M' || p.sexo === 'F' ? p.sexo : 'U']++;
  const nac = P.map(p => [primerAnio(p.nac), p]).filter(([y]) => valido(y));
  const def = P.map(p => [primerAnio(p.def), p]).filter(([y]) => valido(y));
  const extremo = (l, f) => l.length ? l.reduce((a, b) => f(b[0], a[0]) ? b : a) : null;
  const todas = [];
  for (const p of P) for (const e of p.eventos) for (const y of anios(e.fecha)) if (valido(y)) todas.push([y, p]);
  for (const f of F) for (const e of f.eventos) for (const y of anios(e.fecha)) if (valido(y)) todas.push([y, arbol.p(f.marido) || arbol.p(f.mujer)]);
  const sinFechas = P.filter(p => !p.eventos.some(e => anios(e.fecha).length));
  const sinNombre = P.filter(p => !p.nombre && !p.apellidos);
  const sueltas = P.filter(p => !p.famc.length && !p.fams.length);
  const edades = [];
  for (const p of P) {
    const a = primerAnio(p.nac), b = primerAnio(p.def);
    if (valido(a) && valido(b) && b >= a && b - a < 120) edades.push([b - a, p]);
  }
  const conHijos = F.filter(f => f.hijos.length);
  const masHijos = F.reduce((a, f) => (f.hijos.length > (a?.hijos.length || 0) ? f : a), null);
  const tipos = contar(arbol.ged.registros.map(r => r.tipo));
  const lugares = contar(P.flatMap(p => p.eventos.map(e => e.lugar)).concat(F.flatMap(f => f.eventos.map(e => e.lugar))).filter(Boolean).map(l => l.trim()));
  const apellidos = contar(P.flatMap(p => [...new Set(partirApellidos(p.apellidos))]));
  const nombresDe = s => contar(P.filter(p => p.sexo === s).map(p => (p.nombre || '').split(/\s+/)[0]).filter(Boolean));
  return {
    P, F, sexo, nac, def, todas, sinFechas, sinNombre, sueltas, edades, conHijos, masHijos, tipos, lugares, apellidos,
    nombresH: nombresDe('M'), nombresM: nombresDe('F'),
    antigua: extremo(todas, (a, b) => a < b), reciente: extremo(todas, (a, b) => a > b),
    nacMin: extremo(nac, (a, b) => a < b), nacMax: extremo(nac, (a, b) => a > b),
    defMin: extremo(def, (a, b) => a < b), defMax: extremo(def, (a, b) => a > b),
    mayor: extremo(edades, (a, b) => a > b),
    gens: generaciones(arbol), grupos: grupos(arbol),
  };
}

const quien = p => p ? ` <a href="${enlace(p.id)}">${esc(nombreCompleto(p))}</a>` : '';
const fila = (t, v, extra = '') => `<tr><th>${t}</th><td class="num">${v}</td><td>${extra}</td></tr>`;
const pct = (n, t) => t ? ` <span class="peq">(${Math.round(100 * n / t)} %)</span>` : '';
const anioDe = x => x ? `${x[0]}` : '—';

function tablaCuenta(l, max, enlaceDe) {
  return `<table class="estad">${l.slice(0, max).map(([k, n]) => `<tr><td class="num">${miles(n)}</td><td>${enlaceDe ? enlaceDe(k) : esc(k)}</td></tr>`).join('')}</table>
    ${l.length > max ? `<p class="peq">… y ${miles(l.length - max)} más.</p>` : ''}`;
}

function apellidosDe(arbol, ids, n = 4) {
  return contar(ids.flatMap(id => [...new Set(partirApellidos(arbol.p(id).apellidos))])).slice(0, n).map(([a, k]) => `${esc(a)} (${k})`).join(', ') || 'sin apellidos';
}

export function pintarEstadisticas(arbol, info) {
  const e = calcular(arbol), n = e.P.length;
  const media = l => l.length ? (l.reduce((s, x) => s + x, 0) / l.length) : 0;
  const g = e.grupos, principal = g[0] || [];
  const otros = g.slice(1);
  const enOtros = otros.reduce((s, x) => s + x.length, 0);
  const tiposNombre = { INDI: 'Personas', FAM: 'Familias', SOUR: 'Fuentes', NOTE: 'Notas aparte', OBJE: 'Archivos multimedia', REPO: 'Archivos/repositorios', SUBM: 'Autor', _PLAC: 'Lugares (fichas)', HEAD: 'Cabecera', TRLR: 'Final' };

  const grupoFila = (ids, i) => {
    const ej = ids.map(id => arbol.p(id)).sort((a, b) => (a.ymin ?? 9999) - (b.ymin ?? 9999))[0];
    const ys = ids.flatMap(id => [arbol.p(id).ymin, arbol.p(id).ymax]).filter(valido);
    return `<tr><td class="num">${i + 1}</td><td class="num">${miles(ids.length)}</td><td>${apellidosDe(arbol, ids)}</td>
      <td>${ys.length ? Math.min(...ys) + '–' + Math.max(...ys) : 'sin fechas'}</td><td>${quien(ej)} <span class="peq">${esc(vida(ej))}</span></td></tr>`;
  };

  return `<div class="estadisticas">
    <h2>Estadísticas de «${esc(info.nombre)}»</h2>
    <p class="peq">${(info.tam / 1e6).toFixed(2)} MB${info.fecha ? ' · modificado el ' + esc(new Date(info.fecha).toLocaleString('es')) : ''}. Pulsa cualquier nombre para ir a su ficha.</p>

    <section><h3>Comprobación: ¿está solo la familia esperada?</h3>
    ${g.length <= 1
      ? `<p class="bien">✔ Todas las ${miles(n)} personas están emparentadas entre sí (forman un solo grupo).</p>`
      : `<p class="aviso">Hay <b>${miles(g.length)} grupos</b> de personas sin ningún parentesco entre ellos.
         El grupo principal tiene ${miles(principal.length)} personas; los otros ${miles(g.length - 1)} grupos suman ${miles(enOtros)} personas.
         Si no esperabas grupos sueltos, ahí puede haber gente ajena o personas a las que falta unir con su familia.</p>
         <table class="estad"><tr><th>Grupo</th><th>Personas</th><th>Apellidos principales</th><th>Años</th><th>Ejemplo</th></tr>
         ${g.slice(0, 100).map(grupoFila).join('')}</table>
         ${g.length > 100 ? `<p class="peq">… y ${miles(g.length - 100)} grupos más.</p>` : ''}`}
    ${e.sueltas.length ? `<p>${miles(e.sueltas.length)} personas están <b>solas</b> (sin padres, cónyuge ni hijos en el archivo); cada una cuenta como un grupo.</p>` : ''}
    <details><summary><b>Todos los apellidos</b> (${miles(e.apellidos.length)}) — para ver si se coló alguno que no es de la familia</summary>
      <p class="lista-apellidos">${e.apellidos.map(([a, k]) => `<a href="#/buscar" data-apellido="${esc(a)}">${esc(a)}</a> <span class="peq">${k}</span>`).join(' · ')}</p></details>
    </section>

    <section><h3>Resumen</h3><table class="estad">
      ${fila('Personas', miles(n))}
      ${fila('Hombres', miles(e.sexo.M), pct(e.sexo.M, n))}
      ${fila('Mujeres', miles(e.sexo.F), pct(e.sexo.F, n))}
      ${e.sexo.U ? fila('Sexo desconocido', miles(e.sexo.U), pct(e.sexo.U, n)) : ''}
      ${fila('Familias (parejas)', miles(e.F.length), `${miles(e.conHijos.length)} con hijos`)}
      ${fila('Media de hijos por familia con hijos', media(e.conHijos.map(f => f.hijos.length)).toFixed(1).replace('.', ','))}
      ${e.masHijos ? fila('Familia con más hijos', miles(e.masHijos.hijos.length), quien(arbol.p(e.masHijos.marido)) + (e.masHijos.mujer ? ' y' + quien(arbol.p(e.masHijos.mujer)) : '')) : ''}
      ${fila('Generaciones', miles(e.gens.max), e.gens.quien ? 'la cadena más larga de padres a hijos llega hasta' + quien(arbol.p(e.gens.quien)) : '')}
      ${fila('Personas sin ninguna fecha', miles(e.sinFechas.length), pct(e.sinFechas.length, n))}
      ${e.sinNombre.length ? fila('Personas sin nombre', miles(e.sinNombre.length)) : ''}
      ${fila('Con fecha de nacimiento o bautismo', miles(e.nac.length), pct(e.nac.length, n))}
      ${fila('Con fecha de defunción o entierro', miles(e.def.length), pct(e.def.length, n))}
    </table></section>

    <section><h3>Fechas</h3><table class="estad">
      ${fila('Fecha más antigua', anioDe(e.antigua), e.antigua ? quien(e.antigua[1]) : '')}
      ${fila('Fecha más reciente', anioDe(e.reciente), e.reciente ? quien(e.reciente[1]) : '')}
      ${fila('Nacimientos', e.nacMin ? `${e.nacMin[0]}–${e.nacMax[0]}` : '—', e.nacMin ? `el primero,${quien(e.nacMin[1])}; el último,${quien(e.nacMax[1])}` : '')}
      ${fila('Defunciones', e.defMin ? `${e.defMin[0]}–${e.defMax[0]}` : '—', e.defMin ? `la primera,${quien(e.defMin[1])}; la última,${quien(e.defMax[1])}` : '')}
      ${e.edades.length ? fila('Edad media al morir', Math.round(media(e.edades.map(x => x[0]))) + ' años', `con ${miles(e.edades.length)} personas de las que se saben los dos años`) : ''}
      ${e.mayor ? fila('Vida más larga', e.mayor[0] + ' años', quien(e.mayor[1]) + ` <span class="peq">${esc(vida(e.mayor[1]))}</span>`) : ''}
    </table>
    ${pintarSiglos(e)}</section>

    <section class="dos"><div><h3>Apellidos más frecuentes</h3>${tablaCuenta(e.apellidos, 25)}</div>
      <div><h3>Lugares más frecuentes</h3>${tablaCuenta(e.lugares, 25)}</div></section>
    <section class="dos"><div><h3>Nombres de hombre</h3>${tablaCuenta(e.nombresH, 10)}</div>
      <div><h3>Nombres de mujer</h3>${tablaCuenta(e.nombresM, 10)}</div></section>

    <section><h3>Contenido del archivo</h3><table class="estad">
      ${e.tipos.map(([t, k]) => fila(esc(tiposNombre[t] || t), miles(k))).join('')}
    </table></section>
  </div>`;
}

// Nacimientos por siglo, en barras sencillas.
function pintarSiglos(e) {
  const m = new Map();
  for (const [y] of e.nac) { const s = Math.floor((y - 1) / 100) + 1; m.set(s, (m.get(s) || 0) + 1); }
  if (!m.size) return '';
  const max = Math.max(...m.values());
  const ROM = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
  return `<h4>Nacimientos por siglo</h4><div class="barras">${[...m.entries()].sort((a, b) => a[0] - b[0]).map(([s, k]) =>
    `<div class="barra"><span class="et">s. ${ROM[s] || s}</span><span class="b" style="width:${Math.max(1, 100 * k / max)}%"></span><span class="n">${miles(k)}</span></div>`).join('')}</div>`;
}
