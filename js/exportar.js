// Exportar: listas a Excel (CSV con «;», como el registro) e informe de ascendientes (para imprimir en PDF o abrir en Word).
import { hijos, valor } from './gedcom.js?v=202611042026';
import { nombreCompleto, fechaES, miles } from './modelo.js?v=202611042026';
import { antepasados } from './arboles.js?v=202611042026';
import { esc } from './md.js?v=202611042026';

// ---------- CSV para Excel ----------
const celda = v => { const t = String(v ?? ''); return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export function descargarCSV(nombre, cabecera, filas) {
  const texto = '\uFEFF' + [cabecera, ...filas].map(f => f.map(celda).join(';')).join('\r\n') + '\r\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre.replace(/[^\p{L}\p{N}_.-]+/gu, '_') + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
// Datos básicos de una persona en columnas
export const CAB_PERSONA = ['Código', 'Nombre', 'Apellidos', 'Sexo', 'Nacimiento', 'Lugar de nacimiento', 'Defunción', 'Lugar de defunción'];
export const filaPersona = p => p ? [p.id, p.nombre, p.apellidos, p.sexo, p.nac?.fecha || '', p.nac?.lugar || '', p.def?.fecha || '', p.def?.lugar || ''] : ['', '', '', '', '', '', '', ''];

// Cualquier lista ya pintada en pantalla: una tabla tal cual, o una fila por cada «.fila-rev» / «.mencion»,
// con el código y el nombre de cada persona enlazada y el texto completo de la fila.
export function filasDeCaja(caja) {
  const limpio = el => el.textContent.replace(/\s+/g, ' ').trim();
  const tabla = caja.querySelector('table');
  if (tabla) {
    const trs = [...tabla.querySelectorAll('tr')].map(tr => [...tr.children].map(limpio));
    return { cabecera: trs[0] || [], filas: trs.slice(1) };
  }
  const filas = [...caja.querySelectorAll('.fila-rev, .mencion')].map(el => {
    const ps = [...el.querySelectorAll('a[href^="#/p/"]')].map(a => ['@' + a.getAttribute('href').split('/')[2] + '@', limpio(a)]);
    const copia = el.cloneNode(true); copia.querySelectorAll('button').forEach(b => b.remove());
    copia.querySelectorAll('div, p, br, li').forEach(b => b.before(' '));   // que no se peguen las palabras de renglones distintos
    return { ps, texto: limpio(copia) };
  });
  const n = Math.max(1, ...filas.map(f => f.ps.length));
  const cabecera = [...Array.from({ length: n }, (_, i) => n === 1 ? ['Código', 'Persona'] : [`Código ${i + 1}`, `Persona ${i + 1}`]).flat(), 'Texto'];
  return { cabecera, filas: filas.map(f => [...Array.from({ length: n }, (_, i) => f.ps[i] || ['', '']).flat(), f.texto]) };
}
// Botón «Excel» que exporta lo que haya en la caja en ese momento
export function botonExcel(nombre, caja, datos = null) {
  const b = document.createElement('button');
  b.className = 'mas excel'; b.textContent = '⬇ Excel (CSV)'; b.title = 'Descargar esta lista para abrirla en Excel';
  b.onclick = () => { const d = datos ? datos() : filasDeCaja(caja); if (!d.filas.length) return alert('La lista está vacía.'); descargarCSV(nombre, d.cabecera, d.filas); };
  return b;
}

// ---------- Informe de ascendientes ----------
// Generación a generación, con número de Ahnentafel, datos, matrimonio, padres y fuentes. Devuelve una página HTML completa.
export function informeAscendientes(arbol, raiz, { gens = 8, fuentes = true, notas = false } = {}) {
  const m = antepasados(arbol, raiz, gens), vistos = new Map();
  const porGen = new Map();
  for (const [n, x] of [...m.entries()].sort((a, b) => a[0] - b[0])) {
    const g = Math.floor(Math.log2(n)) + 1;
    if (!porGen.has(g)) porGen.set(g, []);
    porGen.get(g).push([n, x]);
  }
  const NOMGEN = ['', 'La persona', 'Padres', 'Abuelos', 'Bisabuelos', 'Tatarabuelos'];
  const LET = { 3: 'A', 2: 'B', 1: 'C', 0: '?' };
  const mayus = t => t.charAt(0).toUpperCase() + t.slice(1);
  const ev = (e, verbo) => e && (e.fecha || e.lugar) ? `${verbo}${e.fecha ? ' ' + fechaES(e.fecha) : ''}${e.lugar ? ' en ' + e.lugar : ''}` : '';
  const entrada = (n, x) => {
    const p = arbol.p(x);
    if (vistos.has(x)) return `<p class="ent"><b>${miles(n)}.</b> ${esc(nombreCompleto(p))}: es el mismo que el n.º ${miles(vistos.get(x))}.</p>`;
    vistos.set(x, n);
    const bau = p.eventos.find(e => e.tag === 'CHR' || e.tag === 'BAPM'), nac = p.eventos.find(e => e.tag === 'BIRT');
    const def = p.eventos.find(e => e.tag === 'DEAT'), ent = p.eventos.find(e => e.tag === 'BURI');
    const ofi = p.eventos.filter(e => e.tag === 'OCCU' || e.tag === 'TITL').map(e => e.valor).filter(Boolean);
    const partes = [ev(nac, 'nació'), ev(bau, 'bautizad' + (p.sexo === 'F' ? 'a' : 'o')), ev(def, 'murió'), ev(ent, 'enterrad' + (p.sexo === 'F' ? 'a' : 'o'))].filter(Boolean);
    // Matrimonio con el otro antepasado (el cónyuge de la misma pareja)
    const conyN = n % 2 === 0 ? n + 1 : n - 1, cony = m.get(conyN);
    const fam = cony && p.fams.map(f => arbol.f(f)).find(f => f && (f.marido === cony || f.mujer === cony));
    const boda = fam?.eventos.find(e => e.tag === 'MARR');
    if (n > 1 && n % 2 === 0 && cony) partes.push(`casó con ${nombreCompleto(arbol.p(cony))} (n.º ${miles(conyN)})${boda ? ' ' + ev(boda, '').trim() : ''}`);
    const padres = [m.get(2 * n), m.get(2 * n + 1)].filter(Boolean).length ? `Padres: n.º ${miles(2 * n)} y ${miles(2 * n + 1)}.` : '';
    let src = '';
    if (fuentes) {
      const lista = [];
      const ver = (nodo, hecho) => { for (const h of nodo.hijos) { if (h.tag === 'SOUR') { const q = valor(h, 'QUAY'); const t = /^@/.test(h.valor) ? valor(arbol.registro(h.valor)?.arbol || { hijos: [] }, 'TITL') : h.valor; if (t) lista.push(`${t}${q !== '' ? ` (${LET[q] || q})` : ''}`); } else if (!hecho && h.hijos.length) ver(h, h.tag); } };
      ver(arbol.registro(x).arbol, null);
      const unicas = [...new Set(lista)];
      if (unicas.length) src = `<div class="src">Fuentes: ${unicas.slice(0, 12).map(esc).join(' · ')}${unicas.length > 12 ? ' …' : ''}</div>`;
    }
    const nota = notas ? hijos(arbol.registro(x).arbol, 'NOTE').map(nn => arbol.notaTexto(nn)).filter(Boolean)[0] : '';
    return `<p class="ent"><b>${miles(n)}. ${esc(nombreCompleto(p))}</b>${ofi.length ? `, ${esc(ofi.join('; '))}` : ''}. ${esc(mayus(partes.join('; ')))}${partes.length ? '.' : ''} ${padres}</p>${src}${nota ? `<div class="nota">${esc(nota.slice(0, 600))}${nota.length > 600 ? '…' : ''}</div>` : ''}`;
  };
  const cuerpo = [...porGen.entries()].map(([g, l]) => `<h2>${g === 1 ? '' : `Generación ${g}. `}${NOMGEN[g] || `${g - 1}.ª generación de antepasados`} <span class="cuenta">(${l.length} de ${miles(2 ** (g - 1))})</span></h2>${l.map(([n, x]) => entrada(n, x)).join('')}`).join('');
  const titulo = 'Ascendientes de ' + nombreCompleto(arbol.p(raiz));
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>body{font:11pt/1.45 Georgia,'Times New Roman',serif;color:#222;margin:2cm;max-width:18cm}h1{font-size:20pt;margin:0 0 4pt}h2{font-size:13pt;margin:18pt 0 6pt;border-bottom:1px solid #999;padding-bottom:2pt}
.cuenta{font-weight:normal;color:#666;font-size:10pt}.ent{margin:6pt 0 2pt}.src{font-size:9pt;color:#555;margin:0 0 6pt 1.2em}.nota{font-size:9.5pt;margin:2pt 0 6pt 1.2em;color:#333}
.pie{font-size:9pt;color:#666;margin-top:24pt}@page{margin:2cm}@media print{body{margin:0}}</style></head>
<body><h1>${esc(titulo)}</h1><p class="pie">Numeración de Ahnentafel: el padre de n es 2n y la madre 2n+1. Grados de prueba: A lo dice el documento, B indirecto, C deducido.
Preparado el ${new Date().toLocaleDateString('es')}.</p>${cuerpo}</body></html>`;
}
