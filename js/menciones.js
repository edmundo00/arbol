// Pantallas de la base de nombres y lugares: menciones de una persona y buscadores «¿dónde aparece…?» y «¿quién hay en…?».
import { esc } from './md.js?v=202611011432';
import { fiabilidad } from './nombresdb.js?v=202611011432';

const TEXTO = /\.(md|txt|csv|html?)$/i, IMAGEN = /\.(jpe?g|png|gif|tiff?|bmp|webp)$/i;
const ORIGEN = { registro: 'registro', transcripcion: 'transcripción', pdf_texto: 'texto de PDF', copia_ligera: 'copia ligera', ficha: 'ficha',
  arbol: 'árbol antiguo', gedcom: 'GEDCOM', gedcom_notas: 'notas del GEDCOM', descarga: 'descarga', original: 'original' };
const sinOriginal = r => r && r.startsWith('ORIGINAL/') ? r.slice(9) : r;

// Qué se puede abrir de una mención: su texto (transcripción, ficha…) y su imagen.
function abribles(m) {
  const out = [];
  if (m.origen === 'gedcom' || m.origen === 'gedcom_notas') return out;   // es el propio GEDCOM
  // En el registro, la ruta es documentos.csv: solo vale su transcripción.
  const candidatas = m.origen === 'registro' ? [m.transcripcion] : [m.transcripcion, m.ruta];
  const texto = candidatas.find(r => r && TEXTO.test(r) && !r.includes('*'));
  if (texto) out.push({ tipo: 'texto', ruta: sinOriginal(texto) });
  else if (m.origen !== 'registro' && m.ruta && !m.ruta.includes('*') && !/\.ged$/i.test(m.ruta)) out.push({ tipo: 'archivo', ruta: sinOriginal(m.ruta) });
  // La imagen: relativa al original (Genealogia) salvo las descargas, que están en Genealogia_2.
  if (m.ruta_original && IMAGEN.test(m.ruta_original) && !m.ruta_original.includes('*'))
    out.push({ tipo: 'imagen', ruta: (/^(0\d|1\d)_/.test(m.ruta_original) ? 'Genealogia_2/' : 'Genealogia/') + m.ruta_original });
  return out;
}

export function filaMencion(m, i, { enlazar = true, confirmar = false } = {}) {
  const f = fiabilidad(m.enlace);
  const enl = enlazar && m.xref ? ` → <a href="#/p/${esc(m.xref.slice(1, -1))}">${esc(m.enlazado || m.xref)}</a> <span class="fiab ${f}" title="${esc(m.enlace || '')}">${f === 'seguro' ? 'seguro' : 'pista'}</span>` : '';
  const botones = abribles(m).map((a, k) => `<button data-m="${i}" data-a="${k}">${a.tipo === 'imagen' ? '📷 Imagen' : a.tipo === 'texto' ? '📜 Texto' : '📄 Archivo'}</button>`).join('');
  return `<div class="mencion">
    <div><b>${esc(m.nombre)}</b>${m.papel && m.papel !== 'texto' ? ' — ' + esc(m.papel) : ''}${m.fecha ? ', ' + esc(m.fecha) : ''}${enl}
      ${m.n_veces > 1 ? `<span class="peq"> ×${m.n_veces}</span>` : ''}</div>
    <div class="peq">${esc((m.titulo || '').trim())} · ${esc(ORIGEN[m.origen] || m.origen || '')}${m.pagina && !['gedcom_notas', 'arbol'].includes(m.origen) ? ' · p. ' + esc(m.pagina) : ''}${m.anio || m.danio ? ' · ' + esc(m.anio || m.danio) : ''}</div>
    ${m._p?.notas.length ? `<div class="peq encaje ${m._p.n > 0 ? 'si' : m._p.n < 0 ? 'no' : ''}">${m._p.n > 0 ? '✔' : m._p.n < 0 ? '✘' : '·'} ${esc(m._p.notas.join(', '))}</div>` : ''}
    ${m._otros?.length ? `<div class="peq repes">El mismo texto en ${m._otros.length} documento${m._otros.length === 1 ? '' : 's'} más: ${esc([...new Set(m._otros.map(o => (o.titulo || '').trim()))].slice(0, 12).join(' · '))}${m._otros.length > 12 ? ' …' : ''}</div>` : ''}
    ${m.contexto ? `<div class="ctx">«${esc(m.contexto.slice(0, 300))}${m.contexto.length > 300 ? '…' : ''}»</div>` : ''}
    ${botones || confirmar ? `<div class="botones">${botones}${confirmar ? `<button class="si" data-conf="${i}">✓ Es esta persona</button>` : ''}</div>` : ''}
  </div>`;
}

// Conecta los botones «Texto / Imagen / Archivo» de una lista de menciones.
export function conectar(caja, lista, acciones) {
  caja.querySelectorAll('[data-conf]').forEach(b => b.onclick = () => acciones.confirmar(lista[+b.dataset.conf]));
  caja.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    const m = lista[+b.dataset.m], a = abribles(m)[+b.dataset.a];
    const titulo = (m.titulo || m.nombre || '').trim();
    if (a.tipo === 'texto') acciones.texto(a.ruta, titulo);
    else if (a.tipo === 'imagen') acciones.imagen(a.ruta, titulo);
    else acciones.archivo(a.ruta, titulo);
  });
}

// Puntuación de una mención posible para una persona: año dentro de su vida y lugar entre los suyos.
const plano = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function puntuar(m, p) {
  if (!p) return { n: 0, notas: [] };
  let n = 0; const notas = [];
  const y = m.anio || m.danio;
  if (y && p.ymin != null) {
    const desde = p.ymin - 3, hasta = (p.ymax != null && p.ymax > p.ymin ? p.ymax : p.ymin + 90) + 3;
    if (y >= desde && y <= hasta) { n += 2; notas.push('año dentro de su vida'); } else { n -= 2; notas.push('año fuera de su vida'); }
  }
  const l = plano((m.lugar || '').split(/[,(]/)[0]).trim();
  if (l.length > 2 && plano((p.lugares || []).join(' | ')).includes(l)) { n += 1; notas.push('lugar suyo'); }
  return { n, notas };
}

// Árboles ya hechos (impresos en PDF o SVG, listados de otros programas, el árbol antiguo): repiten los datos del GEDCOM,
// no son fuentes. Se reconocen por el formato: «b: / m: / d:», ✻ ⚭, o varias fechas a la inglesa (29 NOV 1947).
const FECHA_GED = /\b\d{1,2} (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.? \d{4}\b/gi;
export function esArbolHecho(m) {
  if (m.origen === 'arbol' || /\.svg$/i.test(m.ruta || '') || /\.svg$/i.test((m.titulo || '').trim())) return true;
  if (!['pdf_texto', 'copia_ligera', 'original', 'descarga'].includes(m.origen)) return false;
  const c = m.contexto || '';
  return /(^|\s)[bmd]: |[✻⚭]|\b(ancestors|descendants) of\b|font-family=/i.test(c) || (c.match(FECHA_GED) || []).length >= 2;
}
// Mismo texto en varios documentos (copias del mismo archivo, versiones del mismo árbol): se muestra una vez.
const claveTexto = m => plano(m.contexto || '').replace(/\b(in|en|b|m|d)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
function agrupar(lista) {
  const g = new Map();
  for (const m of lista) {
    const k = (m.xref || '') + '|' + (claveTexto(m) || 'doc:' + (m.ruta || m.titulo));
    if (g.has(k)) g.get(k)._otros.push(m); else g.set(k, { ...m, _otros: [] });
  }
  return [...g.values()];
}

// Pestaña «Menciones» de la ficha de una persona
export function pintarMenciones(caja, { enlazadas, posibles }, acciones, persona = null) {
  posibles = posibles.map(x => ({ ...x, _p: puntuar(x, persona) })).sort((a, b) => b._p.n - a._p.n);
  const hechos = [...enlazadas, ...posibles].filter(esArbolHecho);
  enlazadas = enlazadas.filter(m => !esArbolHecho(m)); posibles = posibles.filter(m => !esArbolHecho(m));
  const seguras = agrupar(enlazadas.filter(m => fiabilidad(m.enlace) === 'seguro')), pistas = agrupar(enlazadas.filter(m => fiabilidad(m.enlace) !== 'seguro'));
  posibles = agrupar(posibles);
  const arboles = agrupar(hechos);
  const todas = [...seguras, ...pistas, ...posibles, ...arboles];
  let i = 0;
  const cuenta = l => { const n = l.reduce((s, m) => s + 1 + m._otros.length, 0); return n > l.length ? `${l.length} distintas; ${n} con las repetidas` : l.length; };
  const filas = (lista, conf) => lista.map(m => filaMencion(m, i++, { enlazar: false, confirmar: conf && !!acciones.confirmar })).join('');
  const bloque = (titulo, lista, ayuda, conf) => lista.length ? `<h4>${titulo} (${cuenta(lista)})</h4><p class="peq">${ayuda}</p>${filas(lista, conf)}` : '';
  caja.innerHTML = todas.length ? bloque('Enlazadas con seguridad', seguras, 'Citas del registro, número o identificador escrito en el texto, o cabecera de la transcripción.')
      + bloque('Pistas', pistas, 'Enlazadas solo por el nombre (único en el árbol) o por nombre y año: hay que comprobarlas.', true)
      + bloque('Posibles por el nombre', posibles, 'Mismo nombre (con la misma clave fonética) en documentos sin enlace a nadie del árbol: pueden ser otra persona. Ordenadas: primero las que encajan con sus fechas y lugares.', true)
      + (arboles.length ? `<details class="arboles-hechos"><summary>Árboles ya hechos (${cuenta(arboles)}): impresos en PDF o SVG, listados de otros programas y el árbol antiguo</summary>
          <p class="peq">Repiten lo que ya está en el árbol: no son fuentes. Sirven, como mucho, para ver qué se sabía antes.</p>${filas(arboles, false)}</details>` : '')
    : '<p class="nada">No sale en la base de nombres.</p>';
  conectar(caja, todas, acciones);
}

const etiquetaAhn = p => [p.ahnentafel ? `n.º ${p.ahnentafel}` : '', p.ahnentafel_diana ? `D${p.ahnentafel_diana}` : ''].filter(Boolean).join(', ');

// Resultados de «¿Dónde aparece…?»
export function pintarDonde(caja, { personas, menciones }, acciones) {
  let grupos = [];
  caja.innerHTML = `<h3>En el árbol: ${personas.length} persona${personas.length === 1 ? '' : 's'}</h3>
    <div class="lista">${personas.map(p => `<a class="tarjeta s${p.sexo || 'U'}" href="#/p/${esc(p.xref.slice(1, -1))}">
      <span class="nom">${esc(p.nombre)}</span>
      <span class="vida">${[p.nac_fecha && 'n. ' + p.nac_fecha + (p.nac_lugar ? ' ' + p.nac_lugar : ''), p.def_fecha && 'f. ' + p.def_fecha + (p.def_lugar ? ' ' + p.def_lugar : '')].filter(Boolean).map(esc).join(' — ')}</span>
      ${etiquetaAhn(p) ? `<span class="insig"><span class="ahn">${esc(etiquetaAhn(p))}</span></span>` : ''}</a>`).join('')}</div>
    <h3>En documentos: ${menciones.length} ${menciones.length === 1 ? 'mención' : 'menciones'}${menciones.length >= 300 ? ' (las 300 primeras)' : ''}</h3>
    ${(() => { const l = agrupar(menciones.filter(m => !esArbolHecho(m))), a = agrupar(menciones.filter(esArbolHecho)); grupos = [...l, ...a];
      return (l.map((m, i) => filaMencion(m, i)).join('') || '<p class="nada">Ninguna fuera de los árboles ya hechos.</p>')
        + (a.length ? `<details class="arboles-hechos"><summary>Árboles ya hechos (${a.length}): no son fuentes</summary>${a.map((m, i) => filaMencion(m, l.length + i)).join('')}</details>` : ''); })()}`;
  conectar(caja, grupos, acciones);
}

// Resultados de «¿Quién hay en el lugar…?»
export function pintarLugar(caja, { lugares, eventos, menciones }, acciones) {
  const TIPO = { BIRT: 'nace', CHR: 'bautizo', BAPM: 'bautizo', DEAT: 'muere', BURI: 'entierro', MARR: 'boda', RESI: 'vive', OCCU: 'oficio' };
  caja.innerHTML = `<p class="peq">Lugares que coinciden: ${lugares.slice(0, 15).map(l => esc(l.forma + (l.municipio ? ` (${l.municipio})` : ''))).join('; ') || 'ninguno'}</p>
    <h3>Hechos del árbol en ese lugar: ${eventos.length}</h3>
    <div class="eventos">${eventos.map(e => `<div><span class="anio">${esc(e.anio || '')}</span> ${esc(TIPO[e.tipo] || e.tipo)} · <a href="#/p/${esc(e.xref.slice(1, -1))}">${esc(e.nombre)}</a> <span class="peq">${esc(e.fecha || '')}, ${esc(e.lugar || '')}</span></div>`).join('') || '<p class="nada">Ninguno.</p>'}</div>
    <h3>Personas en documentos de ese lugar: ${menciones.length}</h3>
    ${menciones.map((m, i) => filaMencion(m, i)).join('') || '<p class="nada">Ninguna.</p>'}`;
  conectar(caja, menciones, acciones);
}
