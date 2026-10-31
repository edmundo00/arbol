// Markdown sencillo para las transcripciones y fichas (encabezado YAML, títulos, citas, listas, tablas, negritas).
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function enLinea(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

export function md(texto) {
  let t = texto.replace(/\r\n?/g, '\n'), cab = '';
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(t);
  if (fm) {
    cab = '<details class="yaml"><summary>Datos de la transcripción</summary><table class="yaml">' + fm[1].split('\n').filter(l => /^\w[\w_]*:/.test(l))
      .map(l => { const k = l.indexOf(':'); return `<tr><th>${esc(l.slice(0, k))}</th><td>${esc(l.slice(k + 1).trim())}</td></tr>`; }).join('') + '</table></details>';
    t = t.slice(fm[0].length);
  }
  const out = [], lineas = t.split('\n');
  let lista = null, parrafo = [];
  const cerrar = () => {
    if (parrafo.length) { out.push('<p>' + parrafo.map(enLinea).join('<br>') + '</p>'); parrafo = []; }
    if (lista) { out.push(`</${lista}>`); lista = null; }
  };
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    let m;
    if (!l.trim()) { cerrar(); continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { cerrar(); out.push(`<h${m[1].length + 2}>${enLinea(m[2])}</h${m[1].length + 2}>`); continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) { cerrar(); out.push('<hr>'); continue; }
    if (/^\s*>/.test(l)) { cerrar(); const b = []; while (i < lineas.length && /^\s*>/.test(lineas[i])) b.push(lineas[i++].replace(/^\s*>\s?/, '')); i--; out.push('<blockquote>' + b.map(enLinea).join('<br>') + '</blockquote>'); continue; }
    if (/^\|.*\|\s*$/.test(l)) {
      cerrar(); const filas = [];
      while (i < lineas.length && /^\|.*\|\s*$/.test(lineas[i])) filas.push(lineas[i++]); i--;
      out.push('<div class="tabla"><table>' + filas.filter(f => !/^\|[\s:|-]+\|\s*$/.test(f))
        .map((f, k) => '<tr>' + f.trim().slice(1, -1).split('|').map(c => k ? `<td>${enLinea(c.trim())}</td>` : `<th>${enLinea(c.trim())}</th>`).join('') + '</tr>').join('') + '</table></div>');
      continue;
    }
    if ((m = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(l))) {
      const tipo = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (parrafo.length) { out.push('<p>' + parrafo.map(enLinea).join('<br>') + '</p>'); parrafo = []; }
      if (lista !== tipo) { if (lista) out.push(`</${lista}>`); out.push(`<${tipo}>`); lista = tipo; }
      out.push(`<li>${enLinea(m[2])}</li>`); continue;
    }
    if (lista) { out.push(`</${lista}>`); lista = null; }
    parrafo.push(l);
  }
  cerrar();
  return cab + out.join('\n');
}
