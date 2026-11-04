// Copias del GEDCOM: diferencias con el archivo actual y exportación para compartir (sin personas vivas ni notas privadas).
import { Gedcom, codificar, hijos, valor } from './gedcom.js?v=202611041854';
import { anios } from './modelo.js?v=202611041854';

// Diferencias por registro entre el archivo actual y otro (una copia): personas y familias añadidas, quitadas y cambiadas.
export function diferencias(actual, otro) {
  const res = { anadidas: [], quitadas: [], cambiadas: [], otros: 0 };
  const tipoDe = r => r.tipo === 'INDI' ? 'persona' : r.tipo === 'FAM' ? 'familia' : null;
  for (const r of actual.registros) {
    if (!r.xref) continue;
    const o = otro.porXref.get(r.xref);
    if (!o) { if (tipoDe(r)) res.anadidas.push(r.xref); else res.otros++; }
    else if (o.texto() !== r.texto()) { if (tipoDe(r)) res.cambiadas.push(r.xref); else res.otros++; }
  }
  for (const o of otro.registros) if (o.xref && !actual.porXref.has(o.xref)) { if (tipoDe(o)) res.quitadas.push(o.xref); else res.otros++; }
  return res;
}

// Líneas que cambian entre dos versiones de un registro (lo que hay en la copia y no ahora, y al revés).
export function lineasDistintas(textoActual, textoCopia) {
  const a = textoActual.split(/\r?\n/).filter(Boolean), b = textoCopia.split(/\r?\n/).filter(Boolean);
  const cuenta = l => { const m = new Map(); for (const x of l) m.set(x, (m.get(x) || 0) + 1); return m; };
  const ca = cuenta(a), cb = cuenta(b);
  return { soloAhora: a.filter(x => { const k = cb.get(x) || 0; if (k) { cb.set(x, k - 1); return false; } return true; }),
           soloCopia: b.filter(x => { const k = ca.get(x) || 0; if (k) { ca.set(x, k - 1); return false; } return true; }) };
}

// ¿Puede estar viva? Sin defunción ni entierro y nacida hace menos de 100 años (o, sin fecha, con hijos o padres recientes).
export function posiblementeViva(arbol, p) {
  if (p.eventos.some(e => ['DEAT', 'BURI', 'CREM'].includes(e.tag))) return false;
  const y = p.ymin, corte = new Date().getFullYear() - 100;
  if (y != null) return y >= corte;
  const hijosY = p.fams.flatMap(f => arbol.f(f)?.hijos || []).map(h => arbol.p(h)?.ymin).filter(x => x != null);
  const padresY = p.famc.flatMap(f => { const x = arbol.f(f); return x ? [x.marido, x.mujer] : []; }).map(h => h && arbol.p(h)?.ymin).filter(x => x != null);
  return hijosY.some(x => x >= corte + 20) || padresY.some(x => x >= corte - 20);
}

// GEDCOM para compartir: las personas vivas quedan como «Privado» (con sus enlaces, para no romper el árbol),
// y opcionalmente sin notas. Devuelve los bytes.
export function paraCompartir(ged, arbol, { vivos = true, notas = true, utf8 = true } = {}) {
  const nl = '\r\n', fuera = new Set(), privados = new Set();
  if (vivos) for (const p of arbol.personas.values()) if (posiblementeViva(arbol, p)) privados.add(p.id);
  const partes = [ged.prefijo];
  for (const r of ged.registros) {
    if (notas && r.tipo === 'NOTE') { fuera.add(r.xref); continue; }
    if (privados.has(r.xref)) {
      const a = r.arbol, l = [`0 ${r.xref} INDI`, '1 NAME Privado //', `1 SEX ${valor(a, 'SEX') || 'U'}`];
      for (const t of ['FAMC', 'FAMS']) for (const n of hijos(a, t)) l.push(`1 ${t} ${n.valor}`);
      partes.push(l.join(nl) + nl); continue;
    }
    if (r.tipo === 'FAM') {
      const a = r.arbol, m = [valor(a, 'HUSB'), valor(a, 'WIFE')].filter(Boolean);
      if (m.length && m.every(x => privados.has(x))) {
        partes.push([`0 ${r.xref} FAM`, ...a.hijos.filter(n => ['HUSB', 'WIFE', 'CHIL'].includes(n.tag)).map(n => `1 ${n.tag} ${n.valor}`)].join(nl) + nl); continue;
      }
    }
    let t = r.texto();
    if (notas) t = quitarNotas(t);
    if (utf8 && r.tipo === 'HEAD') t = t.replace(/\r\n1 CHAR [^\r\n]*/, '\r\n1 CHAR UTF-8');
    partes.push(t);
  }
  const texto = partes.join('');
  return codificar(utf8 ? texto : texto, utf8 ? 'utf8bom' : ged.cod, utf8 ? null : ged.restoByte);
}

// Quita de un registro las líneas NOTE (y lo que cuelga de ellas).
function quitarNotas(texto) {
  const l = texto.split('\r\n'), out = [];
  for (let i = 0; i < l.length; i++) {
    const m = /^(\d+) NOTE\b/.exec(l[i]);
    if (m) { const nv = +m[1]; while (i + 1 < l.length && /^\d+/.test(l[i + 1]) && +/^\d+/.exec(l[i + 1])[0] > nv) i++; continue; }
    out.push(l[i]);
  }
  return out.join('\r\n');
}

export function personasDe(bytes) { const g = Gedcom.desdeBytes(bytes); return { ged: g, personas: g.registros.filter(r => r.tipo === 'INDI').length }; }
export { anios };
