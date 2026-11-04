// Documentos y citas: están en el GEDCOM (fuentes con «1 REFN reg:<id>», igual que scripts/registro/documentos_ged.py).

export const GRADOS = [['A', 'A — lo dice el documento'], ['B', 'B — indirecto o resumen'], ['C', 'C — deducido'], ['?', '? — sin leer']];
export const QUAY = { A: '3', B: '2', C: '1', N: '1', P: '1', '?': '0' };

export const limpio = t => String(t ?? '').replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
const hoy = () => new Date().toISOString().slice(0, 10);

export function leerCsv(texto) {
  const l = texto.replace(/^﻿/, '').split(/\r?\n/).filter(x => x.trim());
  if (!l.length) return [];
  const cab = l[0].split(';');
  return l.slice(1).map(x => { const v = x.split(';'); return Object.fromEntries(cab.map((c, i) => [c, v[i] ?? ''])); });
}

// «1,3-5» → «img. 001, 003–005» 
export function paginas(imagenes) {
  const nums = new Set();
  for (const t of String(imagenes || '').split(',')) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(t);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b) && i - a < 2000; i++) nums.add(i);
  }
  const l = [...nums].sort((x, y) => x - y), out = [];
  for (let i = 0; i < l.length; i++) {
    let j = i; while (j + 1 < l.length && l[j + 1] === l[j] + 1) j++;
    const f = n => String(n).padStart(3, '0');
    out.push(i === j ? f(l[i]) : `${f(l[i])}–${f(l[j])}`); i = j;
  }
  return out.length ? 'img. ' + out.join(', ') : '';
}

// ---------- Fuente y fotos de un documento, idénticas a las de los programas (códigos estables por SHA-1) ----------
export async function sha1(t) {
  const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// Carpeta «Genealogia», sacada de las rutas de fotos que ya hay en el GEDCOM. Desde el 1-XI-2026 hay una sola
// (antes «Genealogia» y «Genealogia_2»): las rutas son relativas a ella.
export function bases(ged) {
  for (const r of ged.registros) {
    if (r.tipo !== 'OBJE') continue;
    if (/\n1 FILE \.\.\//.test(r.raw)) return { orig: '../..', proy: '../..', relativa: true };   // rutas relativas al GEDCOM
    const m = /\n1 _FILE (.*\\)Genealogia\\/i.exec(r.raw);
    if (m) return { orig: m[1] + 'Genealogia', proy: m[1] + 'Genealogia' };
  }
  return { orig: 'D:\\Dropbox\\Genealogia', proy: 'D:\\Dropbox\\Genealogia' };
}
const barra = t => t.replace(/\\/g, '/');
// Ruta absoluta (con «/») de una foto del registro: la carpeta «Genealogia» más su ruta relativa.
export function rutaFoto(rel, b) { return barra(b.orig) + '/' + rel; }
export function relFoto(f, b) {
  const g = barra(f);
  for (const base of [b.orig, b.proy]) { const x = barra(base).replace(/\/$/, '') + '/'; if (g.toLowerCase().startsWith(x.toLowerCase())) return g.slice(x.length).toLowerCase(); }
  return g.toLowerCase();
}
export function numero(f) { const m = /(\d+)\.\w+$/.exec(f); return m ? +m[1] : null; }
export async function xrefSour(id) { return '@SR' + (await sha1(id)).slice(0, 10).toUpperCase() + '@'; }
export async function xrefObje(id, f, b) { return '@M' + (await sha1(id + '|' + relFoto(f, b))).slice(0, 12).toUpperCase() + '@'; }
export function rango(texto) {
  const s = new Set();
  for (const t of String(texto || '').replace(/ /g, '').split(',').filter(Boolean)) {
    const [a, c] = t.split('-');
    if (!/^\d+$/.test(a) || (c !== undefined && !/^\d+$/.test(c))) continue;
    for (let i = +a; i <= +(c ?? a) && i - +a < 5000; i++) s.add(i);
  }
  return s;
}

// Registros SOUR y OBJE de un documento con fotos sin comodines (los que da de alta la aplicación).
// d: datos del documento nuevo. Devuelve { sr, textos, fotos: [{ f, m }] }, o null si la transcripción lleva «*».
export async function registrosDocumento(d, b) {
  const fotosRel = (d.imagenes || '').trim() ? [d.imagenes.trim()] : [];
  const fotos = [];
  for (const rel of fotosRel) { const f = rutaFoto(rel, b); fotos.push({ f, m: await xrefObje(d.id, f, b) }); }
  const sr = await xrefSour(d.id);
  const dir = f => f.slice(0, f.lastIndexOf('/'));
  const nota = [`Registro de documentos: ${d.id}.`, `Fecha: ${d.fecha || '—'}. Tipo: ${d.tipo}. Estado: ${d.estado}.`,
    `Fotos: ${fotos.length}` + (fotos.length ? `, en ${dir(fotos[0].f).replace(/^(\.\.\/)+/, '')}` : '') + '.'];
  if (/[*?]/.test(d.transcripcion || '')) return null;
  const trans = (d.transcripcion || '').split('|').filter(Boolean);
  if (trans.length) nota.push('Transcripción: ' + (trans.length === 1 ? trans[0] : `${trans.length} archivos, ${dir(trans[0])}/`));
  if (d.notas) nota.push(d.notas);
  const sour = [`0 ${sr} SOUR`, `1 TITL ${d.titulo}` + (d.fecha ? ` (${d.fecha})` : '')];
  if (d.archivo) sour.push(`1 PUBL ${d.archivo}`);
  sour.push(`1 NOTE ${nota[0]}`, ...nota.slice(1).map(x => `2 CONT ${x}`), `1 REFN reg:${d.id}`, ...(d.tipo ? [`1 _TIPO ${d.tipo}`] : []), ...(d.fecha ? [`1 _FECHA ${d.fecha}`] : []),
    `1 _ESTADO ${d.estado}`, ...trans.map(x => `1 _TRANS ${x}`), ...fotos.map(x => `1 OBJE ${x.m}`));
  const objes = fotos.map(({ f, m }) => {
    const n = numero(f), ext = f.split('.').pop().toLowerCase();
    return [`0 ${m} OBJE`, `1 FORM ${ext}`, `1 TITL ${d.titulo}` + (n !== null ? ` — img. ${String(n).padStart(3, '0')}` : ''),
      b.relativa ? `1 FILE ${f}` : `1 _FILE ${f.replace(/\//g, '\\')}`, `1 REFN reg:${d.id}`].join('\r\n');
  });
  return { sr, textos: [sour.join('\r\n'), ...objes], fotos };
}

// Código para un documento nuevo, sin repetir ninguno de los que hay.
export function idNuevo(texto, hay) {
  const base = 'app_' + String(texto).replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w]+/g, '_').toLowerCase().slice(0, 60);
  let id = base, k = 2;
  while (hay.has(id)) id = `${base}_${k++}`;
  return id;
}
