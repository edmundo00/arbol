// Buscar una frase o una palabra rara en el texto: notas del GEDCOM, contexto de las menciones (base de nombres)
// y, si se pide, los archivos de transcripción (.md y .txt) de las carpetas elegidas.
import { hijos } from './gedcom.js?v=202611011145';
import { nombreCompleto } from './modelo.js?v=202611011145';
import { esc } from './md.js?v=202611011145';

// Sin tildes ni mayúsculas, manteniendo la misma longitud que el texto (para poder marcar el trozo encontrado)
export const plano = t => String(t || '').normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function extracto(texto, i, largo) { texto = texto.normalize('NFC'); const a = Math.max(0, i - 90), b = Math.min(texto.length, i + largo + 90); return (a ? '…' : '') + texto.slice(a, b) + (b < texto.length ? '…' : ''); }
const resaltar = (t, q) => { t = String(t || '').normalize('NFC'); const p = plano(t), i = p.indexOf(q); return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length)); };

// Notas del GEDCOM: de las personas (y de sus hechos) y de las familias
export function enNotas(arbol, frase, limite = 300) {
  const q = plano(frase), out = [];
  if (q.length < 3) return out;
  const notasDe = n => { const t = arbol.notaTexto(n); return t ? [t] : []; };
  for (const r of arbol.ged.registros) {
    if (r.tipo !== 'INDI' && r.tipo !== 'FAM') continue;
    const textos = [];
    const ver = (x, dentro) => { if (x.tag === 'NOTE') textos.push(...notasDe(x)); else if (dentro < 2) x.hijos.forEach(h => ver(h, dentro + 1)); };
    r.arbol.hijos.forEach(h => ver(h, 1));
    for (const t of textos) {
      const i = plano(t).indexOf(q);
      if (i < 0) continue;
      const p = r.tipo === 'INDI' ? arbol.p(r.xref) : arbol.p(arbol.f(r.xref)?.marido) || arbol.p(arbol.f(r.xref)?.mujer);
      out.push({ p, texto: extracto(t, i, q.length) });
      if (out.length >= limite) return out;
    }
  }
  return out;
}

// Contexto de las menciones de la base de nombres
export function enMenciones(base, frase, limite = 300) {
  if (!base || plano(frase).length < 3) return [];
  return base.filas(`SELECT m.nombre, m.xref, m.contexto, d.titulo, d.ruta, d.ruta_original, d.origen, d.transcripcion FROM menciones m JOIN documentos d ON d.id = m.doc_id
    WHERE m.contexto LIKE ? LIMIT ?`, ['%' + frase.trim() + '%', limite]);
}

// Archivos de transcripción (lento: los lee todos). alAvance(n archivos leídos). Para con «parar()».
export async function enTranscripciones(carpetas, frase, { limite = 200, alAvance = () => {}, parar = () => false } = {}) {
  const q = plano(frase), out = [];
  if (q.length < 3 || !carpetas) return out;
  let leidos = 0;
  for (const c of carpetas.lista) {
    const raices = await c.carpetasTranscripcion();
    const pila = raices.map(r => [...r]);
    while (pila.length) {
      if (parar() || out.length >= limite) return out;
      const partes = pila.pop();
      for (const e of await c.listar(partes)) {
        if (e.dir) { pila.push([...partes, e.nombre]); continue; }
        if (!/\.(md|txt)$/i.test(e.nombre)) continue;
        try {
          const t = await (await c.archivo(e.h)).text();
          leidos++; if (leidos % 50 === 0) alAvance(leidos);
          const i = plano(t).indexOf(q);
          if (i >= 0) out.push({ ruta: [...partes, e.nombre].join('/'), texto: extracto(t, i, q.length) });
          if (out.length >= limite) return out;
        } catch {}
      }
    }
  }
  alAvance(leidos);
  return out;
}

export function pintarNotas(l, frase) {
  const q = plano(frase);
  return l.map(x => `<div class="fila-rev">${x.p ? `<a href="#/p/${esc(x.p.id.slice(1, -1))}/notas">${esc(nombreCompleto(x.p))}</a>` : ''}<div class="peq">${resaltar(x.texto, q)}</div></div>`).join('') || '<p class="nada">Nada en las notas.</p>';
}
export function pintarTranscripciones(l, frase) {
  const q = plano(frase);
  return l.map((x, i) => `<div class="fila-rev"><button class="mas" data-tr="${i}">📜 ${esc(x.ruta)}</button><div class="peq">${resaltar(x.texto, q)}</div></div>`).join('') || '<p class="nada">Nada en las transcripciones.</p>';
}
export { resaltar, hijos };
