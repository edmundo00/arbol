// Pantallas de la base de nombres y lugares: menciones de una persona y buscadores «¿dónde aparece…?» y «¿quién hay en…?».
import { esc } from './md.js?v=202611010938';
import { fiabilidad } from './nombresdb.js?v=202611010938';

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

export function filaMencion(m, i, { enlazar = true } = {}) {
  const f = fiabilidad(m.enlace);
  const enl = enlazar && m.xref ? ` → <a href="#/p/${esc(m.xref.slice(1, -1))}">${esc(m.enlazado || m.xref)}</a> <span class="fiab ${f}" title="${esc(m.enlace || '')}">${f === 'seguro' ? 'seguro' : 'pista'}</span>` : '';
  const botones = abribles(m).map((a, k) => `<button data-m="${i}" data-a="${k}">${a.tipo === 'imagen' ? '📷 Imagen' : a.tipo === 'texto' ? '📜 Texto' : '📄 Archivo'}</button>`).join('');
  return `<div class="mencion">
    <div><b>${esc(m.nombre)}</b>${m.papel && m.papel !== 'texto' ? ' — ' + esc(m.papel) : ''}${m.fecha ? ', ' + esc(m.fecha) : ''}${enl}
      ${m.n_veces > 1 ? `<span class="peq"> ×${m.n_veces}</span>` : ''}</div>
    <div class="peq">${esc((m.titulo || '').trim())} · ${esc(ORIGEN[m.origen] || m.origen || '')}${m.pagina && !['gedcom_notas', 'arbol'].includes(m.origen) ? ' · p. ' + esc(m.pagina) : ''}${m.anio || m.danio ? ' · ' + esc(m.anio || m.danio) : ''}</div>
    ${m.contexto ? `<div class="ctx">«${esc(m.contexto.slice(0, 300))}${m.contexto.length > 300 ? '…' : ''}»</div>` : ''}
    ${botones ? `<div class="botones">${botones}</div>` : ''}
  </div>`;
}

// Conecta los botones «Texto / Imagen / Archivo» de una lista de menciones.
export function conectar(caja, lista, acciones) {
  caja.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
    const m = lista[+b.dataset.m], a = abribles(m)[+b.dataset.a];
    const titulo = (m.titulo || m.nombre || '').trim();
    if (a.tipo === 'texto') acciones.texto(a.ruta, titulo);
    else if (a.tipo === 'imagen') acciones.imagen(a.ruta, titulo);
    else acciones.archivo(a.ruta, titulo);
  });
}

// Pestaña «Menciones» de la ficha de una persona
export function pintarMenciones(caja, { enlazadas, posibles }, acciones) {
  const seguras = enlazadas.filter(m => fiabilidad(m.enlace) === 'seguro'), pistas = enlazadas.filter(m => fiabilidad(m.enlace) !== 'seguro');
  const todas = [...seguras, ...pistas, ...posibles];
  let i = 0;
  const bloque = (titulo, lista, ayuda) => lista.length ? `<h4>${titulo} (${lista.length})</h4><p class="peq">${ayuda}</p>${lista.map(m => filaMencion(m, i++, { enlazar: false })).join('')}` : '';
  caja.innerHTML = todas.length ? bloque('Enlazadas con seguridad', seguras, 'Citas del registro, número o identificador escrito en el texto, o cabecera de la transcripción.')
      + bloque('Pistas', pistas, 'Enlazadas solo por el nombre (único en el árbol) o por nombre y año: hay que comprobarlas.')
      + bloque('Posibles por el nombre', posibles, 'Mismo nombre (con la misma clave fonética) en documentos sin enlace a nadie del árbol: pueden ser otra persona.')
    : '<p class="nada">No sale en la base de nombres.</p>';
  conectar(caja, todas, acciones);
}

const etiquetaAhn = p => [p.ahnentafel ? `n.º ${p.ahnentafel}` : '', p.ahnentafel_diana ? `D${p.ahnentafel_diana}` : ''].filter(Boolean).join(', ');

// Resultados de «¿Dónde aparece…?»
export function pintarDonde(caja, { personas, menciones }, acciones) {
  caja.innerHTML = `<h3>En el árbol: ${personas.length} persona${personas.length === 1 ? '' : 's'}</h3>
    <div class="lista">${personas.map(p => `<a class="tarjeta s${p.sexo || 'U'}" href="#/p/${esc(p.xref.slice(1, -1))}">
      <span class="nom">${esc(p.nombre)}</span>
      <span class="vida">${[p.nac_fecha && 'n. ' + p.nac_fecha + (p.nac_lugar ? ' ' + p.nac_lugar : ''), p.def_fecha && 'f. ' + p.def_fecha + (p.def_lugar ? ' ' + p.def_lugar : '')].filter(Boolean).map(esc).join(' — ')}</span>
      ${etiquetaAhn(p) ? `<span class="insig"><span class="ahn">${esc(etiquetaAhn(p))}</span></span>` : ''}</a>`).join('')}</div>
    <h3>En documentos: ${menciones.length} ${menciones.length === 1 ? 'mención' : 'menciones'}${menciones.length >= 300 ? ' (las 300 primeras)' : ''}</h3>
    ${menciones.map((m, i) => filaMencion(m, i)).join('') || '<p class="nada">Ninguna.</p>'}`;
  conectar(caja, menciones, acciones);
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
