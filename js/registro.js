// Registro de documentos (9 Sistema/Control/registro): la aplicación añade filas a citas_app.csv y documentos_app.csv.
// generar.py (de las sesiones de Claude) las lee y pone las fuentes y fotos en el GEDCOM.
// Mismo formato que citas.csv y documentos.csv: UTF-8, «;» como separador, sin «;» dentro del texto.
import { bdLeer, bdGuardar } from './almacen.js?v=202611022100';

export const CAB_CITAS = 'doc;xref;papel;que_prueba;imagenes;grado;fecha_alta';
export const CAB_DOCS = 'id;titulo;fecha;tipo;archivo;imagenes;otros_archivos;transcripcion;ficha;estado;sour;notas';
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

// «1,3-5» → «img. 001, 003–005» (como generar.py)
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

export class Registro {
  constructor(dir) { this.dir = dir; }

  // Carpeta «9 Sistema/Control/registro» con permiso de escritura (se recuerda). Tiene que llamarse desde un clic.
  static async preparar() {
    let dir = await bdLeer('carpetaRegistro');
    if (dir) {
      // La recordada sigue valiendo si hay permiso y aún tiene documentos.csv; si no (p. ej. se ha movido de sitio), se olvida.
      let vale = false;
      try { vale = (await dir.requestPermission({ mode: 'readwrite' })) === 'granted' && !!(await dir.getFileHandle('documentos.csv')); } catch {}
      if (!vale) {
        await bdGuardar('carpetaRegistro', null);
        throw new Error(`La carpeta del registro «${dir.name}» ya no vale (sin permiso, o ha cambiado de sitio). Vuelve a pulsar el botón y elige la carpeta «Genealogia» (o «Genealogia\\9 Sistema\\Control\\registro»).`);
      }
    }
    if (!dir) dir = await window.showDirectoryPicker({ id: 'arbol-registro', mode: 'readwrite' });
    try { await dir.getFileHandle('documentos.csv'); }
    catch {
      // Si eligió «Genealogia», «9 Sistema» o «Control», se baja hasta registro
      for (const ruta of [['9 Sistema', 'Control', 'registro'], ['Control', 'registro'], ['registro']]) {
        try { let d = dir; for (const x of ruta) d = await d.getDirectoryHandle(x); await d.getFileHandle('documentos.csv'); dir = d; break; } catch {}
      }
      try { await dir.getFileHandle('documentos.csv'); }
      catch { throw new Error('Esa carpeta no es el registro de documentos. Elige la carpeta «Genealogia» (o «Genealogia\\9 Sistema\\Control\\registro»).'); }
    }
    await bdGuardar('carpetaRegistro', dir);
    return new Registro(dir);
  }

  async leer(nombre) {
    try { return await (await (await this.dir.getFileHandle(nombre)).getFile()).text(); } catch { return null; }
  }
  async escribir(nombre, texto) {
    const fh = await this.dir.getFileHandle(nombre, { create: true });
    const w = await fh.createWritable({ keepExistingData: false }); await w.write(texto); await w.close();
    if ((await (await fh.getFile()).text()) !== texto) throw new Error(`«${nombre}» no se ha escrito bien.`);
  }
  // Añade una fila (crea el archivo con su cabecera si no existe). Devuelve la línea escrita.
  async anadir(nombre, cabecera, valores) {
    const linea = valores.map(limpio).join(';');
    let t = await this.leer(nombre);
    if (t === null || !t.trim()) t = cabecera + '\n';
    const nl = t.includes('\r\n') ? '\r\n' : '\n';
    if (!t.endsWith('\n')) t += nl;
    await this.escribir(nombre, t + linea + nl);
    return linea;
  }
  // Quita una fila (la última igual a «linea»): para deshacer.
  async quitar(nombre, linea) {
    const t = await this.leer(nombre);
    if (t === null) return false;
    const l = t.split(/(\r?\n)/);
    for (let i = l.length - 1; i >= 0; i--) if (l[i] === linea) { l.splice(i, 2); await this.escribir(nombre, l.join('')); return true; }
    return false;
  }

  async citasApp() { return leerCsv((await this.leer('citas_app.csv')) || ''); }
  async docsApp() { return leerCsv((await this.leer('documentos_app.csv')) || ''); }

  // Cita (doc + persona). Devuelve la línea, o null si ya estaba.
  async citar({ doc, xref, papel, que, imagenes, grado }) {
    if ((await this.citasApp()).some(c => c.doc === doc && c.xref === xref)) return null;
    return this.anadir('citas_app.csv', CAB_CITAS, [doc, xref, papel, que, imagenes, grado, hoy()]);
  }

  // Documento nuevo (de la base de nombres) en documentos_app.csv; si ya estaba (misma transcripción o imagen), se reutiliza.
  async documento({ titulo, fecha, tipo, imagenes, transcripcion, notas }) {
    const docs = await this.docsApp();
    const ya = docs.find(d => (transcripcion && d.transcripcion === transcripcion) || (imagenes && d.imagenes === imagenes));
    if (ya) return { id: ya.id, linea: null };
    const base = 'app_' + (transcripcion || imagenes || titulo).replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w]+/g, '_').toLowerCase().slice(0, 60);
    let id = base, k = 2;
    while (docs.some(d => d.id === id)) id = `${base}_${k++}`;
    const linea = await this.anadir('documentos_app.csv', CAB_DOCS, [id, titulo, fecha, tipo, '', imagenes, '', transcripcion, '', transcripcion ? 'transcrito' : 'sin transcribir', '', notas]);
    return { id, linea };
  }
}

// ---------- Fuente y fotos de un documento, idénticas a las de generar.py (códigos estables por SHA-1) ----------
export async function sha1(t) {
  const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
// Carpeta «Genealogia», sacada de las rutas de fotos que ya hay en el GEDCOM. Desde el 1-XI-2026 hay una sola
// (antes «Genealogia» y «Genealogia_2»): las rutas del registro son relativas a ella, como en generar.py.
export function bases(ged) {
  for (const r of ged.registros) {
    if (r.tipo !== 'OBJE') continue;
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
// d: fila de documentos*.csv. Devuelve { sr, textos, fotos: [{ f, m }] } o null si sus fotos llevan «*» (eso lo hace generar.py).
export async function registrosDocumento(d, b) {
  if (/[*?|]/.test(d.imagenes || '') || (d.otros_archivos || '').trim()) return null;
  const fotosRel = (d.imagenes || '').trim() ? [d.imagenes.trim()] : [];
  const fotos = [];
  for (const rel of fotosRel) { const f = rutaFoto(rel, b); fotos.push({ f, m: await xrefObje(d.id, f, b) }); }
  const sr = await xrefSour(d.id);
  const dir = f => f.slice(0, f.lastIndexOf('/'));
  const nota = [`Registro de documentos: ${d.id}.`, `Fecha: ${d.fecha || '—'}. Tipo: ${d.tipo}. Estado: ${d.estado}.`,
    `Fotos: ${fotos.length}` + (fotos.length ? `, en ${dir(fotos[0].f)}` : '') + '.'];
  if (/[*?]/.test(d.transcripcion || '')) return null;
  const trans = (d.transcripcion || '').split('|').filter(Boolean);
  if (trans.length) nota.push('Transcripción: ' + (trans.length === 1 ? trans[0] : `${trans.length} archivos, ${dir(trans[0])}/`));
  if (d.notas) nota.push(d.notas);
  const sour = [`0 ${sr} SOUR`, `1 TITL ${d.titulo}` + (d.fecha ? ` (${d.fecha})` : '')];
  if (d.archivo) sour.push(`1 PUBL ${d.archivo}`);
  sour.push(`1 NOTE ${nota[0]}`, ...nota.slice(1).map(x => `2 CONT ${x}`), `1 REFN reg:${d.id}`, ...fotos.map(x => `1 OBJE ${x.m}`));
  const objes = fotos.map(({ f, m }) => {
    const n = numero(f), ext = f.split('.').pop().toLowerCase();
    return [`0 ${m} OBJE`, `1 FORM ${ext}`, `1 TITL ${d.titulo}` + (n !== null ? ` — img. ${String(n).padStart(3, '0')}` : ''),
      `1 _FILE ${f.replace(/\//g, '\\')}`, `1 REFN reg:${d.id}`].join('\r\n');
  });
  return { sr, textos: [sour.join('\r\n'), ...objes], fotos };
}

// Todos los documentos del registro (manuales, de la aplicación y automáticos), con la prioridad de generar.py.
Registro.prototype.documentos = async function () {
  const m = new Map();
  for (const n of ['documentos.csv', 'documentos_app.csv', 'documentos_auto.csv'])
    for (const d of leerCsv((await this.leer(n)) || '')) if (d.id && !m.has(d.id)) m.set(d.id, d);
  return m;
};
