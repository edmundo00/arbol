// Formulario de persona: nueva o elegida entre las que ya existen, con fechas en español y avisos de imposibles.
import { esc } from './md.js?v=202611062128';
import { aGedcom, aTexto, avisos, posiblesDuplicados, nacimientoPorEdad } from './fechas.js?v=202611062128';
import { buscar } from './buscar.js?v=202611062128';
import { clave } from './buscar.js?v=202611062128';
import { nombreCompleto, vida } from './modelo.js?v=202611062128';

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

// ---------- Citar un documento ----------
// o: { titulo, docs: [{id, titulo}] (para elegir) o doc: {id?, titulo} (fijo), familia: [{id, titulo, quien, papel, que, grado}] (salen los primeros y
// al elegirlos rellenan el cuadro), datos: {papel, que, imagenes, grado}, grados }
export function formularioCita(o) {
  const d = o.datos || {}, familia = o.familia || [];
  const todos = o.doc ? [] : o.docs, cuenta = new Map();
  for (const x of todos) cuenta.set(x.clase || 'Otro', (cuenta.get(x.clase || 'Otro') || 0) + 1);
  const clases = [...cuenta].sort((a, b) => b[1] - a[1]);
  const sitios = [...new Set(todos.map(x => x.sitio).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const v = ventana(`<h2>${esc(o.titulo)}</h2>
    ${o.doc ? `<p><b>Documento:</b> ${esc(o.doc.titulo)}</p>` : `<label>Documento del registro<input id="c-buscar" autocomplete="off" placeholder="Parte del título, o de quién es: mujer, hijo, testamento…"></label>
      <div class="filtros-cita">
        <label>Tipo<select id="c-tipo"><option value="">Todos</option>${clases.map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join('')}</select></label>
        <label>Desde<input id="c-desde" inputmode="numeric" maxlength="4" placeholder="año"></label>
        <label>Hasta<input id="c-hasta" inputmode="numeric" maxlength="4" placeholder="año"></label>
        <label>Archivo o lugar<input id="c-lugar" list="c-sitios" autocomplete="off" placeholder="Xubia, Mondoñedo…"><datalist id="c-sitios">${sitios.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
        <label>Orden<select id="c-orden"><option value="">Familia primero</option><option value="fecha">Por fecha</option></select></label>
      </div>
      ${o.vida ? `<label class="check-cita"><input type="checkbox" id="c-vida" checked> Solo en su vida (${esc(o.vida.texto)})</label>` : '<p class="peq">Sin fechas suyas ni de su familia: no se puede filtrar por su vida.</p>'}
      <div id="c-res" class="elegir"></div><p id="c-elegido" class="elegida"></p>`}
    ${o.mostrarDoc ? `<p id="c-verp"${o.doc?.id ? '' : ' hidden'}><button type="button" id="c-ver" class="mas">Ver el documento</button></p><div id="c-doc" class="doc-cita" hidden></div>` : ''}
    <div class="dos"><label>Papel en el documento (opcional)<input id="c-papel" value="${esc(d.papel || '')}" placeholder="bautizado, padre, testigo, otorgante…"></label>
      <label>Grado<select id="c-grado">${o.grados.map(([g, t]) => `<option value="${g}"${g === (d.grado || 'A') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>
    <label>Qué prueba (opcional)<input id="c-que" value="${esc(d.que || '')}" placeholder="«Bautizado el 9-XI-1614, hijo de Abraham y Johanna»"></label>
    <label>Fotos donde aparece (números; vacío = todo el documento)<input id="c-img" value="${esc(d.imagenes || '')}" placeholder="1,3-5"></label>
        <p class="botones"><button id="c-ok" class="principal">Guardar</button> <button id="c-no">Cancelar</button></p>`);
  let elegido = o.doc || null;
  const cerrarVisor = () => { const c = v.$('#c-doc'); if (c) { c.hidden = true; c.innerHTML = ''; } };
  if (o.mostrarDoc) v.$('#c-ver').onclick = () => {
    const c = v.$('#c-doc');
    if (!c.hidden) return cerrarVisor();
    c.hidden = false; o.mostrarDoc(elegido.id, c);
  };
  if (!o.doc) {
    // Lo propuesto se puede cambiar. Si después se elige otro documento se sustituye, salvo lo que se haya escrito a mano.
    const auto = { papel: d.papel || '', que: d.que || '', grado: d.grado || 'A' };
    const rellenar = x => {
      for (const [k, sel] of [['papel', '#c-papel'], ['que', '#c-que']]) {
        const c = v.$(sel);
        if (c.value.trim() === auto[k].trim()) c.value = auto[k] = x[k] || '';
      }
      const g = v.$('#c-grado');
      if (g.value === auto.grado) g.value = auto.grado = x.grado || d.grado || 'A';
    };
    const deFamilia = new Set(familia.map(x => x.id));
    const anio = s => { const n = parseInt(v.$(s).value, 10); return n >= 1000 && n <= 2100 ? n : null; };   // hasta tener los 4 números no filtra
    const conVida = () => !!o.vida && v.$('#c-vida').checked;
    const fueraDeVida = x => o.vida && x.anios && (x.anios.b < o.vida.desde || x.anios.a > o.vida.hasta);
    const porFecha = l => [...l].sort((a, b) => (a.anios?.a ?? 9999) - (b.anios?.a ?? 9999));
    const pintar = () => {
      const ws = plano(v.$('#c-buscar').value).split(/\s+/).filter(Boolean);   // todas las palabras, en cualquier orden
      const tipo = v.$('#c-tipo').value, lugar = planoLugar(v.$('#c-lugar').value.trim()), desde = anio('#c-desde'), hasta = anio('#c-hasta');
      const cumple = x => {
        const t = plano(x.titulo + ' ' + x.id + ' ' + (x.quien || ''));
        return ws.every(w => t.includes(w)) && (!tipo || x.clase === tipo) && (!lugar || planoLugar(x.lugar).includes(lugar));
      };
      // Las fechas no esconden lo que no tiene fecha: va en su grupo. Lo que queda fuera de los años se cuenta y se dice.
      let fuera = 0;
      const enFechas = x => {
        if (!x.anios) return true;
        if ((desde != null && x.anios.b < desde) || (hasta != null && x.anios.a > hasta) || (conVida() && fueraDeVida(x))) { fuera++; return false; }
        return true;
      };
      const hayFiltro = tipo || lugar || desde != null || hasta != null;
      const orden = v.$('#c-orden').value === 'fecha' ? porFecha : l => l;
      const fam = orden(familia.filter(x => cumple(x) && enFechas(x)));
      const resto = ws.length || hayFiltro ? orden(todos.filter(x => !deFamilia.has(x.id) && cumple(x) && enFechas(x))) : [];
      const conFecha = resto.filter(x => x.anios), sinFecha = resto.filter(x => !x.anios);
      const otros = conFecha.slice(0, 40), sinF = sinFecha.slice(0, 20), l = [...fam, ...otros, ...sinF];
      const fila = (x, i) => `<button type="button" data-i="${i}"><b>${esc(x.titulo)}</b> <span class="peq">${esc(x.quien || x.id)}</span></button>`;
      const grupo = (tit, lista, total, base) => lista.length ? `<p class="peq elegir-tit">${tit}${total > lista.length ? ` (${lista.length} de ${total}: escribe otra palabra para acotar)` : ` (${total})`}</p>` + lista.map((x, i) => fila(x, base + i)).join('') : '';
      v.$('#c-res').innerHTML = (grupo('De su familia', fam, fam.length, 0) + grupo('Otros documentos', otros, conFecha.length, fam.length) + grupo('Sin fecha: no se puede saber si encajan', sinF, sinFecha.length, fam.length + otros.length)
        || (ws.length || hayFiltro ? '<p class="peq">Ningún documento con eso.</p>' : '<p class="peq">Nada de su familia. Escribe parte del título o usa los filtros.</p>'))
        + (fuera ? `<p class="peq elegir-tit">No salen ${fuera} por sus fechas.${conVida() ? ' Quita «Solo en su vida» para verlos.' : ''}</p>` : '');
      v.$('#c-res').querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
        elegido = l[+b.dataset.i];
        v.$('#c-elegido').textContent = 'Elegido: ' + elegido.titulo + (fueraDeVida(elegido) ? ` ⚠ No cuadra por fechas: el documento es de ${elegido.anios.a === elegido.anios.b ? elegido.anios.a : elegido.anios.a + '–' + elegido.anios.b} y esta persona, ${o.vida.texto}.` : '');
        v.$('#c-res').innerHTML = ''; rellenar(elegido); cerrarVisor();
        if (o.mostrarDoc) v.$('#c-verp').hidden = false;
      });
    };
    for (const s of ['#c-buscar', '#c-desde', '#c-hasta', '#c-lugar']) v.$(s).addEventListener('input', pintar);
    for (const s of ['#c-tipo', '#c-orden', '#c-vida']) v.$(s)?.addEventListener('change', pintar);
    pintar(); v.$('#c-buscar').focus();
  }
  return new Promise(ok => {
    v.$('#c-no').onclick = () => { v.cerrar(); ok(null); };
    v.$('#c-ok').onclick = () => {
      if (!elegido) return alert('Elige el documento.');
      const r = { doc: elegido, papel: v.$('#c-papel').value.trim(), que: v.$('#c-que').value.trim(), imagenes: v.$('#c-img').value.trim(), grado: v.$('#c-grado').value };
      if (r.imagenes && !/^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/.test(r.imagenes)) return alert('Las fotos se ponen con números: «1,3-5».');
      v.cerrar(); ok(r);
    };
  });
}
const plano = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// En los lugares, Xubia y Jubia son lo mismo
const planoLugar = t => plano(t).replace(/x/g, 'j');

// ---------- Añadir un documento nuevo a partir de sus fotos ----------
// o: { fotos: [rutas], transcripciones: [rutas], persona: nombre o null, grados, datos: {titulo, fecha, tipo, archivo} }
export const TIPOS_DOCUMENTO = ['bautismo', 'matrimonio', 'defunción', 'testamento', 'partición', 'escritura', 'pleito', 'hidalguía', 'padrón', 'catastro', 'prensa', 'otro'];
export function formularioDocumento(o) {
  const d = o.datos || {};
  const v = ventana(`<h2>Añadir documento${o.persona ? ' a ' + esc(o.persona) : ''}</h2>
    <p class="peq">${o.fotos.length === 1 ? '1 foto' : o.fotos.length + ' fotos'}: ${esc(o.fotos[0].split('/').slice(-2).join('/'))}${o.fotos.length > 1 ? ' …' : ''}<br>${o.transcripciones.length ? `✔ Con su transcripción (${o.transcripciones.length})` : 'Sin transcripción al lado'}</p>
    <label>Título<input id="d-titulo" value="${esc(d.titulo || '')}"></label>
    <div class="dos"><label>Fecha<input id="d-fecha" value="${esc(d.fecha || '')}" placeholder="1734-07-04 · 1734"></label>
      <label>Tipo<select id="d-tipo">${TIPOS_DOCUMENTO.map(t => `<option${t === d.tipo ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>
    <label>Archivo que lo guarda<input id="d-archivo" value="${esc(d.archivo || '')}"></label>
    ${o.persona ? `<div class="dos"><label>Su papel (opcional)<input id="c-papel" placeholder="difunta, padre, testigo…"></label>
      <label>Grado<select id="c-grado">${o.grados.map(([g, t]) => `<option value="${g}">${esc(t)}</option>`).join('')}</select></label></div>
      <label>Qué prueba (opcional)<input id="c-que" placeholder="«Enterrada el 4-VII-1734, viuda de Antón Romeu»"></label>`
    : '<p class="peq">Queda guardado sin persona. Lo podrás citar cuando sepas de quién es.</p>'}
    <p class="botones"><button id="d-ok" class="principal">Guardar</button> <button id="d-no">Cancelar</button></p>`);
  v.$('#d-titulo').focus();
  return new Promise(ok => {
    v.$('#d-no').onclick = () => { v.cerrar(); ok(null); };
    v.$('#d-ok').onclick = () => {
      const r = { titulo: v.$('#d-titulo').value.trim(), fecha: v.$('#d-fecha').value.trim(), tipo: v.$('#d-tipo').value, archivo: v.$('#d-archivo').value.trim() };
      if (!r.titulo) return alert('Pon un título.');
      if (o.persona) {
        Object.assign(r, { papel: v.$('#c-papel').value.trim(), que: v.$('#c-que').value.trim(), grado: v.$('#c-grado').value, imagenes: '' });
      }
      v.cerrar(); ok(r);
    };
  });
}
