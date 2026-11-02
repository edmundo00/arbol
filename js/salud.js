// Salud del GEDCOM: enlaces que apuntan a nadie, enlaces sin su vuelta, familias vacías, personas sin nombre,
// códigos repetidos y líneas demasiado largas. Lo que se puede arreglar sin dudas, se arregla con un clic (con deshacer).
import { hijos } from './gedcom.js?v=202611022100';

const PUNTERO = /^@[^@#][^@]*@$/;

export function revisarSalud(ged) {
  const problemas = [];
  const pon = (tipo, texto, arreglo = null) => problemas.push({ tipo, texto, arreglo });
  // Códigos repetidos
  const vistos = new Map();
  for (const r of ged.registros) if (r.xref) vistos.set(r.xref, (vistos.get(r.xref) || 0) + 1);
  for (const [x, n] of vistos) if (n > 1) pon('Código repetido', `${x} aparece ${n} veces como registro`);
  for (const r of ged.registros) {
    const a = r.arbol;
    // Líneas raras o largas
    const recorrer = (n) => {
      if (n.tag === null && n.raw && n.raw.trim()) pon('Línea ilegible', `${r.xref || r.tipo}: «${n.raw.slice(0, 80)}»`);
      if (n.raw && n.raw.length > 255) pon('Línea de más de 255 caracteres', `${r.xref || r.tipo}: ${n.tag} (${n.raw.length} caracteres)`);
      // Punteros a registros que no existen
      if (n !== a && PUNTERO.test(n.valor || '') && !ged.porXref.has(n.valor))
        pon('Enlace a un registro que no existe', `${r.xref || r.tipo} → ${n.tag} ${n.valor}`, ['FAMC', 'FAMS', 'HUSB', 'WIFE', 'CHIL'].includes(n.tag) && n.nivel === 1 ? { tipo: 'quitar', xref: r.xref, tag: n.tag, valor: n.valor } : null);
      n.hijos.forEach(recorrer);
    };
    recorrer(a);
    if (r.tipo === 'INDI') {
      const nombre = hijos(a, 'NAME')[0];
      if (!nombre || !nombre.valor.replace(/\//g, '').trim()) pon('Persona sin nombre', r.xref);
      for (const n of hijos(a, 'FAMC')) { const f = ged.porXref.get(n.valor); if (f && !hijos(f.arbol, 'CHIL').some(c => c.valor === r.xref)) pon('Enlace sin vuelta', `${r.xref} dice ser hijo de ${n.valor}, pero la familia no lo tiene como hijo`, { tipo: 'enlazar', xref: n.valor, tag: 'CHIL', valor: r.xref }); }
      for (const n of hijos(a, 'FAMS')) { const f = ged.porXref.get(n.valor); if (f && !f.arbol.hijos.some(c => (c.tag === 'HUSB' || c.tag === 'WIFE') && c.valor === r.xref)) pon('Enlace sin vuelta', `${r.xref} dice ser cónyuge en ${n.valor}, pero la familia no lo tiene`, null); }
    } else if (r.tipo === 'FAM') {
      const miembros = a.hijos.filter(x => ['HUSB', 'WIFE', 'CHIL'].includes(x.tag));
      if (!miembros.length) pon('Familia vacía', r.xref, { tipo: 'familiaVacia', xref: r.xref });
      for (const n of miembros) {
        const p = ged.porXref.get(n.valor); if (!p) continue;
        const vuelta = n.tag === 'CHIL' ? 'FAMC' : 'FAMS';
        if (!hijos(p.arbol, vuelta).some(x => x.valor === r.xref)) pon('Enlace sin vuelta', `La familia ${r.xref} tiene a ${n.valor} (${n.tag}), pero la persona no apunta a la familia`, { tipo: 'enlazar', xref: n.valor, tag: vuelta, valor: r.xref });
      }
    }
  }
  return problemas;
}

// Aplica los arreglos seguros dentro de una operación del editor (con deshacer).
export function repararSalud(editor, problemas) {
  let n = 0;
  for (const p of problemas) {
    const a = p.arreglo; if (!a) continue;
    if (!editor.ged.porXref.has(a.xref)) continue;
    if (a.tipo === 'quitar') { editor.quitarLinea(a.xref, a.tag, a.valor); n++; }
    else if (a.tipo === 'enlazar') { editor.enlazar(a.xref, a.tag, a.valor); n++; }
    else if (a.tipo === 'familiaVacia') { if (!editor.referencias(a.xref).length) { editor.eliminar(a.xref); n++; } }
  }
  return n;
}
