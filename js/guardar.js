// Guardado seguro del GEDCOM en el disco (Chrome o Edge de ordenador), en la carpeta que elige el usuario.
// Antes de escribir:
//   1. el candado (<archivo>.lock) no puede estar puesto por otro (un script, otro aparato);
//   2. el archivo del disco tiene que ser el mismo que se leyó (si cambió fuera, no se machaca);
//   3. el archivo nuevo se lee otra vez y se comprueba: mismas personas más las añadidas, enlaces que apuntan a algo;
//   4. copias en copias/: la de la sesión (una vez) y la anterior a cada guardado, comprobadas tras escribirlas.
// La escritura la hace el navegador en un archivo aparte que solo al cerrar sustituye al bueno; después se relee y compara.
import { Gedcom } from './gedcom.js?v=202611011145';
import { bdLeer, bdGuardar } from './almacen.js?v=202611011145';

const iguales = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
const sello = () => { const d = new Date(), p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const sesion = (() => { try { let s = sessionStorage.getItem('arbol.sesion'); if (!s) { s = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('arbol.sesion', s); } return s; } catch { return 'x'; } })();
const QUIEN = 'app:' + sesion;
const MINUTOS = 20;

export function comprobar(bytes, personasEsperadas) {
  const g = Gedcom.desdeBytes(bytes);
  const indi = g.registros.filter(r => r.tipo === 'INDI').length;
  if (personasEsperadas != null && indi !== personasEsperadas) throw new Error(`El archivo nuevo tendría ${indi} personas y debería tener ${personasEsperadas}.`);
  for (const r of g.registros) {
    if (r.tipo !== 'INDI' && r.tipo !== 'FAM') continue;
    for (const n of r.arbol.hijos) {
      if (!['FAMC', 'FAMS', 'HUSB', 'WIFE', 'CHIL'].includes(n.tag)) continue;
      if (!g.porXref.has(n.valor)) throw new Error(`${r.xref} apunta a ${n.valor}, que no existe.`);
    }
  }
  if (!g.registros.length || g.registros[0].tipo !== 'HEAD' || g.registros[g.registros.length - 1].tipo !== 'TRLR') throw new Error('Al archivo nuevo le falta la cabecera o el final.');
  return indi;
}

export class Guardado {
  constructor(dir, nombre, base) { this.dir = dir; this.nombre = nombre; this.base = base; this.copiaSesion = false; this.ultimo = null; }

  // Pide la carpeta del GEDCOM con permiso de escritura y comprueba que el archivo es el mismo que está abierto.
  static async preparar(nombre, bytesAbiertos) {
    let dir = await bdLeer('carpetaGedcom:' + nombre);
    if (dir && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      // Sin permiso: se olvida esa carpeta para que la próxima vez se pueda elegir otra.
      await bdGuardar('carpetaGedcom:' + nombre, null);
      throw new Error('No se ha dado permiso para escribir en la carpeta. Vuelve a pulsar el botón y elige la carpeta del archivo.');
    }
    if (!dir) dir = await window.showDirectoryPicker({ id: 'arbol-gedcom-dir', mode: 'readwrite' });
    let fh;
    try { fh = await dir.getFileHandle(nombre); } catch { throw new Error(`En la carpeta «${dir.name}» no está «${nombre}». Elige la carpeta donde está el archivo abierto.`); }
    const disco = new Uint8Array(await (await fh.getFile()).arrayBuffer());
    if (!iguales(disco, bytesAbiertos)) throw new Error(`El «${nombre}» de esa carpeta no es igual al que tienes abierto (puede haber cambiado). Vuelve a abrir el archivo y luego activa la edición.`);
    await bdGuardar('carpetaGedcom:' + nombre, dir);
    return new Guardado(dir, nombre, disco);
  }

  // ---------- Candado ----------
  async leerCandado() {
    let f;
    try { f = await (await this.dir.getFileHandle(this.nombre + '.lock')).getFile(); } catch { return null; }
    // Un candado ilegible se toma por vigente durante 10 minutos, como hacen los scripts (ged.py).
    try { const c = JSON.parse(await f.text()); if (c && c.quien && !isNaN(Date.parse(c.hasta))) return c; } catch {}
    return { quien: 'desconocido (candado ilegible)', hasta: new Date(f.lastModified + 10 * 60000).toISOString() };
  }
  async ponerCandado() {
    const c = await this.leerCandado();
    if (c && c.quien !== QUIEN && Date.parse(c.hasta) > Date.now())
      throw new Error(`El archivo lo está usando «${c.quien}»${c.aparato ? ' en ' + c.aparato : ''} hasta las ${new Date(c.hasta).toLocaleTimeString('es')}. Espera a que termine.`);
    const datos = { quien: QUIEN, aparato: navigator.platform || '', desde: new Date().toISOString(), hasta: new Date(Date.now() + MINUTOS * 60000).toISOString() };
    const w = await (await this.dir.getFileHandle(this.nombre + '.lock', { create: true })).createWritable();
    await w.write(JSON.stringify(datos, null, 1)); await w.close();
  }
  async quitarCandado() {
    const c = await this.leerCandado();
    if (c && c.quien === QUIEN) try { await this.dir.removeEntry(this.nombre + '.lock'); } catch {}
  }

  // ---------- Copias ----------
  async copia(nombreCopia, bytes) {
    const copias = await this.dir.getDirectoryHandle('copias', { create: true });
    const fh = await copias.getFileHandle(nombreCopia, { create: true });
    const w = await fh.createWritable(); await w.write(bytes); await w.close();
    const leido = new Uint8Array(await (await fh.getFile()).arrayBuffer());
    if (!iguales(leido, bytes)) throw new Error(`La copia de seguridad «copias/${nombreCopia}» no se ha escrito bien. No se guarda nada.`);
    return 'copias/' + nombreCopia;
  }

  // ---------- Guardar ----------
  async guardar(nuevos, personasEsperadas) {
    await this.ponerCandado();
    const fh = await this.dir.getFileHandle(this.nombre);
    const disco = new Uint8Array(await (await fh.getFile()).arrayBuffer());
    if (!iguales(disco, this.base)) {
      const e = new Error('El archivo ha cambiado en el disco desde que lo abriste (otro programa, un script o Dropbox desde otro aparato). No se ha guardado nada para no machacar esos cambios. Vuelve a abrir el árbol.');
      e.cambiadoFuera = true; throw e;
    }
    comprobar(nuevos, personasEsperadas);
    const base = this.nombre.replace(/\.[^.]+$/, '');
    let nueva = null;
    if (!this.copiaSesion) { nueva = await this.copia(`${base}_app_${sello()}.ged`, disco); this.ultimaCopiaSesion = nueva; this.copiaSesion = true; }
    await this.copia(`${base}_app_anterior.ged`, disco);
    const w = await fh.createWritable({ keepExistingData: false });
    await w.write(nuevos); await w.close();
    const releido = new Uint8Array(await (await fh.getFile()).arrayBuffer());
    if (!iguales(releido, nuevos)) {
      // Muy raro: se intenta dejar el archivo como estaba.
      const w2 = await fh.createWritable({ keepExistingData: false }); await w2.write(disco); await w2.close();
      throw new Error('El archivo guardado no coincide con lo que se quería guardar. Se ha vuelto a poner la versión anterior. Hay copia en copias/.');
    }
    this.base = nuevos;
    this.ultimo = new Date();
    return { copiaSesion: nueva };
  }
}

// ---------- Diario de cambios y copias (en la carpeta «copias» junto al GEDCOM) ----------
const DIARIO = 'diario_cambios.txt';
const aparato = () => (navigator.userAgentData?.platform || navigator.platform || '').slice(0, 30);

Guardado.prototype.carpetaCopias = function () { return this.dir.getDirectoryHandle('copias', { create: true }); };

// Una línea por cambio: fecha · aparato · descripción · códigos tocados (separados por tabuladores)
Guardado.prototype.apuntar = async function (desc, xrefs = []) {
  try {
    const c = await this.carpetaCopias(), fh = await c.getFileHandle(DIARIO, { create: true });
    const viejo = await (await fh.getFile()).text();
    const linea = [new Date().toISOString().slice(0, 19).replace('T', ' '), aparato(), desc.replace(/[\t\r\n]+/g, ' '), xrefs.join(' ')].join('\t');
    const w = await fh.createWritable({ keepExistingData: false });
    await w.write((viejo && !viejo.endsWith('\n') ? viejo + '\n' : viejo) + linea + '\n'); await w.close();
  } catch (e) { console.warn('No se pudo escribir el diario:', e); }
};
Guardado.prototype.diario = async function () {
  try { const c = await this.carpetaCopias(); return (await (await (await c.getFileHandle(DIARIO)).getFile()).text()).split('\n').filter(Boolean).map(l => { const [fecha, aparato, desc, xrefs] = l.split('\t'); return { fecha, aparato, desc, xrefs: (xrefs || '').split(' ').filter(Boolean) }; }); }
  catch { return []; }
};
Guardado.prototype.copias = async function () {
  const c = await this.carpetaCopias(), out = [];
  for await (const [n, h] of c.entries()) if (h.kind === 'file' && /\.ged$/i.test(n)) { const f = await h.getFile(); out.push({ nombre: n, tam: f.size, fecha: f.lastModified, deApp: /_app_\d{8}-\d{6}\.ged$/.test(n) }); }
  return out.sort((a, b) => b.fecha - a.fecha);
};
Guardado.prototype.leerCopia = async function (nombre) {
  const c = await this.carpetaCopias();
  return new Uint8Array(await (await (await c.getFileHandle(nombre)).getFile()).arrayBuffer());
};
// Borra copias antiguas hechas por la aplicación, dejando las «quedan» más recientes. Devuelve { borradas, bytes }.
Guardado.prototype.limpiarCopias = async function (quedan = 10) {
  const c = await this.carpetaCopias(), app = (await this.copias()).filter(x => x.deApp);
  let borradas = 0, bytes = 0;
  for (const x of app.slice(quedan)) { await c.removeEntry(x.nombre); borradas++; bytes += x.tam; }
  return { borradas, bytes };
};
