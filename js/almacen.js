// Acceso a los archivos: Dropbox (OAuth con PKCE, sin secreto) o, en este ordenador, el servidor local de pruebas.
// No hay ninguna clave en el código: la «app key» la pone el usuario la primera vez y se guarda en este navegador.

const LS = {
  get(k) { try { return localStorage.getItem('arbol.' + k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('arbol.' + k) : localStorage.setItem('arbol.' + k, v); } catch {} },
};
export { LS };

export const RUTAS = {
  gedcom: '/Genealogia_2/01_arboles/edmundo_actualizado/edmundo.ged',
  proyecto: '/Genealogia_2',
  original: '/Genealogia',
};

// «D:\Dropbox\Genealogia\Documentos\x.jpg» → «/Genealogia/Documentos/x.jpg»
export function rutaDropbox(f) {
  if (!f) return null;
  const s = f.replace(/\\/g, '/');
  const m = /\/dropbox(\/.*)$/i.exec(s);
  if (m) return m[1];
  if (/^[a-z]:\//i.test(s)) return null;
  return s.startsWith('/') ? s : null;
}

// JSON para la cabecera Dropbox-API-Arg: lo que no es ASCII va como \uXXXX.
function argCabecera(o) { return JSON.stringify(o).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')); }

function aleatorio(n) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return b64url(a);
}
function b64url(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function urlRedireccion() { return location.origin + location.pathname; }

export class Dropbox {
  constructor() { this.tipo = 'dropbox'; this.appKey = LS.get('appkey'); }
  get conectado() { return !!LS.get('refresh'); }

  async conectar() {
    if (!this.appKey) throw new Error('Falta la clave de la aplicación (app key).');
    const verif = aleatorio(48), estado = aleatorio(16);
    const reto = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verif))));
    sessionStorage.setItem('arbol.pkce', JSON.stringify({ verif, estado }));
    const q = new URLSearchParams({ client_id: this.appKey, response_type: 'code', code_challenge: reto, code_challenge_method: 'S256',
      token_access_type: 'offline', redirect_uri: urlRedireccion(), state: estado });
    location.href = 'https://www.dropbox.com/oauth2/authorize?' + q;
  }

  // Vuelta de Dropbox con ?code=… : se cambia por los permisos y se limpia la dirección.
  async terminarConexion() {
    const q = new URLSearchParams(location.search);
    if (!q.has('code') && !q.has('error')) return false;
    history.replaceState(null, '', urlRedireccion() + location.hash);
    if (q.has('error')) throw new Error('Dropbox no dio permiso: ' + (q.get('error_description') || q.get('error')));
    const g = JSON.parse(sessionStorage.getItem('arbol.pkce') || '{}');
    sessionStorage.removeItem('arbol.pkce');
    if (!g.verif || g.estado !== q.get('state')) throw new Error('La respuesta de Dropbox no corresponde a esta conexión. Vuelve a conectar.');
    const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({
      code: q.get('code'), grant_type: 'authorization_code', code_verifier: g.verif, client_id: this.appKey, redirect_uri: urlRedireccion() }) });
    if (!r.ok) throw new Error('No se pudo terminar la conexión con Dropbox: ' + await r.text());
    this.guardarToken(await r.json());
    return true;
  }

  guardarToken(j) {
    if (j.refresh_token) LS.set('refresh', j.refresh_token);
    this.token = j.access_token; this.caduca = Date.now() + (j.expires_in - 60) * 1000;
  }

  async acceso() {
    if (this.token && Date.now() < this.caduca) return this.token;
    const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: LS.get('refresh'), client_id: this.appKey }) });
    if (!r.ok) { if (r.status === 400 || r.status === 401) LS.set('refresh', null); throw new Error('Hay que volver a conectar con Dropbox.'); }
    this.guardarToken(await r.json());
    return this.token;
  }

  async desconectar() {
    try { await fetch('https://api.dropboxapi.com/2/auth/token/revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + await this.acceso() } }); } catch {}
    LS.set('refresh', null); this.token = null;
  }

  async rpc(ruta, cuerpo) {
    const r = await fetch('https://api.dropboxapi.com/2/' + ruta, { method: 'POST',
      headers: { Authorization: 'Bearer ' + await this.acceso(), 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    if (!r.ok) throw await errorDropbox(r, cuerpo.path);
    return r.json();
  }

  async contenido(ruta, arg) {
    const r = await fetch('https://content.dropboxapi.com/2/' + ruta, { method: 'POST',
      headers: { Authorization: 'Bearer ' + await this.acceso(), 'Dropbox-API-Arg': argCabecera(arg) } });
    if (!r.ok) throw await errorDropbox(r, arg.path || arg.resource?.path);
    return r;
  }

  async metadatos(path) { const m = await this.rpc('files/get_metadata', { path }); return { rev: m.rev, tam: m.size, fecha: m.server_modified }; }

  async bajar(path) {
    const r = await this.contenido('files/download', { path });
    const m = JSON.parse(r.headers.get('Dropbox-API-Result'));
    return { bytes: new Uint8Array(await r.arrayBuffer()), rev: m.rev, fecha: m.server_modified };
  }

  async texto(path) { const r = await this.contenido('files/download', { path }); return r.text(); }

  async enlace(path) { return (await this.rpc('files/get_temporary_link', { path })).link; }

  async miniatura(path) {
    const r = await this.contenido('files/get_thumbnail_v2', { resource: { '.tag': 'path', path }, format: 'jpeg', size: 'w256h256', mode: 'bestfit' });
    return URL.createObjectURL(await r.blob());
  }

  async listar(path) {
    const j = await this.rpc('files/list_folder', { path });
    return j.entries.map(e => ({ nombre: e.name, ruta: e.path_display, carpeta: e['.tag'] === 'folder' }));
  }
}

async function errorDropbox(r, ruta) {
  let t = ''; try { t = await r.text(); } catch {}
  const e = new Error(/not_found/.test(t) ? `No existe en Dropbox: ${ruta}` : r.status === 401 ? 'Dropbox ha caducado el permiso; vuelve a conectar.' : `Error de Dropbox (${r.status}): ${t.slice(0, 200)}`);
  e.noExiste = /not_found/.test(t); e.status = r.status;
  return e;
}

// Servidor local (servidor_local.py) en http://localhost:8765, que sirve /Genealogia y /Genealogia_2 tal como están en Dropbox.
export class Local {
  constructor() { this.tipo = 'local'; this.conectado = true; }
  async pedir(path) {
    const r = await fetch(encodeURI(path), { cache: 'no-store' });
    if (!r.ok) { const e = new Error(r.status === 404 ? `No existe: ${path}` : `Error ${r.status} con ${path}`); e.noExiste = r.status === 404; throw e; }
    return r;
  }
  async metadatos(path) { const r = await fetch(encodeURI(path), { method: 'HEAD', cache: 'no-store' }); return { rev: r.headers.get('Last-Modified') + '|' + r.headers.get('Content-Length') }; }
  async bajar(path) { const r = await this.pedir(path); return { bytes: new Uint8Array(await r.arrayBuffer()), rev: r.headers.get('Last-Modified') + '|' + r.headers.get('Content-Length') }; }
  async texto(path) { return (await this.pedir(path)).text(); }
  async enlace(path) { await this.pedir(path); return encodeURI(path); }
  async miniatura(path) { return encodeURI(path); }
  async listar() { return []; }
}

// Copia del GEDCOM en este aparato (IndexedDB), para no bajar 8 MB cada vez si no ha cambiado.
const BD = 'arbol', ALM = 'archivos';
function abrirBD() {
  return new Promise((ok, mal) => { const q = indexedDB.open(BD, 1); q.onupgradeneeded = () => q.result.createObjectStore(ALM); q.onsuccess = () => ok(q.result); q.onerror = () => mal(q.error); });
}
export async function cacheLeer(k) {
  try { const db = await abrirBD(); return await new Promise(ok => { const q = db.transaction(ALM).objectStore(ALM).get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch { return null; }
}
export async function cacheGuardar(k, v) {
  try { const db = await abrirBD(); await new Promise(ok => { const t = db.transaction(ALM, 'readwrite'); t.objectStore(ALM).put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch {}
}
