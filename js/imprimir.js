// Árboles para imprimir, como dibujos SVG en milímetros: cuadro de ascendientes y abanico.
// Se guardan como PDF con el «Guardar como PDF» del navegador o se descargan en SVG para la imprenta.
import { antepasados } from './arboles.js?v=202611041952';
import { anios, nombreCompleto } from './modelo.js?v=202611041952';
import { esc } from './md.js?v=202611041952';

export const PAPELES = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
const LETRA = "Georgia, 'Times New Roman', serif";
// Colores suaves por cuarto del árbol (abuelo paterno, abuela paterna, abuelo materno, abuela materna).
const TONOS = ['#dbe7f3', '#f3dde6', '#dfeedd', '#f6ebd6'];
const TINTA = '#2a2420', LINEA = '#8a7a6a';

function anchoTexto(t, fs) { return t.length * fs * 0.56; }   // estimación para Georgia (con negrita)

// Texto que se encoge a lo ancho si no cabe.
function texto(x, y, t, fs, max, extra = '') {
  if (!t) return '';
  const ajuste = anchoTexto(t, fs) > max ? ` textLength="${max.toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${fs.toFixed(2)}"${ajuste}${extra}>${esc(t)}</text>`;
}

function datosPersona(p, conLugar) {
  const a = p.nac ? anios(p.nac.fecha)[0] : null, b = p.def ? anios(p.def.fecha)[0] : null;
  const vida = a || b ? `${a ?? '?'}–${b ?? ''}` : '';
  const lugar = conLugar ? (p.nac?.lugar || p.def?.lugar || '').split(',')[0] : '';
  return { nombre: p.nombre || '', apellidos: p.apellidos || '', vida, lugar };
}

function cabecera(W, titulo, sub, fs) {
  return `<text x="${W / 2}" y="${fs * 1.3}" font-size="${fs}" text-anchor="middle" font-weight="bold">${esc(titulo)}</text>
    ${sub ? `<text x="${W / 2}" y="${fs * 2.2}" font-size="${fs * 0.45}" text-anchor="middle" fill="${LINEA}">${esc(sub)}</text>` : ''}`;
}

function svg(W, H, cuerpo) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="${LETRA}" fill="${TINTA}">
<rect width="${W}" height="${H}" fill="#fff"/>${cuerpo}</svg>`;
}

// ---------- Cuadro de ascendientes: la persona a la izquierda, los antepasados hacia la derecha ----------
export function cuadro(arbol, id, { gens = 5, papel = 'A3', lugares = true, titulo, sub, W: W0, H: H0 } = {}) {
  const [W, H] = W0 ? [W0, H0] : PAPELES[papel];
  const m = antepasados(arbol, id, gens);
  const margen = W * 0.03, tit = H * 0.07;
  const hueco = (W - 2 * margen) * 0.025;
  const colW = (W - 2 * margen - hueco * (gens - 1)) / gens;
  const altoUtil = H - tit - margen;
  const hojas = 2 ** (gens - 1);
  let cajas = '', lineas = '';
  for (let g = 1; g <= gens; g++) {
    const n0 = 2 ** (g - 1), alto = altoUtil / n0;
    const x = margen + (g - 1) * (colW + hueco);
    for (let k = 0; k < n0; k++) {
      const n = n0 + k, xref = m.get(n);
      const cy = tit + alto * (k + 0.5);
      const bh = Math.min(alto * 0.86, H * 0.12);
      if (!xref) {
        if (m.get(n >> 1) && g > 1) cajas += `<rect x="${x.toFixed(2)}" y="${(cy - bh / 2).toFixed(2)}" width="${colW.toFixed(2)}" height="${bh.toFixed(2)}" rx="${(bh * 0.08).toFixed(2)}" fill="none" stroke="${LINEA}" stroke-width="0.2" stroke-dasharray="1 1"/>`;
        continue;
      }
      const p = arbol.p(xref), d = datosPersona(p, lugares);
      const tono = g < 3 ? '#f4efe8' : TONOS[(n >> (g - 3)) - 4];
      cajas += `<rect x="${x.toFixed(2)}" y="${(cy - bh / 2).toFixed(2)}" width="${colW.toFixed(2)}" height="${bh.toFixed(2)}" rx="${(bh * 0.08).toFixed(2)}" fill="${tono}" stroke="${p.sexo === 'F' ? '#a23b72' : p.sexo === 'M' ? '#2f6690' : LINEA}" stroke-width="0.3"/>`;
      // Tamaño de letra según el alto de la caja; con sitio, en tres renglones (nombre, apellidos, fechas y lugar).
      const pad = colW * 0.04, max = colW - 2 * pad;
      const fs = Math.min(bh / 3.6, colW / 9, 6);
      const tx = x + pad;
      if (bh > fs * 3.3) {
        cajas += texto(tx, cy - fs * 0.55, d.nombre, fs * 0.9, max)
          + texto(tx, cy + fs * 0.45, d.apellidos, fs, max, ' font-weight="bold"')
          + texto(tx, cy + fs * 1.4, [d.vida, d.lugar].filter(Boolean).join(' · '), fs * 0.75, max, ` fill="${LINEA}"`);
      } else {
        const f1 = Math.min(bh * 0.5, fs * 1.2);
        cajas += texto(tx, cy - f1 * 0.05, `${d.nombre} ${d.apellidos}`.trim(), f1, max, ' font-weight="bold"')
          + texto(tx, cy + f1 * 0.85, [d.vida, d.lugar].filter(Boolean).join(' · '), f1 * 0.75, max, ` fill="${LINEA}"`);
      }
      // Líneas a los padres
      if (g < gens && (m.get(2 * n) || m.get(2 * n + 1))) {
        const xa = x + colW, xb = xa + hueco, xm = xa + hueco / 2, ap = altoUtil / (2 * n0);
        const y1 = tit + ap * (2 * k + 0.5), y2 = tit + ap * (2 * k + 1.5);
        lineas += `<path d="M${xa.toFixed(2)} ${cy.toFixed(2)}H${xm.toFixed(2)}M${xm.toFixed(2)} ${y1.toFixed(2)}V${y2.toFixed(2)}M${xm.toFixed(2)} ${y1.toFixed(2)}H${xb.toFixed(2)}M${xm.toFixed(2)} ${y2.toFixed(2)}H${xb.toFixed(2)}" stroke="${LINEA}" stroke-width="0.25" fill="none"/>`;
      }
    }
  }
  return svg(W, H, cabecera(W, titulo ?? 'Antepasados de ' + nombreCompleto(arbol.p(id)), sub, tit * 0.4) + lineas + cajas);
}

// ---------- Abanico: la persona en el centro abajo y cada generación en un anillo ----------
export function abanico(arbol, id, { gens = 7, papel = 'A3', lugares = false, titulo, sub, W: W0, H: H0 } = {}) {
  const [W, H] = W0 ? [W0, H0] : PAPELES[papel];
  const m = antepasados(arbol, id, gens);
  const margen = W * 0.025, tit = H * 0.07;
  const R = Math.min((W - 2 * margen) / 2, H - tit - margen * 1.5);
  const cx = W / 2, cy = tit + R + (H - tit - margen - R) / 2;
  // Anchos de anillo: los de dentro, más anchos para que quepa el texto en horizontal.
  const pesos = [1.25]; for (let g = 2; g <= gens; g++) pesos.push(g <= 4 ? 1 : 1.25);
  const suma = pesos.reduce((a, b) => a + b, 0);
  const radios = [0]; pesos.forEach(w => radios.push(radios[radios.length - 1] + R * w / suma));
  const pol = (r, a) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  let out = '';
  for (let g = 1; g <= gens; g++) {
    const n0 = 2 ** (g - 1), r0 = radios[g - 1], r1 = radios[g];
    for (let k = 0; k < n0; k++) {
      const n = n0 + k, xref = m.get(n);
      // De izquierda (180°) a derecha (0°): el padre (par) a la izquierda.
      const a0 = Math.PI * (1 - k / n0), a1 = Math.PI * (1 - (k + 1) / n0), am = (a0 + a1) / 2;
      const tono = !xref ? '#fafafa' : g < 3 ? '#f4efe8' : TONOS[(n >> (g - 3)) - 4];
      if (g === 1) out += `<path d="M${cx - r1} ${cy}A${r1} ${r1} 0 0 1 ${cx + r1} ${cy}Z" fill="${tono}" stroke="${LINEA}" stroke-width="0.3"/>`;
      else {
        const [x1, y1] = pol(r1, a0), [x2, y2] = pol(r1, a1), [x3, y3] = pol(r0, a1), [x4, y4] = pol(r0, a0);
        out += `<path d="M${x4.toFixed(2)} ${y4.toFixed(2)}L${x1.toFixed(2)} ${y1.toFixed(2)}A${r1} ${r1} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}L${x3.toFixed(2)} ${y3.toFixed(2)}A${r0} ${r0} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z" fill="${tono}" stroke="${LINEA}" stroke-width="0.25"/>`;
      }
      if (!xref) continue;
      const d = datosPersona(arbol.p(xref), lugares);
      const extra = [d.vida, d.lugar].filter(Boolean).join(' · ');
      const ancho = r1 - r0, arco = (r0 + ancho / 2) * (a0 - a1);
      if (g === 1) {
        const fs = Math.min(r1 / 6, 9);
        out += texto(cx, cy - r1 * 0.55, d.nombre, fs * 0.9, r1 * 1.5, ' text-anchor="middle"')
          + texto(cx, cy - r1 * 0.55 + fs * 1.1, d.apellidos, fs, r1 * 1.5, ' text-anchor="middle" font-weight="bold"')
          + texto(cx, cy - r1 * 0.55 + fs * 2.1, extra, fs * 0.7, r1 * 1.4, ` text-anchor="middle" fill="${LINEA}"`);
      } else if (arco >= ancho * 1.25) {
        // Anillos de dentro: texto en horizontal respecto al arco, girado con el sector.
        const [tx, ty] = pol(r0 + ancho / 2, am), giro = 90 - am * 180 / Math.PI;
        const fs = Math.min(ancho / 4.2, arco / 8, 7), max = arco * 0.88;
        out += `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${giro.toFixed(2)})">`
          + texto(0, -fs * 0.6, d.nombre, fs * 0.9, max, ' text-anchor="middle"')
          + texto(0, fs * 0.45, d.apellidos, fs, max, ' text-anchor="middle" font-weight="bold"')
          + texto(0, fs * 1.4, extra, fs * 0.72, max, ` text-anchor="middle" fill="${LINEA}"`) + '</g>';
      } else {
        // Anillos de fuera: texto a lo largo del radio, de dentro hacia fuera.
        const [tx, ty] = pol(r0 + ancho * 0.05, am);
        let giro = -am * 180 / Math.PI, inv = false;
        if (am > Math.PI / 2) { giro += 180; inv = true; }
        const ancla = inv ? 'end' : 'start';
        const lineasN = arco > ancho * 0.3 ? 3 : arco > ancho * 0.18 ? 2 : 1;
        const fs = Math.min(arco / (lineasN * 1.25), ancho / 7, 6), max = ancho * 0.9;
        const filas = lineasN === 3 ? [[d.nombre, 0.9, ''], [d.apellidos, 1, ' font-weight="bold"'], [extra, 0.72, ` fill="${LINEA}"`]]
          : lineasN === 2 ? [[`${d.nombre} ${d.apellidos}`.trim(), 1, ' font-weight="bold"'], [extra, 0.72, ` fill="${LINEA}"`]]
          : [[`${d.nombre} ${d.apellidos}${d.vida ? ' (' + d.vida + ')' : ''}`.trim(), 1, '']];
        const y0 = -((filas.length - 1) * fs * 1.05) / 2 + fs * 0.35;
        out += `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${giro.toFixed(2)})">`
          + filas.map(([t, f, e], i) => texto(0, y0 + i * fs * 1.05, t, fs * f, max, ` text-anchor="${ancla}"${e}`)).join('') + '</g>';
      }
    }
  }
  return svg(W, H, cabecera(W, titulo ?? 'Antepasados de ' + nombreCompleto(arbol.p(id)), sub, tit * 0.4) + out);
}
