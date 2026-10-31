// Lectura y escritura del GEDCOM sin perder nada.
// - Decodifica UTF-16 a mano (código a código), así que ni los caracteres raros ni los sustitutos sueltos se alteran.
// - Guarda cada registro (0 @X@ ...) con su texto original; solo se rehace el texto de los registros que se editan,
//   y dentro de ellos se conservan tal cual las líneas que no se tocan.
// - Leer y escribir sin cambios da un archivo idéntico byte a byte (ver pruebas.html).

export function decodificar(bytes) {
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return { texto: utf16(bytes, 2, true), cod: 'utf16le', resto: resto(bytes) };
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return { texto: utf16(bytes, 2, false), cod: 'utf16be', resto: resto(bytes) };
  const bom = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  const texto = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bom ? bytes.subarray(3) : bytes);
  return { texto, cod: bom ? 'utf8bom' : 'utf8', resto: null };
}

function resto(bytes) { return (bytes.length - 2) % 2 ? bytes[bytes.length - 1] : null; }

function utf16(bytes, ini, le) {
  const n = (bytes.length - ini) >> 1, partes = [], TROZO = 8192;
  for (let i = 0; i < n; i += TROZO) {
    const m = Math.min(TROZO, n - i), a = new Array(m);
    for (let j = 0, p = ini + 2 * (i + j); j < m; j++, p += 2) a[j] = le ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1];
    partes.push(String.fromCharCode.apply(null, a));
  }
  return partes.join('');
}

export function codificar(texto, cod, restoByte = null) {
  if (cod === 'utf8' || cod === 'utf8bom') {
    const b = new TextEncoder().encode(texto);
    if (cod === 'utf8') return b;
    const r = new Uint8Array(b.length + 3); r.set([0xEF, 0xBB, 0xBF]); r.set(b, 3); return r;
  }
  const le = cod === 'utf16le', n = texto.length;
  const r = new Uint8Array(2 + 2 * n + (restoByte === null ? 0 : 1));
  r[0] = le ? 0xFF : 0xFE; r[1] = le ? 0xFE : 0xFF;
  for (let i = 0, p = 2; i < n; i++, p += 2) {
    const c = texto.charCodeAt(i);
    if (le) { r[p] = c & 0xFF; r[p + 1] = c >> 8; } else { r[p] = c >> 8; r[p + 1] = c & 0xFF; }
  }
  if (restoByte !== null) r[r.length - 1] = restoByte;
  return r;
}

const LINEA = /^(\d+) (?:(@[^@]+@) )?(\S+)(?: (.*))?$/s;

export class Registro {
  constructor(raw, nl) {
    this.raw = raw; this.nl = nl; this._arbol = null; this.modificado = false;
    const m = /^0 (?:(@[^@]+@) )?(\S+)/.exec(raw);
    this.xref = m ? m[1] || null : null;
    this.tipo = m ? m[2] : null;
  }
  // Árbol de nodos {nivel, xref, tag, valor, raw, hijos}. Se construye solo cuando se pide.
  get arbol() {
    if (!this._arbol) {
      const cuerpo = this.raw.endsWith(this.nl) ? this.raw.slice(0, -this.nl.length) : this.raw;
      const raiz = { nivel: -1, hijos: [] }, pila = [raiz];
      for (const l of cuerpo.split(this.nl)) {
        const m = LINEA.exec(l);
        const nodo = m ? { nivel: +m[1], xref: m[2] || null, tag: m[3], valor: m[4] ?? '', raw: l, hijos: [] }
                       : { nivel: pila.length - 1, xref: null, tag: null, valor: '', raw: l, hijos: [] };
        while (pila.length > 1 && pila[pila.length - 1].nivel >= nodo.nivel) pila.pop();
        pila[pila.length - 1].hijos.push(nodo); pila.push(nodo);
      }
      this._arbol = raiz.hijos[0] || { nivel: 0, tag: null, valor: '', raw: cuerpo, hijos: [] };
      this._sueltos = raiz.hijos.slice(1);   // líneas sin nivel 0 delante (no debería haberlas)
    }
    return this._arbol;
  }
  // Texto del registro: el original si no se ha tocado; si no, se rehace desde el árbol.
  texto() {
    if (!this.modificado) return this.raw;
    const lineas = [];
    const volcar = n => {
      lineas.push(n.raw != null && !n.cambiado ? n.raw : `${n.nivel}${n.xref ? ' ' + n.xref : ''} ${n.tag}${n.valor !== '' ? ' ' + n.valor : ''}`);
      n.hijos.forEach(volcar);
    };
    volcar(this.arbol); (this._sueltos || []).forEach(volcar);
    return lineas.join(this.nl) + this.nl;
  }
}

export class Gedcom {
  constructor(texto, cod = 'utf16le', restoByte = null) {
    this.cod = cod; this.restoByte = restoByte;
    this.nl = texto.includes('\r\n') ? '\r\n' : texto.includes('\r') && !texto.includes('\n') ? '\r' : '\n';
    this.prefijo = '';
    this.registros = [];
    this.porXref = new Map();
    const sep = this.nl + '0 ';
    let ini = 0;
    if (!texto.startsWith('0 ')) {
      const k = texto.indexOf(sep);
      ini = k < 0 ? texto.length : k + this.nl.length;
      this.prefijo = texto.slice(0, ini);
    }
    while (ini < texto.length) {
      const k = texto.indexOf(sep, ini);
      const fin = k < 0 ? texto.length : k + this.nl.length;
      const r = new Registro(texto.slice(ini, fin), this.nl);
      this.registros.push(r);
      if (r.xref) this.porXref.set(r.xref, r);
      ini = fin;
    }
  }
  static desdeBytes(bytes) {
    const d = decodificar(bytes);
    return new Gedcom(d.texto, d.cod, d.resto);
  }
  texto() { return this.prefijo + this.registros.map(r => r.texto()).join(''); }
  bytes() { return codificar(this.texto(), this.cod, this.restoByte); }
}

// Texto de una nota o de un valor con CONT/CONC debajo.
export function textoLargo(nodo) {
  let s = nodo.valor || '';
  for (const h of nodo.hijos) {
    if (h.tag === 'CONT') s += '\n' + h.valor;
    else if (h.tag === 'CONC') s += h.valor;
  }
  return s;
}

export function hijo(nodo, tag) { return nodo.hijos.find(h => h.tag === tag) || null; }
export function hijos(nodo, tag) { return nodo.hijos.filter(h => h.tag === tag); }
export function valor(nodo, tag) { const h = hijo(nodo, tag); return h ? h.valor : ''; }
