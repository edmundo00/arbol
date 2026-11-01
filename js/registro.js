// Registro de documentos (00_control/registro): la aplicación añade filas a citas_app.csv y documentos_app.csv.
// generar.py (de las sesiones de Claude) las lee y pone las fuentes y fotos en el GEDCOM.
// Mismo formato que citas.csv y documentos.csv: UTF-8, «;» como separador, sin «;» dentro del texto.
import { bdLeer, bdGuardar } from './almacen.js?v=202611011045';

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

  // Carpeta 00_control/registro con permiso de escritura (se recuerda). Tiene que llamarse desde un clic.
  static async preparar() {
    let dir = await bdLeer('carpetaRegistro');
    if (dir && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') { await bdGuardar('carpetaRegistro', null); dir = null; }
    if (!dir) dir = await window.showDirectoryPicker({ id: 'arbol-registro', mode: 'readwrite' });
    try { await dir.getFileHandle('documentos.csv'); }
    catch {
      // Si eligió Genealogia_2 o 00_control, se baja hasta registro
      for (const ruta of [['00_control', 'registro'], ['registro']]) {
        try { let d = dir; for (const x of ruta) d = await d.getDirectoryHandle(x); await d.getFileHandle('documentos.csv'); dir = d; break; } catch {}
      }
      try { await dir.getFileHandle('documentos.csv'); }
      catch { throw new Error('Esa carpeta no es el registro de documentos. Elige «Genealogia_2\\00_control\\registro».'); }
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
