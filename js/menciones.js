// Pantallas de la base de nombres y lugares: menciones de una persona y buscadores «¿dónde aparece…?» y «¿quién hay en…?».
import { tarjeta } from './vistas.js?v=202611051114';
import { esc } from './md.js?v=202611051114';
import { fiabilidad, aniosEnTexto } from './nombresdb.js?v=202611051114';

const TEXTO = /\.(md|txt|csv|html?)$/i, IMAGEN = /\.(jpe?g|png|gif|tiff?|bmp|webp)$/i;
const ORIGEN = { registro: 'registro', transcripcion: 'transcripción', pdf_texto: 'texto de PDF', copia_ligera: 'copia ligera', ficha: 'ficha',
  arbol: 'árbol antiguo', gedcom: 'GEDCOM', gedcom_notas: 'notas del GEDCOM', descarga: 'descarga', original: 'original' };
const sinOriginal = r => r && r.startsWith('ORIGINAL/') ? r.slice(9) : r;

// Qué se puede abrir de una mención: su texto (transcripción, ficha…) y su imagen.
function abribles(mm) {
  const out = [];
  if (mm.origen === 'gedcom' || mm.origen === 'gedcom_notas') return out;   // es el propio GEDCOM
  // Un documento del registro con varias páginas trae «a.md|b.md|…»: se abre la primera
  const primera = r => r && r.split('|')[0].trim();
  const m = { ...mm, transcripcion: primera(mm.transcripcion), ruta: primera(mm.ruta), ruta_original: primera(mm.ruta_original) };
  // Un documento del registro no tiene ruta propia: solo vale su transcripción.
  const candidatas = m.origen === 'registro' ? [m.transcripcion] : [m.transcripcion, m.ruta];
  const texto = candidatas.find(r => r && TEXTO.test(r) && !r.includes('*'));
  if (texto) out.push({ tipo: 'texto', ruta: sinOriginal(texto) });
  else if (m.origen !== 'registro' && m.ruta && !m.ruta.includes('*') && !/\.ged$/i.test(m.ruta)) out.push({ tipo: 'archivo', ruta: sinOriginal(m.ruta) });
  // La imagen: relativa a «Genealogia»; las rutas de antes de la mudanza (descargas: Genealogia_2) las traduce almacen.js.
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
    ${m._mas?.length ? `<details class="peq mas-en-doc"><summary>Y ${m._mas.length} ${m._mas.length === 1 ? 'mención' : 'menciones'} más en este documento: ${esc([...new Set(m._mas.map(o => o.nombre))].slice(0, 5).join(', '))}${new Set(m._mas.map(o => o.nombre)).size > 5 ? '…' : ''}</summary>
      ${m._mas.slice(0, 200).map(o => `<div><b>${esc(o.nombre)}</b>${o.papel && o.papel !== 'texto' ? ' — ' + esc(o.papel) : ''}${o.xref ? ` → <a href="#/p/${esc(o.xref.slice(1, -1))}">${esc(o.enlazado || o.xref)}</a>` : ''}${o.pagina && !['gedcom_notas', 'arbol'].includes(o.origen) ? ' · p. ' + esc(o.pagina) : ''}${o.contexto ? ` <span class="ctx">«${esc(o.contexto.slice(0, 200))}»</span>` : ''}</div>`).join('')}
      ${m._mas.length > 200 ? `<div>… y ${m._mas.length - 200} más (están todas en el Excel).</div>` : ''}</details>` : ''}
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

// Una fila por documento. La lista llega ordenada, así que la primera mención de cada documento es la mejor; las demás quedan
// dentro de ella (_mas). Una cita del registro se une a la transcripción del mismo documento y del mismo año: es la misma partida.
function porDocumento(lista) {
  const trans = new Map();   // reg_id → [mención de transcripción con su documento y año]
  for (const m of lista) if (m.origen === 'transcripcion' && m.reg_id) {
    if (!trans.has(m.reg_id)) trans.set(m.reg_id, new Map());
    if (!trans.get(m.reg_id).has(m.doc_id)) trans.get(m.reg_id).set(m.doc_id, m);
  }
  const g = new Map();
  for (const m of lista) {
    let doc = m.doc_id, base = null;
    if (m.origen === 'registro' && trans.has(m.reg_id)) {
      const ys = aniosEnTexto(m.contexto), cands = [...trans.get(m.reg_id).values()];
      const a = o => o.anio ?? o.danio;
      base = cands.length === 1 ? (!ys.length || ys.includes(a(cands[0])) ? cands[0] : null) : cands.find(o => ys.includes(a(o))) || null;
      if (base) doc = base.doc_id;
    }
    const f = g.get(doc);
    if (!f) {
      // La fila abre la transcripción aunque la mejor mención venga del registro
      g.set(doc, { ...m, ...(base ? { titulo: base.titulo, ruta: base.ruta, ruta_original: base.ruta_original, transcripcion: base.transcripcion, origen: base.origen, doc_id: base.doc_id, fecha: base.fecha, anio: base.anio, danio: base.danio } : {}), _mas: [] });
      continue;
    }
    if (m.clave === f.clave && m.origen !== f.origen) {   // la misma persona por las dos vías: se juntan sus datos
      if (!f.xref && m.xref) { f.xref = m.xref; f.enlace = m.enlace; f.enlazado = m.enlazado; }
      if (!f.contexto && m.contexto) f.contexto = m.contexto;
      if ((!f.papel || f.papel === 'texto') && m.papel) f.papel = m.papel;
      continue;
    }
    f._mas.push(m);
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

// ---------- Listas largas: se pinta un trozo y se dice cuántas quedan ----------
const miles = n => n.toLocaleString('es');
const plural = (n, uno, varios) => `${miles(n)} ${n === 1 ? uno : varios}`;

// Pinta «lista» en «cont» de PASO en PASO, con un botón que dice cuántas faltan. «pintar(trozo, indiceInicial)» da el HTML;
// «tras()» se llama cada vez que se añaden filas (para conectar sus botones).
function listaPorTrozos(cont, lista, pintar, tras, paso = 30) {
  let hechos = 0;
  const pie = document.createElement('p');
  pie.className = 'mas-resultados';
  const sigue = n => {
    const trozo = lista.slice(hechos, hechos + n);
    pie.insertAdjacentHTML('beforebegin', pintar(trozo, hechos));
    hechos += trozo.length;
    const faltan = lista.length - hechos;
    pie.innerHTML = faltan ? `<span class="peq">Se ven ${miles(hechos)} de ${miles(lista.length)}; faltan ${miles(faltan)}.</span>
      <button data-mas>Ver ${miles(Math.min(paso, faltan))} más</button>${faltan > paso ? ` <button data-todas>Ver todas</button>` : ''}` : '';
    pie.querySelector('[data-mas]')?.addEventListener('click', () => sigue(paso));
    pie.querySelector('[data-todas]')?.addEventListener('click', () => sigue(lista.length));
    tras?.();
  };
  cont.append(pie);
  sigue(paso);
}

// Un bloque de menciones: título, ayuda y filas, con sus botones Texto / Imagen conectados.
function bloqueMenciones(padre, lista, acciones, { titulo, ayuda, plegado, clase = '' }) {
  if (!lista.length) return;
  const cuerpo = document.createElement('div');
  listaPorTrozos(cuerpo, lista, (trozo, ini) => trozo.map((m, i) => filaMencion(m, ini + i)).join(''), () => conectar(cuerpo, lista, acciones));
  if (plegado) {
    const d = document.createElement('details');
    d.className = 'arboles-hechos ' + clase;
    d.innerHTML = `<summary>${titulo}</summary>${ayuda ? `<p class="peq">${ayuda}</p>` : ''}`;
    d.append(cuerpo); padre.append(d);
  } else {
    padre.insertAdjacentHTML('beforeend', `${titulo ? `<h4>${titulo}</h4>` : ''}${ayuda ? `<p class="peq">${ayuda}</p>` : ''}`);
    padre.append(cuerpo);
  }
}

const tarjetaPersona = p => `<a class="tarjeta s${p.sexo || 'U'}" href="#/p/${esc(p.xref.slice(1, -1))}">
      <span class="nom">${esc(p.nombre)}</span>
      <span class="vida">${[p.nac_fecha && 'n. ' + p.nac_fecha + (p.nac_lugar ? ' ' + p.nac_lugar : ''), p.def_fecha && 'f. ' + p.def_fecha + (p.def_lugar ? ' ' + p.def_lugar : '')].filter(Boolean).map(esc).join(' — ')}${p._p?.notas.length ? ` <span class="falta-dato">${esc(p._p.notas.join(', '))}</span>` : ''}</span>
      ${etiquetaAhn(p) ? `<span class="insig"><span class="ahn">${esc(etiquetaAhn(p))}</span></span>` : ''}</a>`;

function bloquePersonas(padre, lista, { titulo, plegado }) {
  if (!lista.length) return;
  const cuerpo = document.createElement('div');
  cuerpo.className = 'lista';
  listaPorTrozos(cuerpo, lista, trozo => trozo.map(tarjetaPersona).join(''));
  if (plegado) { const d = document.createElement('details'); d.className = 'arboles-hechos'; d.innerHTML = `<summary>${titulo}</summary>`; d.append(cuerpo); padre.append(d); }
  else { padre.insertAdjacentHTML('beforeend', titulo ? `<h4>${titulo}</h4>` : ''); padre.append(cuerpo); }
}

// Excel: toda la lista, aunque en pantalla solo se vea un trozo.
const NOM_GRUPO = ['Cumple', 'Cumple en parte', 'Sin dato', 'Fuera de lo pedido'];
function datosExcel(menciones) {
  return () => ({
    cabecera: ['Grupo', 'Nombre', 'Papel', 'Fecha', 'Año', 'Lugar', 'Documento', 'Procedencia', 'Código', 'Persona enlazada', 'Por qué', 'Contexto', 'Ruta'],
    filas: menciones.map(m => [NOM_GRUPO[m._g] || '', m.nombre, m.papel || '', m.fecha || '', m.anio || m.danio || '', m.lugar || '', (m.titulo || '').trim(), ORIGEN[m.origen] || m.origen || '',
      m.xref || '', m.enlazado || '', (m._p?.notas || []).join(', '), m.contexto || '', (m.transcripcion || m.ruta || '').split('|')[0]]),
  });
}

// Resultados de «¿Dónde aparece…?»: primero los documentos que cumplen lo pedido, en grupos, y nada se oculta sin decirlo.
export function pintarDonde(caja, { personas, menciones, lugares = [], filtros = false }, acciones, pedido = {}) {
  caja.innerHTML = '';
  caja._excel = datosExcel(menciones);
  const hechos = menciones.filter(esArbolHecho), docs = menciones.filter(m => !esArbolHecho(m));
  const de = (lista, g) => lista.filter(x => x._g === g);
  const grupos = [0, 1, 2, 3].map(g => agrupar(porDocumento(de(docs, g))));
  const pg = [0, 1, 2, 3].map(g => de(personas, g));

  const queda = [pedido.lugar?.trim() && `lugar «${pedido.lugar.trim()}»`,
    pedido.desde != null || pedido.hasta != null ? (pedido.desde === pedido.hasta ? `año ${pedido.desde}` : `años ${pedido.desde ?? '…'}–${pedido.hasta ?? '…'}`) : '',
    pedido.tipo && `tipo «${pedido.tipo}»`, pedido.archivo && `archivo «${pedido.archivo}»`, pedido.papel && `papel «${pedido.papel}»`, pedido.ancestros && 'solo esa línea',
    pedido.conFoto && 'con foto', pedido.transcrito && 'transcrito', pedido.enlazado && 'enlazado al árbol'].filter(Boolean).join(', ');
  caja.insertAdjacentHTML('beforeend', `<h3>En documentos</h3><p class="resumen-busqueda">${filtros
    ? `Con ${esc(queda)}: <b>${plural(grupos[0].length, 'documento cumple', 'documentos cumplen')}</b>${grupos[1].length ? `, ${plural(grupos[1].length, 'cumple en parte', 'cumplen en parte')}` : ''}${grupos[2].length ? `, ${plural(grupos[2].length, 'no tiene ese dato', 'no tienen ese dato')}` : ''}${grupos[3].length ? `; ${plural(grupos[3].length, 'queda fuera', 'quedan fuera')}` : ''}.`
    : `<b>${plural(grupos[0].length, 'documento', 'documentos')}</b>${hechos.length ? `, y ${plural(hechos.length, 'mención', 'menciones')} en árboles ya hechos` : ''}.`}</p>
    ${pedido.lugar?.trim() ? (lugares.length ? `<details class="peq"><summary>${plural(lugares.length, 'lugar coincide', 'lugares coinciden')} con «${esc(pedido.lugar.trim())}»</summary>${lugares.map(l => esc(l.forma)).join('; ')}</details>`
      : `<p class="peq">«${esc(pedido.lugar.trim())}» no es ningún lugar de la base: solo se busca esa palabra junto a los nombres.</p>`) : ''}`);

  // --- Documentos
  if (filtros && !grupos[0].length) caja.insertAdjacentHTML('beforeend', '<p class="nada">Ningún documento cumple todo lo pedido. Mira abajo los que no tienen el dato.</p>');
  if (!filtros && !grupos[0].length) caja.insertAdjacentHTML('beforeend', '<p class="nada">Ninguna fuera de los árboles ya hechos.</p>');
  bloqueMenciones(caja, grupos[0], acciones, { titulo: '' });   // el resumen ya dice cuántos cumplen
  bloqueMenciones(caja, grupos[1], acciones, { plegado: grupos[0].length > 0, titulo: `Cumplen en parte (${miles(grupos[1].length)}): coincide un dato y del otro no consta nada`,
    ayuda: 'Cada una dice qué dato le falta: pueden ser o no.' });
  bloqueMenciones(caja, grupos[2], acciones, { plegado: true, titulo: `Sin ese dato (${miles(grupos[2].length)}): mismo nombre, sin nada que comprobar`,
    ayuda: 'No se pueden descartar: son sobre todo libros, fichas y notas. No se ocultan, pero no se sabe si cumplen.' });
  bloqueMenciones(caja, grupos[3], acciones, { plegado: true, titulo: `Fuera de lo pedido (${miles(grupos[3].length)}): algún dato no coincide` });
  const a = agrupar(porDocumento(hechos.filter(m => m._g !== 3)));
  bloqueMenciones(caja, a, acciones, { plegado: true, titulo: `Árboles ya hechos (${miles(a.length)}): no son fuentes` });

}

// Personas del árbol, del GEDCOM abierto: arriba, con pocas tarjetas para no empujar los documentos.
export function pintarArbol(caja, arbol, { lista, filtros }) {
  caja.innerHTML = '';
  if (!lista.length) { caja.innerHTML = '<h3>En el árbol</h3><p class="nada">Nadie con esos datos.</p>'; return; }
  const de = g => lista.filter(x => x._g === g);
  const tarjetas = (l, paso) => { const c = document.createElement('div'); c.className = 'lista'; listaPorTrozos(c, l, tr => tr.map(x => tarjeta(arbol, x.p.id) + (x.notas.length ? `<span class="falta-dato">${esc(x.notas.join(', '))}</span>` : '')).join(''), null, paso); return c; };
  caja.insertAdjacentHTML('beforeend', `<h3>En el árbol: ${filtros ? `${plural(de(0).length, 'persona cumple', 'personas cumplen')}, de ${miles(lista.length)}` : plural(lista.length, 'persona', 'personas')}</h3>`);
  if (de(0).length) caja.append(tarjetas(de(0), 6));
  [[1, 'Cumplen en parte'], [2, 'Sin fechas ni lugares en el árbol'], [3, 'Fuera de lo pedido']].forEach(([g, tit]) => {
    if (!de(g).length) return;
    const d = document.createElement('details'); d.className = 'arboles-hechos';
    d.innerHTML = `<summary>${tit} (${miles(de(g).length)})</summary>`; d.append(tarjetas(de(g), 30)); caja.append(d);
  });
}

// Resultados de «¿Quién hay en el lugar…?»
export function pintarLugar(caja, { lugares, eventos, menciones, filtros = false }, acciones) {
  const TIPO = { BIRT: 'nace', CHR: 'bautizo', BAPM: 'bautizo', DEAT: 'muere', BURI: 'entierro', MARR: 'boda', RESI: 'vive', OCCU: 'oficio' };
  const fila = e => `<div><span class="anio">${esc(e.anio || '')}</span> ${esc(TIPO[e.tipo] || e.tipo)} · <a href="#/p/${esc(e.xref.slice(1, -1))}">${esc(e.nombre)}</a> <span class="peq">${esc(e.fecha || '')}, ${esc(e.lugar || '')}</span></div>`;
  caja.innerHTML = `<p class="peq">Lugares que coinciden: ${lugares.slice(0, 15).map(l => esc(l.forma + (l.municipio ? ` (${l.municipio})` : ''))).join('; ') || 'ninguno'}${lugares.length > 15 ? ` y ${lugares.length - 15} más` : ''}</p>`;
  caja._excel = datosExcel(menciones);
  const ev = [0, 2, 3].map(g => eventos.filter(e => e._g === g));
  const pintaEv = (lista, padre) => { const c = document.createElement('div'); c.className = 'eventos'; listaPorTrozos(c, lista, t => t.map(fila).join('')); padre.append(c); };
  const pleg = (lista, titulo) => { if (!lista.length) return; const d = document.createElement('details'); d.className = 'arboles-hechos'; d.innerHTML = `<summary>${titulo}</summary>`; pintaEv(lista, d); caja.append(d); };
  pleg(ev[0], `Hechos del árbol en ese lugar (${miles(ev[0].length)})`);
  pleg(ev[1], `Sin fecha en el árbol (${miles(ev[1].length)})`);
  pleg(ev[2], `De otros años (${miles(ev[2].length)})`);
  const m = [0, 1, 2, 3].map(g => porDocumento(menciones.filter(x => x._g === g)));
  caja.insertAdjacentHTML('beforeend', `<h3>Documentos de ese lugar: ${miles(m[0].length)}</h3>`);
  if (!m[0].length) caja.insertAdjacentHTML('beforeend', '<p class="nada">Ninguna.</p>');
  bloqueMenciones(caja, m[0], acciones, { titulo: '' });
  bloqueMenciones(caja, m[1], acciones, { titulo: `Cumplen en parte (${miles(m[1].length)}): coincide un dato y del otro no consta nada` });
  bloqueMenciones(caja, m[2], acciones, { plegado: true, titulo: `Sin ese dato (${miles(m[2].length)}): no se sabe si cumplen` });
  bloqueMenciones(caja, m[3], acciones, { plegado: true, titulo: `Fuera de lo pedido (${miles(m[3].length)}): algún dato no coincide` });
}
