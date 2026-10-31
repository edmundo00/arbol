// Mural en mariposa: una pareja (o una persona) en el centro, los antepasados de uno a la izquierda y los del otro
// a la derecha, y los hijos debajo. Pensado para carteles grandes (A0 o a medida).
// Para que quepa más gente:
// - cada rama ocupa solo el alto de los antepasados que se conocen (no se reserva sitio para los que faltan);
// - cada persona va a media altura entre sus padres;
// - las columnas se meten unas encima de otras cuando sus cajas no chocan en vertical;
// - el detalle (3 renglones, 2 o 1) se elige solo, de fuera hacia dentro, hasta que la letra tenga el tamaño mínimo.
import { anios } from './modelo.js?v=202611010017';
import { valor } from './gedcom.js?v=202611010017';
import { esc } from './md.js?v=202611010017';

const LETRA = "Georgia, 'Times New Roman', serif";
const TINTA = '#2a2420', GRIS = '#6f655c', LINEA = '#7a6a5a';
const NACE = '✻', CASA = '⚭', MUERE = '✝';
const MESES = { JAN: 'ene', FEB: 'feb', MAR: 'mar', APR: 'abr', MAY: 'may', JUN: 'jun', JUL: 'jul', AUG: 'ago', SEP: 'sep', OCT: 'oct', NOV: 'nov', DEC: 'dic' };
// Medidas en «unidades de letra»: 1 = tamaño de la letra del nombre.
const RENGLON = 1.2, PAD = 0.35, HUECO_V = 0.16, HUECO_H = 1.6, CENTRO = 2.4;
const FACTOR = 0.53;   // ancho medio de una letra de Georgia respecto a su tamaño

// ---------- Fechas y lugares cortos ----------
export function fechaCorta(d, completa) {
  if (!d) return '';
  d = d.trim().replace(/@#D\w+@ /g, '');
  let m;
  if ((m = /^BET (.+) AND (.+)$/.exec(d)) || (m = /^FROM (.+) TO (.+)$/.exec(d))) return `${anios(m[1])[0] ?? '?'}/${anios(m[2])[0] ?? '?'}`;
  const pre = /^(ABT|CAL|EST)\b/.test(d) ? 'h. ' : /^BEF\b/.test(d) ? 'ant. ' : /^AFT\b/.test(d) ? 'desp. ' : '';
  const resto = d.replace(/^(ABT|CAL|EST|BEF|AFT|FROM|TO|INT)\s+/, '').replace(/\(.*\)/, '').trim();
  if (!completa || pre) { const a = anios(resto)[0]; return a ? pre + a : ''; }
  return resto.replace(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g, x => MESES[x]);
}

// Lugar corto: la tabla del usuario manda; si no, se quita lo que va entre paréntesis y lo que va tras la primera coma.
export function acortador(tabla) {
  const t = new Map();
  for (const l of (tabla || '').split('\n')) { const k = l.indexOf('='); if (k > 0) t.set(l.slice(0, k).trim().toLowerCase(), l.slice(k + 1).trim()); }
  return lugar => {
    if (!lugar) return '';
    const x = t.get(lugar.trim().toLowerCase());
    if (x != null) return x;
    return lugar.replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();
  };
}

// Rótulo: el propio del usuario o, si se pide, la primera parte del título o del oficio del GEDCOM.
export function rotuloGedcom(arbol, id) {
  const a = arbol.registro(id)?.arbol; if (!a) return '';
  const v = valor(a, 'TITL') || valor(a, 'OCCU');
  return v.split(/[;(]/)[0].trim().replace(/[,.]$/, '').slice(0, 60);
}

// ---------- Contenido de cada caja ----------
function boda(arbol, famId) {
  const f = famId && arbol.f(famId); if (!f) return null;
  return f.eventos.find(e => e.tag === 'MARR') || null;
}

function renglones(arbol, id, nivel, famBoda, o) {
  const p = arbol.p(id);
  const nombre = [p.nombre, p.apellidos].filter(Boolean).join(' ') || '(sin nombre)';
  const rot = o.rotulo(id);
  const ev = (simbolo, e, completa) => {
    if (!e) return '';
    const f = fechaCorta(e.fecha, completa), l = o.lugar(e.lugar);
    return f || l ? `${simbolo} ${[f, l].filter(Boolean).join(' ')}` : '';
  };
  if (nivel >= 3) {
    const r = [{ t: nombre, k: 'n' }];
    if (rot) r.push({ t: rot, k: 'r' });
    for (const x of [ev(NACE, p.nac, true), ev(CASA, boda(arbol, famBoda), true), ev(MUERE, p.def, true)]) if (x) r.push({ t: x, k: 'd' });
    return r;
  }
  if (nivel === 2) {
    const r = [{ t: nombre, k: 'n' }];
    if (rot) r.push({ t: rot, k: 'r' });
    const d = [ev(NACE, p.nac, false), ev(MUERE, p.def, false)].filter(Boolean).join('  ');
    if (d) r.push({ t: d, k: 'd' });
    return r;
  }
  const a = p.nac ? fechaCorta(p.nac.fecha) : '', b = p.def ? fechaCorta(p.def.fecha) : '';
  return [{ t: nombre + (a || b ? ` (${a ? NACE + a : ''}${a && b ? ' – ' : ''}${b ? MUERE + b : ''})` : ''), k: 'n' }];
}
const TAM = { n: 1, r: 0.8, d: 0.8 };
function medir(lineas) {
  return { w: Math.max(...lineas.map(l => l.t.length * FACTOR * TAM[l.k])) + 2 * PAD, h: lineas.length * RENGLON + (lineas.length > 1 ? 0.42 : 0.18) };
}

// ---------- Un lado del mural: los antepasados de una persona, de dentro hacia fuera ----------
function construir(arbol, id, g, gens, niveles, famBoda, o, cuenta, pares) {
  const lineas = renglones(arbol, id, niveles[g] ?? 1, famBoda, o);
  const n = { id, g, lineas, ...medir(lineas), padres: [] };
  cuenta.n++;
  if (g < gens) {
    const f = arbol.padres(id)[0];
    if (f) for (const x of [f.marido, f.mujer]) if (x && arbol.p(x)) n.padres.push(construir(arbol, x, g + 1, gens, niveles, f.id, o, cuenta, pares));
  }
  // Padres sin antepasados conocidos: uno al lado del otro, en el mismo renglón («Juan ⚭ María»).
  if (pares && n.padres.length === 2 && !n.padres[0].padres.length && !n.padres[1].padres.length) {
    n.parHoja = true; n.padres[1].sub = 1;
    const h = Math.max(n.padres[0].h, n.padres[1].h);
    n.padres.forEach(x => { x.ext = h + HUECO_V; });
    n.ext = Math.max(n.h + HUECO_V, h + HUECO_V);
    return n;
  }
  const suma = n.padres.reduce((s, p) => s + p.ext, 0) + HUECO_V * Math.max(0, n.padres.length - 1);
  n.ext = Math.max(n.h + HUECO_V, suma);
  return n;
}
function colocar(n, arriba) {
  if (!n.padres.length) { n.y = arriba + n.ext / 2; return; }
  if (n.parHoja) { n.y = arriba + n.ext / 2; n.padres.forEach(x => { x.y = n.y; }); return; }
  const suma = n.padres.reduce((s, p) => s + p.ext, 0) + HUECO_V * (n.padres.length - 1);
  let t = arriba + (n.ext - suma) / 2;
  for (const p of n.padres) { colocar(p, t); t += p.ext + HUECO_V; }
  n.y = (n.padres[0].y + n.padres[n.padres.length - 1].y) / 2;
}
function porColumnas(raiz) {
  const cols = [], ir = n => { (cols[n.g] ||= []).push(n); n.padres.forEach(ir); };
  ir(raiz); return cols;
}
// Distancia de cada columna al centro: lo justo para no chocar con las cajas de dentro que están a su altura.
const PAR = 1.4;   // hueco para el ⚭ entre los dos de una pareja en el mismo renglón
function columnas(cols, obstaculos) {
  const xs = [], ws = [], wb = [];
  for (let g = 1; g < cols.length; g++) {
    if (!cols[g]) continue;
    wb[g] = Math.min(Math.max(...cols[g].map(n => n.w)), 40);
    ws[g] = cols[g].some(n => n.sub) ? 2 * wb[g] + PAR : wb[g];
    if (g === 1) { xs[g] = 0; continue; }
    let x = xs[g - 1] + 2.2;   // siempre un poco más fuera que sus hijos, para que se vea la línea
    const choca = (a, b) => Math.abs(a.y - b.y) < (a.h + b.h) / 2 + HUECO_V;
    for (let j = 1; j < g; j++) {
      if (!cols[j]) continue;
      const lista = j === 1 ? [...cols[1], ...obstaculos] : cols[j];
      if (cols[g].some(b => lista.some(a => choca(a, b)))) x = Math.max(x, xs[j] + (j === 1 && obstaculos.length ? Math.max(ws[1], obstaculos[0].w) : ws[j]) + HUECO_H);
    }
    xs[g] = x;
  }
  return { xs, ws, wb };
}

// ---------- El mural completo ----------
// o: { id, fam (familia del centro o null), gens, W, H (mm), minLetra (mm), rotulo(id), lugar(texto), titulo, sub, firma }
export function mural(arbol, o) {
  const p = arbol.p(o.id);
  const fam = o.fam ? arbol.f(o.fam) : null;
  // Raíces de los dos lados y lo que va en el centro
  let izq, der, centro;
  if (fam) { izq = fam.marido; der = fam.mujer; centro = { tipo: 'pareja', hijos: [...fam.hijos].sort((a, b) => (arbol.p(a)?.ymin ?? 9999) - (arbol.p(b)?.ymin ?? 9999)) }; }
  else { const f = arbol.padres(o.id)[0]; izq = f?.marido; der = f?.mujer; centro = { tipo: 'persona' }; }
  const famIzq = fam ? fam.id : arbol.padres(o.id)[0]?.id;

  const W = o.W, H = o.H, margen = Math.min(W, H) * 0.025, tit = H * 0.06;
  const anchoUtil = W - 2 * margen, altoUtil = H - tit - 2 * margen;
  const gens = o.gens;
  const probar = (niv, pares) => {
    const r = disponer(arbol, izq, der, famIzq, centro, o, gens, niv, pares);
    r.escala = Math.min(anchoUtil / r.ancho, altoUtil / r.alto, o.maxLetra || 6);
    r.pares = pares;
    return r;
  };
  // Se baja el detalle de fuera hacia dentro mientras la letra no llegue al mínimo, pero solo en las generaciones
  // donde eso hace crecer la letra. Se prueba con y sin parejas en un renglón y se queda lo que dé letra mayor.
  const ajustar = pares => {
    let niveles = Array(gens + 2).fill(3), res = probar(niveles, pares);
    for (let g = gens; g >= 1 && res.escala < o.minLetra; g--) {
      let mejor = null;
      for (let nv = niveles[g] - 1; nv >= 1; nv--) {
        const prueba = niveles.slice(); prueba[g] = nv;
        const r = probar(prueba, pares);
        if (r.escala > (mejor ? mejor.r.escala : res.escala * 1.01)) mejor = { r, prueba };
      }
      if (mejor) { niveles = mejor.prueba; res = mejor.r; }
    }
    res.niveles = niveles;
    return res;
  };
  const a = ajustar(false), b = ajustar(true);
  const res = b.escala > a.escala * 1.02 ? b : a, niveles = res.niveles;
  return { svg: dibujar(res, o, W, H, margen, tit, anchoUtil, altoUtil, arbol), letra: res.escala, personas: res.personas, niveles };
}

function disponer(arbol, izq, der, famIzq, centro, o, gens, niveles, pares) {
  const cuenta = { n: 0 };
  const lados = [izq, der].map(r => r && arbol.p(r) ? construir(arbol, r, 1, gens, niveles, famIzq, o, cuenta, pares) : null);
  lados.forEach(l => l && colocar(l, 0));
  // Las dos raíces a la misma altura
  const arriba = Math.max(...lados.map(l => l ? l.y : 0));
  const desp = lados.map(l => l ? arriba - l.y : 0);
  const mover = (n, d) => { n.y += d; n.padres.forEach(x => mover(x, d)); };
  lados.forEach((l, i) => l && mover(l, desp[i]));
  // Centro: la persona entre sus padres, o los hijos de la pareja debajo
  const extra = [];
  let yc = arriba;
  if (centro.tipo === 'persona') {
    const lin = renglones(arbol, o.id, 3, null, o);
    extra.push({ id: o.id, lineas: lin, ...medir(lin), centro: true });
  } else {
    const alto0 = Math.max(...lados.filter(Boolean).map(l => l.h));
    yc = arriba + alto0 / 2 + 1.2;
    for (const h of centro.hijos) {
      if (!arbol.p(h)) continue;
      const lin = renglones(arbol, h, 2, null, o);
      const c = { id: h, lineas: lin, ...medir(lin), hijo: true };
      c.y = yc + c.h / 2; yc += c.h + HUECO_V;
      extra.push(c); cuenta.n++;
    }
  }
  const anchoCentro = extra.length ? Math.max(...extra.map(e => e.w)) : 0;
  if (centro.tipo === 'persona') extra[0].y = arriba;
  // Columnas de cada lado; el centro (persona o hijos) es un obstáculo para las columnas de dentro.
  const medio = centro.tipo === 'persona' ? anchoCentro / 2 + CENTRO : CENTRO / 2;
  const obst = extra.map(e => ({ y: e.y, h: e.h, w: Math.max(0, e.w / 2 - medio) }));
  const disp = lados.map(l => l ? { raiz: l, cols: porColumnas(l), ...columnas(porColumnas(l), centro.tipo === 'pareja' ? obst : []) } : null);
  const anchoLado = disp.map(d => d ? Math.max(...d.cols.map((c, g) => c ? d.xs[g] + d.ws[g] : 0).filter(x => x)) : 0);
  const mitad = Math.max(anchoLado[0], anchoLado[1]) + medio;
  let ymin = Infinity, ymax = -Infinity;
  const todos = [...extra];
  disp.forEach(d => d && d.cols.forEach(c => c && c.forEach(n => todos.push(n))));
  for (const n of todos) { ymin = Math.min(ymin, n.y - n.h / 2); ymax = Math.max(ymax, n.y + n.h / 2); }
  return { disp, extra, medio, mitad, ancho: 2 * mitad, alto: ymax - ymin, ymin, arriba, centro, personas: cuenta.n + (centro.tipo === 'persona' ? 1 : 0) };
}

// ---------- Dibujo ----------
function caja(x, y, w, h, n, sexo) {
  const borde = sexo === 'F' ? '#a23b72' : sexo === 'M' ? '#2f6690' : LINEA;
  let s = `<rect x="${f(x)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="0.35" fill="#fffdf8" fill-opacity="0.92" stroke="${borde}" stroke-width="0.07"/>`;
  let yy = y - h / 2 + PAD * 0.6 + RENGLON * 0.78;
  for (const l of n.lineas) {
    const fs = TAM[l.k], max = w - 2 * PAD, est = l.t.length * FACTOR * fs;
    const ajuste = est > max ? ` textLength="${f(max)}" lengthAdjust="spacingAndGlyphs"` : '';
    const estilo = l.k === 'n' ? '' : l.k === 'r' ? ' font-style="italic" fill="#5b3a1e"' : ` fill="${GRIS}"`;
    s += `<text x="${f(x + PAD)}" y="${f(yy)}" font-size="${fs}"${estilo}${ajuste}>${esc(l.t)}</text>`;
    yy += RENGLON;
  }
  return s;
}
const f = v => (Math.round(v * 100) / 100).toString();

function dibujar(r, o, W, H, margen, tit, anchoUtil, altoUtil, arbol) {
  const s = r.escala;
  let cuerpo = '', lineas = '';
  // Lados: el izquierdo se dibuja en espejo
  r.disp.forEach((d, lado) => {
    if (!d) return;
    const sig = lado === 0 ? -1 : 1;
    const X = (n) => { const x0 = r.medio + d.xs[n.g] + (n.sub || 0) * (d.wb[n.g] + PAR); return sig < 0 ? -x0 - d.wb[n.g] : x0; };
    const dentro = n => sig < 0 ? X(n) + d.wb[n.g] : X(n);
    const fuera = n => sig < 0 ? X(n) : X(n) + d.wb[n.g];
    const ir = n => {
      cuerpo += caja(X(n), n.y, d.wb[n.g], n.h, n, arbol.p(n.id)?.sexo);
      for (const p of n.padres) {
        if (p.sub) {
          const xa = fuera(n.padres[0]), xb = dentro(p);
          cuerpo += `<text x="${f((xa + xb) / 2)}" y="${f(p.y + 0.33)}" font-size="0.85" text-anchor="middle" fill="${GRIS}">${CASA}</text>`;
          ir(p); continue;
        }
        const xh = fuera(n), xp = dentro(p);
        if ((xp - xh) * sig > 0.6) {
          // Hay hueco entre columnas: codo normal
          const xm = xh + sig * Math.min(0.8, Math.abs(xp - xh) / 2);
          lineas += `<path d="M${f(xh)} ${f(n.y)}H${f(xm)}V${f(p.y)}H${f(xp)}"/>`;
        } else {
          // Columnas montadas: la línea sale por arriba o por abajo de la caja del hijo
          const xv = xp - sig * 0.6;
          const y0 = p.y < n.y ? n.y - n.h / 2 : n.y + n.h / 2;
          lineas += `<path d="M${f(xv)} ${f(y0)}V${f(p.y)}H${f(xp)}"/>`;
        }
        ir(p);
      }
    };
    ir(d.raiz);
  });
  // Centro
  if (r.centro.tipo === 'pareja') {
    const [a, b] = r.disp;
    if (a && b) lineas += `<path d="M${f(-r.medio)} ${f(r.arriba)}H${f(r.medio)}"/>`;
    if (r.extra.length) {
      const ult = r.extra[r.extra.length - 1];
      lineas += `<path d="M0 ${f(r.arriba)}V${f(ult.y)}"/>`;
      for (const c of r.extra) cuerpo += caja(-c.w / 2, c.y, c.w, c.h, c, arbol.p(c.id)?.sexo);
    }
  } else {
    const c = r.extra[0];
    cuerpo += caja(-c.w / 2, c.y, c.w, c.h, c, arbol.p(c.id)?.sexo);
    r.disp.forEach((d, lado) => { if (d) lineas += `<path d="M${f(lado ? c.w / 2 : -c.w / 2)} ${f(c.y)}H${f(lado ? r.medio : -r.medio)}"/>`; });
  }
  const tx = W / 2, ty = tit + margen + (altoUtil - r.alto * s) / 2 - r.ymin * s;
  const titulo = `<text x="${f(W / 2)}" y="${f(margen + tit * 0.55)}" font-size="${f(tit * 0.5)}" text-anchor="middle" font-weight="bold">${esc(o.titulo || '')}</text>`
    + (o.sub ? `<text x="${f(W / 2)}" y="${f(margen + tit * 0.95)}" font-size="${f(tit * 0.2)}" text-anchor="middle" fill="${GRIS}">${esc(o.sub)}</text>` : '');
  const ley = leyenda(W, H, margen, Math.max(s, 2.2), o.firma);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="${LETRA}" fill="${TINTA}">
<rect width="${W}" height="${H}" fill="#fff"/>${titulo}
<g transform="translate(${f(tx)} ${f(ty)}) scale(${s.toFixed(4)})"><g fill="none" stroke="${LINEA}" stroke-width="0.08">${lineas}</g>${cuerpo}</g>${ley}</svg>`;
}

function leyenda(W, H, margen, fs, firma) {
  const l = [`${NACE} nacimiento   ${CASA} matrimonio   ${MUERE} defunción`, 'h. hacia · ant. antes de · desp. después de · 1700/1710 entre dos años'];
  if (firma) l.unshift(firma);
  return l.map((t, i) => `<text x="${f(W - margen)}" y="${f(H - margen - (l.length - 1 - i) * fs * 1.3)}" font-size="${f(i === 0 && firma ? fs * 1.1 : fs * 0.85)}" text-anchor="end" fill="${GRIS}"${i === 0 && firma ? ' font-style="italic"' : ''}>${esc(t)}</text>`).join('');
}
