// Alta rápida desde una partida (bautismo, matrimonio o defunción), con el documento a la izquierda.
// Cada persona de la partida se crea o se elige entre las que ya existen; los apellidos se proponen a la española.
import { esc } from './md.js?v=202611062128';
import { aGedcom } from './fechas.js?v=202611062128';
import { buscar } from './buscar.js?v=202611062128';
import { nombreCompleto, vida } from './modelo.js?v=202611062128';
import { primerApellido, segundoApellido } from './editar.js?v=202611062128';

export const PARTIDAS = {
  bautismo: { nombre: 'Bautismo', roles: [['bautizado', 'Bautizado/a', null], ['padre', 'Padre', 'M'], ['madre', 'Madre', 'F'],
    ['abuelo_p', 'Abuelo paterno', 'M'], ['abuela_p', 'Abuela paterna', 'F'], ['abuelo_m', 'Abuelo materno', 'M'], ['abuela_m', 'Abuela materna', 'F']], texto: 'Padrinos' },
  matrimonio: { nombre: 'Matrimonio', roles: [['novio', 'Novio', 'M'], ['novia', 'Novia', 'F'], ['padre_novio', 'Padre del novio', 'M'], ['madre_novio', 'Madre del novio', 'F'],
    ['padre_novia', 'Padre de la novia', 'M'], ['madre_novia', 'Madre de la novia', 'F']], texto: 'Testigos' },
  defuncion: { nombre: 'Defunción', roles: [['difunto', 'Difunto/a', null], ['conyuge', 'Cónyuge', null], ['padre', 'Padre', 'M'], ['madre', 'Madre', 'F']], texto: 'Otros datos (testamento, sepultura…)' },
};
// Papel de cada uno en la cita
export const PAPEL = { bautizado: 'bautizado', padre: 'padre', madre: 'madre', abuelo_p: 'abuelo paterno', abuela_p: 'abuela paterna', abuelo_m: 'abuelo materno',
  abuela_m: 'abuela materna', novio: 'contrayente', novia: 'contrayente', padre_novio: 'padre del novio', madre_novio: 'madre del novio',
  padre_novia: 'padre de la novia', madre_novia: 'madre de la novia', difunto: 'difunto', conyuge: 'cónyuge del difunto' };

// o: { arbol, variantes, docs: [{id, titulo}], lugares, persona: xref de la ficha, mostrarDoc(docId, caja) }
export function formularioPartida(o) {
  const capa = document.querySelector('#dialogo');
  capa.hidden = false; document.body.classList.add('con-visor');
  const p0 = o.arbol.p(o.persona);
  capa.innerHTML = `<div class="caja dialogo partida">
    <div class="doc-lado" id="pt-doc"><p class="peq">Elige el documento (abajo, a la derecha) para verlo aquí mientras pasas los datos.</p></div>
    <div class="form-lado">
      <h2>Alta desde una partida</h2>
      <div class="dos"><label>Tipo<select id="pt-tipo">${Object.entries(PARTIDAS).map(([k, t]) => `<option value="${k}">${t.nombre}</option>`).join('')}</select></label>
        <label>Esta ficha (${esc(nombreCompleto(p0))}) es<select id="pt-rol"></select></label></div>
      <div class="dos"><label>Fecha del acto<input id="pt-fecha" placeholder="6 mar 1774 · h. 1750"><span class="ged" id="pt-fecha-ged"></span></label>
        <label>Lugar (parroquia)<input id="pt-lugar" list="pt-lugares"></label></div>
      <div class="dos" id="pt-extra"></div>
      <div id="pt-personas"></div>
      <label id="pt-texto-l"><span id="pt-texto-t"></span><textarea id="pt-texto" rows="2"></textarea></label>
      <fieldset class="doc-cita"><legend>Documento (opcional)</legend>
        ${o.docs.length ? `<label>Busca el documento del registro<input id="pt-dbuscar" autocomplete="off" placeholder="título: bautismo, Valdoviño, 1774…"></label>
        <div id="pt-dres" class="elegir"></div><p id="pt-delegido" class="elegida"></p>
        <label>Fotos donde está (números)<input id="pt-img" placeholder="1 · 3-4"></label>` : '<p class="peq">Sin acceso al registro de documentos: la partida se da de alta sin citar.</p>'}
      </fieldset>
      <p class="peq">Se crean o se enlazan todas las personas en una sola operación (se puede deshacer). Si eliges un documento, se cita en cada una con su papel y grado A.</p>
      <p class="botones"><button id="pt-ok" class="principal">Guardar la partida</button> <button id="pt-no">Cancelar</button></p>
    </div>
    <datalist id="pt-lugares">${(o.lugares || []).map(l => `<option value="${esc(l)}">`).join('')}</datalist>
  </div>`;
  const $ = s => capa.querySelector(s);
  let doc = null;
  const estado = {};   // rol → { xref } | null (nueva)
  const tocado = new Set();   // apellidos escritos a mano (no se proponen)

  const filaPersona = ([rol, etiqueta]) => `<div class="pt-persona" data-rol="${rol}">
    <div class="pt-cab"><b>${etiqueta}</b> <span class="pt-elegida" id="pt-e-${rol}"></span></div>
    <div class="dos"><input data-campo="nombre" placeholder="Nombre"><input data-campo="apellidos" placeholder="Apellidos"></div>
    <div class="pt-sug" id="pt-s-${rol}"></div></div>`;

  const pintarTipo = () => {
    const t = PARTIDAS[$('#pt-tipo').value];
    $('#pt-rol').innerHTML = t.roles.map(([r, e]) => `<option value="${r}">${e.toLowerCase()}</option>`).join('');
    $('#pt-personas').innerHTML = t.roles.map(filaPersona).join('');
    $('#pt-texto-t').textContent = t.texto;
    $('#pt-extra').innerHTML = $('#pt-tipo').value === 'bautismo' ? '<label>Fecha de nacimiento (si la dice)<input id="pt-nac" placeholder="2 mar 1774"></label>'
      : $('#pt-tipo').value === 'defuncion' ? '<label>Edad al morir (si la dice)<input id="pt-edad" inputmode="numeric"></label>' : '';
    for (const k of Object.keys(estado)) delete estado[k];
    tocado.clear();
    // La persona de la ficha, en su papel
    const rolF = t.roles.find(([, , s]) => !s || s === p0.sexo)?.[0];
    $('#pt-rol').value = rolF; ponerFicha();
    capa.querySelectorAll('.pt-persona input').forEach(i => i.addEventListener('input', ev => {
      const fila = ev.target.closest('.pt-persona'), rol = fila.dataset.rol;
      if (ev.target.dataset.campo === 'apellidos') tocado.add(rol);
      if (estado[rol]?.xref) { estado[rol] = null; marcar(rol); }
      sugerir(rol); proponer();
    }));
  };
  const valores = rol => { const f = capa.querySelector(`.pt-persona[data-rol=${rol}]`); return f ? { nombre: f.querySelector('[data-campo=nombre]').value.trim(), apellidos: f.querySelector('[data-campo=apellidos]').value.trim() } : { nombre: '', apellidos: '' }; };
  const poner = (rol, v) => { const f = capa.querySelector(`.pt-persona[data-rol=${rol}]`); if (!f) return; f.querySelector('[data-campo=nombre]').value = v.nombre || ''; f.querySelector('[data-campo=apellidos]').value = v.apellidos || ''; };
  const marcar = rol => {
    const e = estado[rol]; const caja = $('#pt-e-' + rol); if (!caja) return;
    caja.innerHTML = e?.xref ? `→ ya existe: <b>${esc(nombreCompleto(o.arbol.p(e.xref)))}</b> ${esc(vida(o.arbol.p(e.xref)))} <button type="button" class="mas" data-nueva="${rol}">no es esta, crear nueva</button>` : (valores(rol).nombre || valores(rol).apellidos ? '→ persona nueva' : '');
    caja.querySelector('[data-nueva]')?.addEventListener('click', () => { estado[rol] = null; marcar(rol); $('#pt-s-' + rol).innerHTML = ''; });
  };
  const elegir = (rol, xref) => { estado[rol] = { xref }; const p = o.arbol.p(xref); poner(rol, { nombre: p.nombre, apellidos: p.apellidos }); tocado.add(rol); marcar(rol); $('#pt-s-' + rol).innerHTML = ''; proponer(); };
  const ponerFicha = () => { const rol = $('#pt-rol').value; for (const [r, e] of Object.entries(estado)) if (e?.xref === o.persona && r !== rol) { estado[r] = null; poner(r, {}); marcar(r); } elegir(rol, o.persona); };
  const sexoDe = rol => PARTIDAS[$('#pt-tipo').value].roles.find(([r]) => r === rol)?.[2];
  let t;
  const sugerir = rol => {
    clearTimeout(t);
    t = setTimeout(() => {
      const v = valores(rol), q = `${v.nombre} ${v.apellidos}`.trim(), caja = $('#pt-s-' + rol);
      if (q.length < 3 || estado[rol]?.xref) { caja.innerHTML = ''; marcar(rol); return; }
      const s = sexoDe(rol);
      const l = buscar(o.arbol, '', { nombre: v.nombre, apellidos: v.apellidos, variantes: o.variantes, limite: 8 }).lista.filter(p => !s || p.sexo === s || p.sexo === 'U').slice(0, 4);
      caja.innerHTML = l.length ? 'Ya existen: ' + l.map(p => `<button type="button" class="mas" data-x="${esc(p.id)}">${esc(nombreCompleto(p))} <span class="peq">${esc(vida(p))}${p.nac?.lugar ? ' · ' + esc(p.nac.lugar) : ''}</span></button>`).join(' ') : '';
      caja.querySelectorAll('[data-x]').forEach(b => b.onclick = () => elegir(rol, b.dataset.x));
      marcar(rol);
    }, 250);
  };
  // Apellidos a la española
  const proponer = () => {
    const tipo = $('#pt-tipo').value, v = rol => valores(rol).apellidos;
    const prop = (rol, ap) => { if (!ap || tocado.has(rol) || estado[rol]?.xref || !capa.querySelector(`.pt-persona[data-rol=${rol}]`)) return; const f = capa.querySelector(`.pt-persona[data-rol=${rol}] [data-campo=apellidos]`); f.value = ap; f.placeholder = 'Apellidos'; };
    if (tipo === 'bautismo') {
      prop('bautizado', [primerApellido(v('padre')), primerApellido(v('madre'))].filter(Boolean).join(' '));
      prop('abuelo_p', primerApellido(v('padre'))); prop('abuela_p', segundoApellido(v('padre')));
      prop('abuelo_m', primerApellido(v('madre'))); prop('abuela_m', segundoApellido(v('madre')));
    } else if (tipo === 'matrimonio') {
      prop('padre_novio', primerApellido(v('novio'))); prop('madre_novio', segundoApellido(v('novio')));
      prop('padre_novia', primerApellido(v('novia'))); prop('madre_novia', segundoApellido(v('novia')));
    } else { prop('padre', primerApellido(v('difunto'))); prop('madre', segundoApellido(v('difunto'))); }
  };
  $('#pt-tipo').onchange = pintarTipo;
  $('#pt-rol').onchange = ponerFicha;
  $('#pt-fecha').addEventListener('input', () => { const r = aGedcom($('#pt-fecha').value); $('#pt-fecha-ged').textContent = r.ged ? '→ ' + r.ged : r.error || ''; $('#pt-fecha-ged').className = 'ged' + (r.error ? ' mal' : ''); });
  pintarTipo();
  // Documento
  if (o.docs.length) {
    const plano = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const pintarD = () => {
      const q = plano($('#pt-dbuscar').value);
      if (q.length < 2) { $('#pt-dres').innerHTML = ''; return; }
      const ws = q.split(/\s+/).filter(Boolean);   // todas las palabras, en cualquier orden
      const l = o.docs.filter(x => { const t = plano(x.titulo + ' ' + x.id); return ws.every(w => t.includes(w)); }).slice(0, 30);
      $('#pt-dres').innerHTML = l.map((x, i) => `<button type="button" data-i="${i}"><b>${esc(x.titulo)}</b></button>`).join('') || '<p class="peq">Ninguno.</p>';
      $('#pt-dres').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { doc = l[+b.dataset.i]; $('#pt-delegido').textContent = 'Documento: ' + doc.titulo; $('#pt-dres').innerHTML = ''; o.mostrarDoc(doc.id, $('#pt-doc')); });
    };
    $('#pt-dbuscar').addEventListener('input', pintarD);
  }
  return new Promise(ok => {
    const cerrar = v => { capa.hidden = true; capa.innerHTML = ''; document.body.classList.remove('con-visor'); ok(v); };
    $('#pt-no').onclick = () => cerrar(null);
    $('#pt-ok').onclick = () => {
      const tipo = $('#pt-tipo').value, f = aGedcom($('#pt-fecha').value);
      if (f.error) return alert('Fecha del acto: ' + f.error);
      const nac = $('#pt-nac') ? aGedcom($('#pt-nac').value) : { ged: '' };
      if (nac.error) return alert('Fecha de nacimiento: ' + nac.error);
      const personas = {};
      for (const [rol] of PARTIDAS[tipo].roles) {
        if (estado[rol]?.xref) { personas[rol] = { xref: estado[rol].xref }; continue; }
        // Solo cuenta si se ha escrito el nombre (o los apellidos a mano): los apellidos propuestos solos no dan de alta a nadie
        const v = valores(rol); if (!v.nombre && !(v.apellidos && tocado.has(rol))) continue;
        personas[rol] = { nueva: { nombre: v.nombre, apellidos: v.apellidos, sexo: sexoDe(rol) || (rol === 'conyuge' ? (o.arbol.p(personas.difunto?.xref)?.sexo === 'F' ? 'M' : 'F') : 'U') } };
      }
      const principal = { bautismo: 'bautizado', matrimonio: 'novio', defuncion: 'difunto' }[tipo];
      if (!personas[principal] && !(tipo === 'matrimonio' && personas.novia)) return alert('Falta la persona principal de la partida.');
      const img = $('#pt-img')?.value.trim() || '';
      if (img && !/^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/.test(img)) return alert('Las fotos se ponen con números: «1,3-5».');
      cerrar({ tipo, fecha: f.ged || '', lugar: $('#pt-lugar').value.trim(), nac: nac.ged || '', edad: $('#pt-edad') ? parseInt($('#pt-edad').value, 10) : NaN,
        texto: $('#pt-texto').value.trim(), personas, doc, imagenes: img });
    };
  });
}
