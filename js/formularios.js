// Formulario de persona: nueva o elegida entre las que ya existen, con fechas en español y avisos de imposibles.
import { esc } from './md.js?v=202611011024';
import { aGedcom, aTexto, avisos, posiblesDuplicados, nacimientoPorEdad } from './fechas.js?v=202611011024';
import { buscar } from './buscar.js?v=202611011024';
import { clave } from './buscar.js?v=202611011024';
import { nombreCompleto, vida } from './modelo.js?v=202611011024';

// opciones: { titulo, datos: {nombre, apellidos, sexo, nac:{fecha,lugar}, def:{fecha,lugar}}, existente: bool, boda: bool,
//             contexto: {padres:[persona], hijos:[persona]}, excluir: Set, arbol, variantes, lugares: [texto] }
// Devuelve una promesa: { nueva: datos } | { existente: xref } | null (cancelado)
export function formularioPersona(o) {
  const capa = document.querySelector('#dialogo');
  capa.hidden = false; document.body.classList.add('con-visor');
  const d = o.datos || {};
  const campo = (id, etiqueta, valor, extra = '') => `<label>${etiqueta}<input id="${id}" value="${esc(valor || '')}" autocomplete="off" ${extra}></label>`;
  const fecha = (id, etiqueta, ged) => `<label>${etiqueta}<input id="${id}" value="${esc(aTexto(ged || ''))}" autocomplete="off" placeholder="1750 · 6 mar 1974 · h. 1750 · antes de 1733 · entre 1700 y 1710"><span class="ged" id="${id}-ged"></span></label>`;
  capa.innerHTML = `<div class="caja dialogo">
    <h2>${esc(o.titulo)}</h2>
    ${o.existente ? `<nav class="pestanas"><button class="pest activa" data-p="nueva">Persona nueva</button><button class="pest" data-p="existe">Elegir una que ya existe</button></nav>` : ''}
    <form id="f-nueva" autocomplete="off">
      <div class="dos">${campo('f-nombre', 'Nombre', d.nombre, 'autofocus')}${campo('f-apellidos', 'Apellidos', d.apellidos)}</div>
      <p class="peq" id="f-propuesta">${d.apellidos && o.propuesta ? 'Apellidos propuestos: ' + esc(o.propuesta) + '. Puedes cambiarlos.' : ''}</p>
      <fieldset class="sexo"><legend>Sexo</legend>
        ${[['M', 'Hombre'], ['F', 'Mujer'], ['U', 'No se sabe']].map(([v, t]) => `<label><input type="radio" name="sexo" value="${v}"${(d.sexo || 'U') === v ? ' checked' : ''}> ${t}</label>`).join('')}</fieldset>
      <div class="dos">${fecha('f-nacf', 'Nacimiento: fecha', d.nac?.fecha)}${campo('f-nacl', 'Nacimiento: lugar', d.nac?.lugar, 'list="lugares"')}</div>
      <div class="dos">${fecha('f-deff', 'Defunción: fecha', d.def?.fecha)}${campo('f-defl', 'Defunción: lugar', d.def?.lugar, 'list="lugares"')}</div>
      <label class="edad">Edad al morir (calcula el año de nacimiento si no lo pones)<input id="f-edad" inputmode="numeric" autocomplete="off"></label>
      ${o.boda ? `<div class="dos">${fecha('f-bodaf', 'Boda: fecha', '')}${campo('f-bodal', 'Boda: lugar', '', 'list="lugares"')}</div>` : ''}
    </form>
    <div id="f-existe" hidden>
      <label>Busca a la persona<input id="f-buscar" autocomplete="off" placeholder="Nombre o apellidos"></label>
      <div id="f-resultados" class="elegir"></div>
    </div>
    <div id="f-avisos" class="avisos"></div>
    <p class="botones"><button id="f-ok" class="principal">Guardar</button> <button id="f-cancelar">Cancelar</button></p>
    <datalist id="lugares">${(o.lugares || []).map(l => `<option value="${esc(l)}">`).join('')}</datalist>
  </div>`;
  const $ = s => capa.querySelector(s);
  let pestana = 'nueva', elegido = null;

  const leer = () => {
    const f = id => aGedcom($(id).value);
    const nac = f('#f-nacf'), def = f('#f-deff'), boda = o.boda ? f('#f-bodaf') : { ged: '' };
    return { nombre: $('#f-nombre').value.trim(), apellidos: $('#f-apellidos').value.trim(), sexo: capa.querySelector('input[name=sexo]:checked')?.value || 'U',
      nac: { fecha: nac.ged || '', lugar: $('#f-nacl').value.trim(), error: nac.error }, def: { fecha: def.ged || '', lugar: $('#f-defl').value.trim(), error: def.error },
      boda: o.boda ? { fecha: boda.ged || '', lugar: $('#f-bodal').value.trim(), error: boda.error } : null };
  };
  const revisar = () => {
    const out = [];
    if (pestana === 'nueva') {
      const x = leer();
      for (const id of ['#f-nacf', '#f-deff', '#f-bodaf']) {
        const e = $(id); if (!e) continue;
        const r = aGedcom(e.value);
        $(id + '-ged').textContent = r.ged ? '→ ' + r.ged : '';
        $(id + '-ged').className = 'ged' + (r.error ? ' mal' : '');
        if (r.error) out.push(r.error);
      }
      if (!x.nombre && !x.apellidos) out.push('Pon al menos el nombre o los apellidos.');
      out.push(...avisos(o.arbol, { nac: x.nac.fecha, def: x.def.fecha, padres: o.contexto?.padres || [], hijos: o.contexto?.hijos || [], conyuges: x.boda?.fecha ? [{ boda: x.boda.fecha }] : [] }));
      const dups = (x.nombre || x.apellidos) ? posiblesDuplicados(o.arbol, clave(`${x.nombre} ${x.apellidos}`), x.nac.fecha, o.excluir || new Set()) : [];
      $('#f-avisos').innerHTML = out.map(t => `<p class="aviso">⚠ ${esc(t)}</p>`).join('')
        + (dups.length && o.existente ? `<p class="aviso">¿Ya está en el árbol? ${dups.map(p => `<button type="button" data-usar="${esc(p.id)}">${esc(nombreCompleto(p))} ${esc(vida(p))}</button>`).join(' ')}</p>` : '')
        + (dups.length && !o.existente ? `<p class="aviso">⚠ Hay alguien con el mismo nombre: ${dups.map(p => esc(nombreCompleto(p) + ' ' + vida(p))).join(', ')}.</p>` : '');
      $('#f-avisos').querySelectorAll('[data-usar]').forEach(b => b.onclick = () => { cambiar('existe'); elegir(b.dataset.usar); });
    } else {
      const p = elegido && o.arbol.p(elegido);
      if (p) out.push(...avisos(o.arbol, { nac: p.nac?.fecha, def: p.def?.fecha, padres: o.contexto?.padres || [], hijos: o.contexto?.hijos || [] }));
      $('#f-avisos').innerHTML = out.map(t => `<p class="aviso">⚠ ${esc(t)}</p>`).join('');
    }
    return out;
  };
  const elegir = id => {
    elegido = id;
    const p = o.arbol.p(id);
    $('#f-buscar').value = nombreCompleto(p);
    $('#f-resultados').innerHTML = `<p class="elegida">Elegida: <b>${esc(nombreCompleto(p))}</b> ${esc(vida(p))} <span class="peq">${esc(id)}</span></p>`;
    revisar();
  };
  const cambiar = p => {
    pestana = p;
    capa.querySelectorAll('[data-p]').forEach(b => b.classList.toggle('activa', b.dataset.p === p));
    $('#f-nueva').hidden = p !== 'nueva'; $('#f-existe').hidden = p !== 'existe';
    if (p === 'existe') $('#f-buscar').focus();
    revisar();
  };
  capa.querySelectorAll('[data-p]').forEach(b => b.onclick = () => cambiar(b.dataset.p));
  capa.querySelectorAll('#f-nueva input').forEach(e => e.addEventListener('input', revisar));
  $('#f-edad').addEventListener('input', () => {
    const edad = parseInt($('#f-edad').value, 10), def = aGedcom($('#f-deff').value).ged;
    if (edad >= 0 && def && !$('#f-nacf').value.trim()) { $('#f-nacf').value = nacimientoPorEdad(def, edad); revisar(); }
  });
  let t;
  $('#f-buscar').addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      elegido = null;
      const r = buscar(o.arbol, $('#f-buscar').value, { variantes: o.variantes, limite: 12 });
      $('#f-resultados').innerHTML = r.lista.filter(p => !(o.excluir || new Set()).has(p.id)).map(p => `<button type="button" data-id="${esc(p.id)}"><b>${esc(nombreCompleto(p))}</b> <span class="peq">${esc(vida(p))}${p.nac?.lugar ? ' · ' + esc(p.nac.lugar) : ''}</span></button>`).join('') || '<p class="peq">Nadie con ese nombre.</p>';
      $('#f-resultados').querySelectorAll('[data-id]').forEach(b => b.onclick = () => elegir(b.dataset.id));
    }, 150);
  });
  revisar();

  return new Promise(ok => {
    const cerrar = v => { capa.hidden = true; capa.innerHTML = ''; document.body.classList.remove('con-visor'); ok(v); };
    $('#f-cancelar').onclick = () => cerrar(null);
    $('#f-nueva').onsubmit = ev => { ev.preventDefault(); $('#f-ok').click(); };
    $('#f-ok').onclick = () => {
      if (pestana === 'existe') { if (!elegido) return alert('Elige una persona de la lista.'); return cerrar({ existente: elegido }); }
      const x = leer();
      const err = [x.nac.error, x.def.error, x.boda?.error].filter(Boolean);
      if (err.length) return alert(err[0]);
      if (!x.nombre && !x.apellidos) return alert('Pon al menos el nombre o los apellidos.');
      const av = revisar().filter(a => !/Pon al menos/.test(a));
      if (av.length && !confirm('Hay avisos:\n\n' + av.join('\n') + '\n\n¿Guardar de todas formas?')) return;
      cerrar({ nueva: x });
    };
  });
}

// ---------- Ventana genérica ----------
function ventana(html) {
  const capa = document.querySelector('#dialogo');
  capa.hidden = false; document.body.classList.add('con-visor');
  capa.innerHTML = `<div class="caja dialogo">${html}</div>`;
  const cerrar = () => { capa.hidden = true; capa.innerHTML = ''; document.body.classList.remove('con-visor'); };
  return { capa, $: s => capa.querySelector(s), cerrar };
}

// ---------- Hecho: bautismo, boda, oficio, residencia… ----------
export const TIPOS_PERSONA = [['BIRT', 'Nacimiento'], ['CHR', 'Bautismo'], ['CONF', 'Confirmación'], ['DEAT', 'Defunción'], ['BURI', 'Entierro'],
  ['OCCU', 'Oficio'], ['RESI', 'Residencia'], ['TITL', 'Título'], ['EDUC', 'Estudios'], ['EMIG', 'Emigración'], ['IMMI', 'Inmigración'],
  ['CENS', 'Padrón'], ['WILL', 'Testamento'], ['PROB', 'Herencia'], ['PROP', 'Bienes'], ['RELI', 'Religión'], ['EVEN', 'Otro hecho']];
export const TIPOS_FAMILIA = [['MARR', 'Matrimonio'], ['MARB', 'Amonestaciones'], ['MARC', 'Capitulaciones'], ['ENGA', 'Esponsales'], ['DIV', 'Divorcio'], ['EVEN', 'Otro hecho']];

// o: { titulo, tipos, datos: {tag, tipo, fecha, lugar, valor, nota}, lugares }
export function formularioHecho(o) {
  const d = o.datos || {};
  const tipos = o.tipos.some(([t]) => t === d.tag) || !d.tag ? o.tipos : [[d.tag, d.tag], ...o.tipos];
  const v = ventana(`<h2>${esc(o.titulo)}</h2>
    <form id="h-form" autocomplete="off">
      <div class="dos"><label>Qué<select id="h-tag">${tipos.map(([t, n]) => `<option value="${t}"${t === (d.tag || tipos[0][0]) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label>Tipo o detalle (opcional)<input id="h-tipo" value="${esc(d.tipo || '')}" placeholder="p. ej. «Padrón de 1827»"></label></div>
      <div class="dos"><label>Fecha<input id="h-fecha" value="${esc(aTexto(d.fecha || ''))}" placeholder="1750 · 6 mar 1974 · h. 1750 · antes de 1733"><span class="ged" id="h-fecha-ged"></span></label>
        <label>Lugar<input id="h-lugar" value="${esc(d.lugar || '')}" list="lugares-h"></label></div>
      <label>Descripción (oficio, título, bienes…)<input id="h-valor" value="${esc(d.valor || '')}"></label>
      <label>Nota<textarea id="h-nota" rows="4">${esc(d.nota || '')}</textarea></label>
    </form>
    <p class="botones"><button id="h-ok" class="principal">Guardar</button> <button id="h-no">Cancelar</button></p>
    <datalist id="lugares-h">${(o.lugares || []).map(l => `<option value="${esc(l)}">`).join('')}</datalist>`);
  const ver = () => { const r = aGedcom(v.$('#h-fecha').value); v.$('#h-fecha-ged').textContent = r.ged ? '→ ' + r.ged : r.error || ''; v.$('#h-fecha-ged').className = 'ged' + (r.error ? ' mal' : ''); };
  v.$('#h-fecha').addEventListener('input', ver); ver();
  return new Promise(ok => {
    v.$('#h-no').onclick = () => { v.cerrar(); ok(null); };
    v.$('#h-form').onsubmit = ev => { ev.preventDefault(); v.$('#h-ok').click(); };
    v.$('#h-ok').onclick = () => {
      const f = aGedcom(v.$('#h-fecha').value);
      if (f.error) return alert(f.error);
      const r = { tag: v.$('#h-tag').value, tipo: v.$('#h-tipo').value.trim(), fecha: f.ged || '', lugar: v.$('#h-lugar').value.trim(), valor: v.$('#h-valor').value.trim(), nota: v.$('#h-nota').value };
      v.cerrar(); ok(r);
    };
  });
}

// ---------- Nota ----------
export function formularioNota(titulo, texto = '') {
  const v = ventana(`<h2>${esc(titulo)}</h2><label>Texto<textarea id="n-texto" rows="12">${esc(texto)}</textarea></label>
    <p class="botones"><button id="n-ok" class="principal">Guardar</button> <button id="n-no">Cancelar</button></p>`);
  v.$('#n-texto').focus();
  return new Promise(ok => {
    v.$('#n-no').onclick = () => { v.cerrar(); ok(null); };
    v.$('#n-ok').onclick = () => { const t = v.$('#n-texto').value; if (!t.trim()) return alert('La nota está vacía.'); v.cerrar(); ok(t); };
  });
}

// ---------- Fusionar dos fichas ----------
// Devuelve { otro, usar: {nombre, sexo, nac, def} } o null
export function formularioFusion(arbol, aId, variantes, otroId = null) {
  const a = arbol.p(aId);
  const v = ventana(`<h2>Fusionar a ${esc(nombreCompleto(a))} con otra ficha</h2>
    <p class="peq">Elige la otra ficha de la misma persona. Se queda esta (${esc(aId)}); lo de la otra pasa a esta sin perder nada.</p>
    <label>Busca la otra ficha<input id="u-buscar" autocomplete="off" value="${esc([a.nombre, a.apellidos].join(' '))}"></label>
    <div id="u-res" class="elegir"></div><div id="u-previa"></div>
    <p class="botones"><button id="u-ok" class="principal" disabled>Fusionar</button> <button id="u-no">Cancelar</button></p>`);
  const SEXO = { M: 'Hombre', F: 'Mujer', U: '?' };
  const nombres = ids => ids.map(x => arbol.p(x)).filter(Boolean).map(nombreCompleto).join(', ') || '—';
  const fila = (campo, etiqueta, va, vb) => `<tr><th>${etiqueta}</th>
    <td><label><input type="radio" name="${campo}" value="a"${va || !vb ? ' checked' : ''}> ${esc(va || '—')}</label></td>
    <td><label><input type="radio" name="${campo}" value="b"${!va && vb ? ' checked' : ''}> ${esc(vb || '—')}</label></td></tr>`;
  const info = (etiqueta, va, vb) => `<tr><th>${etiqueta}</th><td>${esc(va)}</td><td>${esc(vb)}</td></tr>`;
  const ev = e => e ? [aTexto(e.fecha), e.lugar].filter(Boolean).join(' · ') : '';
  let otro = null;
  const elegir = id => {
    otro = id; const b = arbol.p(id);
    const padres = p => p.famc.map(f => arbol.f(f)).filter(Boolean).flatMap(f => [f.marido, f.mujer]).filter(Boolean);
    const conyuges = p => p.fams.map(f => arbol.f(f)).filter(Boolean).map(f => f.marido === p.id ? f.mujer : f.marido).filter(Boolean);
    const hijosDe = p => p.fams.flatMap(f => arbol.f(f)?.hijos || []);
    v.$('#u-res').innerHTML = '';
    v.$('#u-buscar').value = nombreCompleto(b);
    v.$('#u-previa').innerHTML = `<table class="fusion"><tr><th></th><th>Esta (${esc(aId)})</th><th>La otra (${esc(id)})</th></tr>
      ${fila('nombre', 'Nombre', nombreCompleto(a), nombreCompleto(b))}${fila('sexo', 'Sexo', SEXO[a.sexo], SEXO[b.sexo])}
      ${fila('nac', 'Nacimiento', ev(a.nac), ev(b.nac))}${fila('def', 'Defunción', ev(a.def), ev(b.def))}
      ${info('Padres', nombres(padres(a)), nombres(padres(b)))}${info('Cónyuges', nombres(conyuges(a)), nombres(conyuges(b)))}
      ${info('Hijos', nombres(hijosDe(a)), nombres(hijosDe(b)))}</table>
      <p class="peq">Lo que no elijas no se pierde: el otro nombre queda como nombre alternativo y la otra fecha como segundo nacimiento o defunción.
      Los padres, cónyuges, hijos, hechos, notas, fuentes y fotos de la otra ficha pasan a esta. Se puede deshacer.</p>`;
    v.$('#u-ok').disabled = false;
  };
  let t;
  const buscarOtra = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      otro = null; v.$('#u-ok').disabled = true; v.$('#u-previa').innerHTML = '';
      const r = buscar(arbol, v.$('#u-buscar').value, { variantes, limite: 15 });
      v.$('#u-res').innerHTML = r.lista.filter(p => p.id !== aId).map(p => `<button type="button" data-id="${esc(p.id)}"><b>${esc(nombreCompleto(p))}</b> <span class="peq">${esc(vida(p))}${p.nac?.lugar ? ' · ' + esc(p.nac.lugar) : ''} · ${esc(p.id)}</span></button>`).join('') || '<p class="peq">Nadie con ese nombre.</p>';
      v.$('#u-res').querySelectorAll('[data-id]').forEach(b => b.onclick = () => elegir(b.dataset.id));
    }, 150);
  };
  v.$('#u-buscar').addEventListener('input', buscarOtra);
  if (otroId) elegir(otroId); else buscarOtra();
  return new Promise(ok => {
    v.$('#u-no').onclick = () => { v.cerrar(); ok(null); };
    v.$('#u-ok').onclick = () => {
      if (!otro) return;
      const usar = Object.fromEntries(['nombre', 'sexo', 'nac', 'def'].map(c => [c, v.capa.querySelector(`input[name=${c}]:checked`)?.value || 'a']));
      v.cerrar(); ok({ otro, usar });
    };
  });
}
