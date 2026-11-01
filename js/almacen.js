// Acceso a los archivos, siempre en el propio aparato (nada pasa por internet).
// - El GEDCOM: cualquier archivo que elija el usuario. En Chrome o Edge de ordenador se recuerda el archivo y se vuelve
//   a leer de disco cada vez; en el móvil y en otros navegadores se guarda una copia en el navegador.
// - Las fotos y transcripciones: una carpeta cualquiera que elija el usuario (opcional). Las rutas que lleva el GEDCOM
//   (por ejemplo «D:\Dropbox\Genealogia\Documentos\x.jpg») se buscan dentro de esa carpeta quitando lo que sobre delante.
// - Servidor: servidor_local.py en http://localhost:8765, solo para las pruebas.

const LS = {
  get(k) { try { return localStorage.getItem('arbol.' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('arbol.' + k) : localStorage.setItem('arbol.' + k, v); } catch {} },
};
export { LS };

export const hayDisco = typeof window !== 'undefined' && 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;

function noExiste(ruta) { const e = new Error(`No se encuentra: ${ruta}`); e.noExiste = true; return e; }

// Trozos de una ruta del GEDCOM: «D:\a\b\c.jpg» → ['a', 'b', 'c.jpg'] (sin la unidad).
export function trozos(ruta) { return (ruta || '').replace(/\\/g, '/').replace(/^[a-z]:/i, '').split('/').filter(x => x && x !== '.'); }

// ---------- El GEDCOM ----------
export class Fuente {
  // datos: {bytes, nombre, fecha}; asa: el archivo en disco (solo Chrome/Edge de ordenador)
  constructor(datos, asa = null) { this.datos = datos; this.asa = asa; }

  static async elegir() {
    const [asa] = await window.showOpenFilePicker({ id: 'arbol-gedcom', types: [{ description: 'GEDCOM', accept: { 'application/octet-stream': ['.ged', '.gedcom'] } }], excludeAcceptAllOption: false });
    await bdGuardar('asa', asa); await bdGuardar('copia', null);
    return Fuente.desdeAsa(asa);
  }
  static async desdeAsa(asa) {
    const f = await asa.getFile();
    return new Fuente({ bytes: new Uint8Array(await f.arrayBuffer()), nombre: f.name, fecha: f.lastModified }, asa);
  }
  // Para el móvil y los navegadores sin acceso al disco: <input type="file">. Se guarda una copia en el navegador.
  static async desdeFile(file) {
    const datos = { bytes: new Uint8Array(await file.arrayBuffer()), nombre: file.name, fecha: file.lastModified, cuando: Date.now() };
    await bdGuardar('copia', datos); await bdGuardar('asa', null);
    return new Fuente(datos);
  }
  // Lo que se abrió la última vez: {asa} o {copia}, o null.
  static async ultima() {
    const asa = await bdLeer('asa'); if (asa) return { asa };
    const copia = await bdLeer('copia'); if (copia) return { copia };
    return null;
  }
  static async olvidar() { await bdGuardar('asa', null); await bdGuardar('copia', null); }
  get esCopia() { return !this.asa; }
}

export async function permiso(asa, pedir, modo = 'read') {
  let p = await asa.queryPermission({ mode: modo });
  if (p !== 'granted' && pedir) p = await asa.requestPermission({ mode: modo });
  return p === 'granted';
}

// ---------- La carpeta de fotos y documentos ----------
// Parte común: cómo se encuentra una foto, su transcripción o un archivo citado dentro de la carpeta elegida.
class Raiz {
  constructor() { this.recorte = null; this.cache = new Map(); this.urls = []; this._transc = null; }

  // Busca la ruta del GEDCOM quitando trozos por delante hasta que aparece en la carpeta.
  // Lo que hubo que quitar se recuerda (todas las fotos suelen compartir el mismo principio).
  // Devuelve {h, rel}: el archivo y su ruta dentro de la carpeta.
  async buscar(ruta) {
    if (this.cache.has(ruta)) { const c = this.cache.get(ruta); if (!c) throw noExiste(ruta); return c; }
    const p = trozos(ruta);
    let r = null;
    if (this.recorte != null && this.recorte < p.length) r = await this.probar(p.slice(this.recorte));
    for (let k = 0; !r && k < p.length; k++) { r = await this.probar(p.slice(k)); if (r) this.recorte = k; }
    this.cache.set(ruta, r);
    if (!r) throw noExiste(ruta);
    return r;
  }
  async probar(partes) { const h = await this.exacto(partes); return h ? { h, rel: partes } : null; }

  // Una ruta relativa a la carpeta o a alguna de sus subcarpetas (las que citan las notas: «03_transcripciones/x.md»).
  async relativa(ruta) {
    const p = trozos(ruta);
    let r = await this.probar(p);
    if (!r) for (const d of await this.subcarpetas([])) if ((r = await this.probar([d, ...p]))) break;
    if (!r) throw noExiste(ruta);
    return r;
  }

  // Carpetas de transcripciones: las que se llaman «…transcripciones» en la carpeta o un nivel por debajo.
  async carpetasTranscripcion() {
    if (this._transc) return this._transc;
    const t = [], es = n => /transcripcion/i.test(n);
    for (const d of await this.subcarpetas([])) {
      if (es(d)) t.push([d]);
      else for (const e of await this.subcarpetas([d])) if (es(e)) t.push([d, e]);
    }
    return (this._transc = t);
  }

  // Transcripción de una foto: el .md o .txt con el mismo nombre al lado, o en una carpeta de transcripciones que repita
  // las carpetas de la foto (03_transcripciones/Documentos/x.md para Genealogia/Documentos/x.jpg).
  async transcripcion(ruta) { const { rel } = await this.buscar(ruta); return this.transcripcionDe(rel, true); }
  // Transcripción de una foto que está en «rel» (en esta carpeta o en otra de las elegidas).
  async transcripcionDe(rel, aqui) {
    const sin = [...rel.slice(0, -1), rel[rel.length - 1].replace(/\.[^.]+$/, '')];
    const cand = aqui ? [[...sin.slice(0, -1), sin[sin.length - 1] + '.md'], [...sin.slice(0, -1), sin[sin.length - 1] + '.txt']] : [];
    for (const t of await this.carpetasTranscripcion())
      for (let j = 0; j < sin.length; j++) cand.push([...t, ...sin.slice(j, -1), sin[sin.length - 1] + '.md']);
    for (const c of cand) { const h = await this.exacto(c); if (h) return { texto: await (await this.archivo(h)).text(), rel: c.join('/') }; }
    return null;
  }

  async texto(ruta) { const r = await this.relativa(ruta); return { texto: await (await this.archivo(r.h)).text(), rel: r.rel.join('/') }; }
  async enlace(ruta) { return this.url((await this.buscar(ruta)).h); }
  async miniatura(ruta) { return this.enlace(ruta); }
}

// Varias carpetas de fotos (por ejemplo «Genealogia» y «Genealogia_2»): se busca en todas.
export class Carpetas {
  constructor(lista) { this.lista = lista; }
  get nombre() { return this.lista.map(c => c.nombre).join(' + '); }
  static async guardadas() {
    const l = await bdLeer('carpetas');
    if (l) return l;
    const c = await bdLeer('carpeta');   // versión anterior: una sola carpeta
    return c ? [c] : [];
  }
  static async guardar(asas) { await bdGuardar('carpetas', asas); await bdGuardar('carpeta', null); }
  static async elegir() { return window.showDirectoryPicker({ id: 'arbol-fotos', mode: 'read' }); }
  noEsta(ruta) {
    const e = new Error(`No está en ${this.lista.map(c => '«' + c.nombre + '»').join(' ni en ')}: ${ruta}`);
    e.noExiste = true; e.ruta = ruta; return e;
  }
  async buscar(ruta) {
    for (const c of this.lista) { try { return { ...(await c.buscar(ruta)), c }; } catch (e) { if (!e.noExiste) throw e; } }
    throw this.noEsta(ruta);
  }
  async enlace(ruta) { const r = await this.buscar(ruta); return r.c.url(r.h); }
  async miniatura(ruta) { return this.enlace(ruta); }
  async texto(ruta) {
    for (const c of this.lista) { try { return await c.texto(ruta); } catch (e) { if (!e.noExiste) throw e; } }
    throw this.noEsta(ruta);
  }
  // La transcripción puede estar en otra carpeta que la foto (fotos en «Genealogia», transcripciones en «Genealogia_2»).
  async transcripcion(ruta) {
    const r = await this.buscar(ruta);
    const propia = await r.c.transcripcionDe(r.rel, true);
    if (propia) return propia;
    for (const c of this.lista) if (c !== r.c) { const t = await c.transcripcionDe(r.rel, false); if (t) return t; }
    return null;
  }
}

export class Carpeta extends Raiz {
  constructor(asa) { super(); this.asa = asa; this.nombre = asa.name; }

  async entrar(dir, nombre, archivo) {
    try { return archivo ? await dir.getFileHandle(nombre) : await dir.getDirectoryHandle(nombre); }
    catch {
      // Las rutas del GEDCOM no siempre coinciden en mayúsculas con el disco.
      try { for await (const [n, x] of dir.entries()) if (n.toLowerCase() === nombre.toLowerCase() && x.kind === (archivo ? 'file' : 'directory')) return x; } catch {}
      return null;
    }
  }
  async exacto(partes) {
    let h = this.asa;
    for (let i = 0; i < partes.length && h; i++) h = await this.entrar(h, partes[i], i === partes.length - 1);
    return partes.length ? h : null;
  }
  async subcarpetas(partes) {
    let h = this.asa;
    for (const x of partes) { h = await this.entrar(h, x, false); if (!h) return []; }
    const out = [];
    try { for await (const [n, x] of h.entries()) if (x.kind === 'directory' && !n.startsWith('.')) out.push(n); } catch {}
    return out;
  }
  archivo(h) { return h.getFile(); }
  // Contenido de una subcarpeta: [{ nombre, dir, h }]
  async listar(partes) {
    let h = this.asa;
    for (const x of partes) { h = await this.entrar(h, x, false); if (!h) return []; }
    const out = [];
    try { for await (const [n, x] of h.entries()) out.push({ nombre: n, dir: x.kind === 'directory', h: x }); } catch {}
    return out;
  }
  async url(h) { const u = URL.createObjectURL(await h.getFile()); this.urls.push(u); return u; }
}

// Servidor de pruebas (servidor_local.py), que sirve la carpeta de Dropbox con sus rutas.
export class Servidor extends Raiz {
  constructor() { super(); this.nombre = 'servidor local'; }
  dir(partes) { return encodeURI('/' + partes.join('/')); }
  async exacto(partes) {
    if (!partes.length || !/^genealogia/i.test(partes[0])) return null;
    const u = this.dir(partes), r = await fetch(u, { method: 'HEAD', cache: 'no-store' });
    return r.ok ? u : null;
  }
  async subcarpetas(partes) {
    if (!partes.length) return ['Genealogia', 'Genealogia_2'];
    const r = await fetch(this.dir(partes) + '/', { cache: 'no-store' });
    if (!r.ok) return [];
    return [...(await r.text()).matchAll(/href="([^"?]+)\/"/g)].map(m => decodeURIComponent(m[1]));
  }
  async archivo(u) { return (await fetch(u, { cache: 'no-store' })).blob(); }
  async listar(partes) {
    const r = await fetch(this.dir(partes) + '/', { cache: 'no-store' });
    if (!r.ok) return [];
    return [...(await r.text()).matchAll(/href="([^"?]+)"/g)].map(m => decodeURIComponent(m[1])).filter(n => !n.startsWith('/') && !n.startsWith('.'))
      .map(n => ({ nombre: n.replace(/\/$/, ''), dir: n.endsWith('/'), h: this.dir([...partes, n.replace(/\/$/, '')]) }));
  }
  async url(u) { return u; }
  async bajar(ruta) { const u = this.dir(trozos(ruta)), r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw noExiste(ruta); return { bytes: new Uint8Array(await r.arrayBuffer()), nombre: ruta.split('/').pop(), fecha: Date.parse(r.headers.get('Last-Modified')) }; }
}

// ---------- Lo que se guarda en el navegador (IndexedDB) ----------
const BD = 'arbol', ALM = 'archivos';
function abrirBD() {
  return new Promise((ok, mal) => { const q = indexedDB.open(BD, 1); q.onupgradeneeded = () => q.result.createObjectStore(ALM); q.onsuccess = () => ok(q.result); q.onerror = () => mal(q.error); });
}
export async function bdLeer(k) {
  try { const db = await abrirBD(); return await new Promise(ok => { const q = db.transaction(ALM).objectStore(ALM).get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch { return null; }
}
export async function bdGuardar(k, v) {
  try { const db = await abrirBD(); await new Promise(ok => { const t = db.transaction(ALM, 'readwrite'); v == null ? t.objectStore(ALM).delete(k) : t.objectStore(ALM).put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch {}
}
