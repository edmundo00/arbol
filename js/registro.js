// Documentos y citas: están en el GEDCOM (fuentes con «1 REFN reg:<id>», igual que scripts/registro/documentos_ged.py).
import { hijos, valor } from './gedcom.js?v=202611062159';
import { nombreCompleto, anios as aniosFecha } from './modelo.js?v=202611062159';

export const GRADOS = [['A', 'A — lo dice el documento'], ['B', 'B — indirecto o resumen'], ['C', 'C — deducido'], ['?', '? — sin leer']];
export const QUAY = { A: '3', B: '2', C: '1', N: '1', P: '1', '?': '0' };
const DE_QUAY = { 3: 'A', 2: 'B', 1: 'C', 0: '?' };

// ---------- Documentos: fuentes con «1 REFN reg:<id>», con lo que hace falta para filtrarlos ----------
const CLASES = [['Bautismo o nacimiento', /bautis|bautiz|nacimiento|nacid/], ['Matrimonio', /matrimon|casados|velaci/], ['Defunción', /defunci|difuntos|entierro/],
  ['Testamento', /testament/], ['Padrón', /padr[oó]n|censo|vecindario/], ['Catastro', /catastro/], ['Pleito', /pleito|ejecutoria/], ['Hidalguía', /hidalgu|limpieza/],
  ['Escritura', /escritura|protocolo|notarial|escabin/], ['Prensa', /prensa|esquela|art[ií]culo/], ['Libro', /libro/]];
const clasePor = t => CLASES.find(([, r]) => r.test(t))?.[0];
// Primero lo que dice el campo de tipo; si es «sin clasificar», el título
const claseDoc = (tipo, titulo) => clasePor(String(tipo).toLowerCase()) || clasePor(String(titulo).toLowerCase()) || 'Otro';
// Años de un texto, sin confundirlos con números de foto como «DSC1700» o «pag1936»
const ANIO = /(?<![0-9A-Za-z])(1[0-9]{3}|20[0-2][0-9])(?![0-9A-Za-z])/g;
const rangoAnios = t => { const l = (String(t || '').match(ANIO) || []).map(Number); return l.length ? { a: Math.min(...l), b: Math.max(...l) } : null; };

export function leerDocumentos(ged) {
  const m = new Map();
  for (const r of ged.registros) {
    if (r.tipo !== 'SOUR' || !r.raw.includes('reg:')) continue;
    for (const n of hijos(r.arbol, 'REFN')) {
      if (!String(n.valor).startsWith('reg:')) continue;
      const id = n.valor.slice(4).trim(), fecha = valor(r.arbol, '_FECHA') || '', tipo = valor(r.arbol, '_TIPO') || '';
      let titulo = valor(r.arbol, 'TITL') || id;
      if (fecha && titulo.endsWith(` (${fecha})`)) titulo = titulo.slice(0, -fecha.length - 3);
      const trans = hijos(r.arbol, '_TRANS').map(x => x.valor);
      const ruta = (/Fotos: \d+, en ([^\r\n]*?)\.?\r?\n/.exec(r.raw)?.[1] || trans[0]?.replace(/\/[^/]*$/, '') || '').trim();
      const sitio = ruta.split('/')[2] || '';
      m.set(id, { id, sour: r.xref, titulo, fecha, tipo, transcripcion: trans.join('|'),
        clase: claseDoc(tipo, titulo), anios: rangoAnios(fecha) || rangoAnios(titulo) || rangoAnios(ruta) || rangoAnios(id),
        sitio: sitio.startsWith('_') ? '' : sitio, lugar: [ruta, valor(r.arbol, 'PUBL'), titulo].filter(Boolean).join(' ') });
    }
  }
  return m;
}
// Lo que necesita el cuadro de citar de cada documento
export const docCitable = d => ({ id: d.id, titulo: d.titulo + (d.fecha ? ` (${d.fecha})` : ''), clase: d.clase, anios: d.anios, sitio: d.sitio, lugar: d.lugar });

// Años en los que un documento puede hablar de esta persona: su vida y 30 años más (testamentarías, pleitos, «difunto»).
// Sin fechas propias se calcula por su familia, con márgenes anchos, porque es mejor enseñar de más que esconder lo bueno. null si no hay de dónde sacarlo.
export function vidaEstimada(arbol, id) {
  const p = arbol.p(id);
  if (!p) return null;
  if (p.ymin != null) {
    const nac = aniosFecha(p.nac?.fecha)[0] ?? null, def = aniosFecha(p.def?.fecha)[0] ?? null;
    const desde = nac ?? p.ymin - 90, hasta = def != null ? def + 30 : nac != null ? nac + 110 : p.ymax + 90;
    return { desde, hasta, texto: nac != null && def != null ? `${nac}–${def}, y 30 años más` : `h. ${desde}–${hasta}, aproximado` };
  }
  const tramos = [], pon = (x, f) => { const q = x && arbol.p(x); if (q && q.ymin != null) tramos.push(f(q)); };
  const fams = p.fams.map(f => arbol.f(f)).filter(Boolean), famc = p.famc.map(f => arbol.f(f)).filter(Boolean);
  for (const f of fams) {
    pon(f.marido === id ? f.mujer : f.marido, q => [q.ymin - 70, q.ymax + 70]);
    for (const h of f.hijos) pon(h, q => [q.ymin - 80, q.ymin + 80]);
  }
  for (const f of famc) {
    for (const x of [f.marido, f.mujer]) pon(x, q => [q.ymin, q.ymax + 110]);
    for (const h of f.hijos) if (h !== id) pon(h, q => [q.ymin - 50, q.ymin + 110]);
  }
  if (!tramos.length) return null;
  let desde = Math.max(...tramos.map(t => t[0])), hasta = Math.min(...tramos.map(t => t[1]));
  if (desde > hasta) { desde = Math.min(...tramos.map(t => t[0])); hasta = Math.max(...tramos.map(t => t[1])); }   // la familia no cuadra entre sí
  return { desde, hasta, texto: `h. ${desde}–${hasta}, calculado por su familia` };
}

// ---------- Documentos de la familia de una persona, para no tener que buscarlos entre miles ----------
const palabras = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'das', 'dos']);

// Sus parientes cercanos, primero los cónyuges. papel: lo que es la persona respecto a ese pariente.
function parientes(arbol, id) {
  const p = arbol.p(id), l = [];
  const sx = (x, m, f, o) => x.sexo === 'F' ? f : x.sexo === 'M' ? m : o;
  const pon = (x, rel, papel) => {
    const q = x && arbol.p(x);
    if (q && x !== id && !l.some(y => y.x === x)) l.push({ x, q, rel: rel(q), papel: `${papel} de ${nombreCompleto(q)}` });
  };
  const fams = p.fams.map(f => arbol.f(f)).filter(Boolean), famc = p.famc.map(f => arbol.f(f)).filter(Boolean);
  for (const f of fams) pon(f.marido === id ? f.mujer : f.marido, q => sx(q, 'su marido', 'su mujer', 'su cónyuge'), sx(p, 'Esposo', 'Esposa', 'Cónyuge'));
  for (const f of fams) for (const h of f.hijos) pon(h, q => sx(q, 'su hijo', 'su hija', 'su hijo o hija'), sx(p, 'Padre', 'Madre', 'Padre o madre'));
  for (const f of famc) {
    pon(f.marido, () => 'su padre', sx(p, 'Hijo', 'Hija', 'Hijo o hija'));
    pon(f.mujer, () => 'su madre', sx(p, 'Hijo', 'Hija', 'Hijo o hija'));
  }
  for (const f of famc) for (const h of f.hijos) pon(h, q => sx(q, 'su hermano', 'su hermana', 'su hermano o hermana'), sx(p, 'Hermano', 'Hermana', 'Hermano o hermana'));
  return l;
}

// Recorre las citas de un registro, también las que están dentro de un hecho (DEAT, MARR…)
function cadaCita(nodo, f) { for (const h of nodo.hijos) { if (h.tag === 'SOUR') f(h); else cadaCita(h, f); } }

// Lista para el cuadro de citar: primero lo que ya tiene citado su familia (con su papel, lo que prueba y su grado, para no
// reescribirlo) y después, solo por el nombre del título, lo que parece suyo o de un pariente y aún no está citado en nadie cercano.
// Lo que la persona ya tiene citado no sale.
export function docsDeFamilia(arbol, id, docs) {
  const p = arbol.p(id), r = arbol.registro(id);
  if (!p || !r) return [];
  const porSour = new Map([...docs.values()].map(d => [d.sour, d]));
  const docDe = c => docs.get(valor(c, '_REG').trim()) || porSour.get(c.valor);
  const suyos = new Set();
  cadaCita(r.arbol, c => { const d = docDe(c); if (d) suyos.add(d.id); });
  const vistos = new Set(suyos), lista = [];
  const anadirCitas = (registro, quien, papel) => cadaCita(registro.arbol, c => {
    const d = docDe(c);
    if (!d || vistos.has(d.id)) return;
    vistos.add(d.id);
    const nota = hijos(c, 'NOTE').map(n => arbol.notaTexto(n)).join(' ').replace(/\s+/g, ' ').trim();
    lista.push({ ...docCitable(d), quien, papel, que: nota.replace(/^[^:]{1,60}:\s*/, ''), grado: DE_QUAY[valor(c, 'QUAY')] || '' });
  });
  const cercanos = parientes(arbol, id);
  const conyuges = new Set(p.fams.map(f => arbol.f(f)).filter(Boolean).map(f => f.marido === id ? f.mujer : f.marido));
  for (const x of cercanos.filter(y => conyuges.has(y.x))) anadirCitas(arbol.registro(x.x), `de ${x.rel}, ${nombreCompleto(x.q)}`, x.papel);
  for (const f of p.fams) { const rf = arbol.registro(f); if (rf) anadirCitas(rf, 'de su boda', p.sexo === 'F' ? 'Novia' : p.sexo === 'M' ? 'Novio' : 'Contrayente'); }
  for (const x of cercanos.filter(y => !conyuges.has(y.x))) anadirCitas(arbol.registro(x.x), `de ${x.rel}, ${nombreCompleto(x.q)}`, x.papel);
  // Por el nombre: «Defunción: Fernandez Maria» → nombre de pila y primer apellido, en cualquier orden
  const clave = q => [palabras(q.nombre)[0], palabras(q.apellidos).find(w => !PARTICULAS.has(w))];
  const candidatos = [{ q: p, quien: '¿suyo?, por el nombre', papel: '' }, ...cercanos.map(x => ({ q: x.q, quien: `¿de ${x.rel}, ${nombreCompleto(x.q)}?, por el nombre`, papel: x.papel }))]
    .map(c => ({ ...c, clave: clave(c.q) })).filter(c => c.clave[0] && c.clave[1]);
  const titulos = [...docs.values()].filter(d => !vistos.has(d.id)).map(d => ({ d, w: new Set(palabras(d.titulo)) }));
  for (const c of candidatos) for (const { d, w } of titulos) {
    if (vistos.has(d.id) || !w.has(c.clave[0]) || !w.has(c.clave[1])) continue;
    vistos.add(d.id);
    lista.push({ ...docCitable(d), quien: c.quien, papel: c.papel, que: '', grado: '' });
  }
  return lista;
}

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
  const fotosRel = (d.imagenes || '').split('|').map(x => x.trim()).filter(Boolean);
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
