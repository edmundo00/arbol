// Visor de documentos: la foto y su transcripción, para ver, corregir y revisar. UN SOLO VISOR para las dos páginas:
//   - la aplicación del árbol (js/app.js), al abrir una foto o un texto;
//   - 9 Sistema/Herramientas/REVISAR TRANSCRIPCIONES.html, que le añade la lista de lo que queda por revisar.
// Es un script normal, sin «import» ni «export», porque el revisor se abre con doble clic (file://) y ahí el navegador no
// deja cargar módulos. Los módulos de la aplicación lo cargan con «import {} from './visordoc.js?v=202611071004'» y lo usan por VisorDoc.
//
// Qué guarda: el .md (o .txt) de la transcripción, junto a su foto. Antes de cambiar un texto hace copia y apunta el cambio en un
// registro: en este proyecto, 9 Sistema/Control/registro/revisiones(.csv); en otra carpeta, «Copias de transcripciones». No toca el GEDCOM ni las fotos.
//
// Una página que se le da a abrir():
//   { titulo, ruta, nombre, clave,        lo que se ve arriba; clave: con qué se recuerda el giro de esa foto
//     foto: url | ()=>Promise<url> | null, form,   sin foto, el texto ocupa todo
//     sinFoto(caja, error),               qué decir si la foto no se puede abrir
//     hermanas: [{valor, etiqueta}], actual,   las páginas del mismo documento
//     gente: [{nombre, titulo, href}],    personas del documento
//     versiones: [v] | ()=>Promise<[v]>,  sus transcripciones; v: { etiqueta, ruta, partes, raiz, asa: asa | ()=>Promise<asa>, leer() }
//     nueva: ()=>Promise<v>,              dónde crearla si no la hay; v lleva además { fotoNombre, cab: {archivo, ...} }
//     sinTexto(caja),                     qué decir si no hay transcripción ni forma de crearla
//     previo: {clase, dudas, ileg, pal, conf, rev},   lo ya medido, hasta que se lee el texto
//     medida, avisos }                    fiabilidad medida y posibles errores detectados, si los hay
(function () {
  'use strict';
  if (globalThis.VisorDoc) return;

  /* ===== Markdown sencillo (títulos, citas, listas, tablas, negritas, encabezado YAML) ===== */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function enLinea(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  function md(texto) {
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

  /* ===== Utilidades ===== */
  const local = {
    leer(k, def) { try { const v = localStorage.getItem('revisor.' + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
    poner(k, v) { try { localStorage.setItem('revisor.' + k, JSON.stringify(v)); } catch {} },
    quitar(k) { try { localStorage.removeItem('revisor.' + k); } catch {} },
  };
  const num = n => Number(n).toLocaleString('es-ES', { useGrouping: 'always' });
  const dosd = n => String(n).padStart(2, '0');
  const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${dosd(d.getMonth() + 1)}-${dosd(d.getDate())}`; };
  const yamlLee = (h, k) => { const m = new RegExp('^' + k + ':[ \\t]*(.*)$', 'm').exec(h || ''); return m ? m[1].trim().replace(/^"(.*)"$/, '$1') : ''; };
  const yamlPon = (h, k, v) => { const re = new RegExp('^' + k + ':.*$', 'm'), lin = k + ': ' + v; return re.test(h) ? h.replace(re, () => lin) : (h ? h.replace(/\s*$/, '') + '\n' : '') + lin; };
  const yamlQuita = (h, k) => h.replace(new RegExp('^' + k + ':.*\\n?', 'm'), '').replace(/\n$/, '');
  const revisadoEn = h => /^(true|s[ií])\b/i.test(yamlLee(h, 'revisado'));
  const afectaEn = h => /^true\b/i.test(yamlLee(h, 'afecta_arbol'));
  const confDe = h => ['alta', 'media', 'baja'].find(x => yamlLee(h, 'confianza').toLowerCase().startsWith(x)) || '';
  const csvCampo = s => { s = String(s ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"' : s; };
  const colorFia = p => p >= 85 ? 'var(--vd-ok)' : p >= 65 ? 'var(--vd-aviso)' : 'var(--vd-mal)';

  /* ===== Fiabilidad: la misma cuenta que cola_revision.py ===== */
  const BASE = { alta: 92, media: 90, baja: 65 };
  function medirTexto(cuerpo) {
    const antes = cuerpo.split(/^(?:#+ *|\*\*)(?:Extracto|Dudas)/mi)[0];
    const lin = antes.split('\n').filter(l => l.trim() && !/^\s*[#>]/.test(l)).join(' ');
    return { clase: lin.length > 120 ? 'L' : 'E', dudas: (antes.match(/\[[^\]\n]*\?\]/g) || []).length, ileg: (antes.match(/\[ilegible/gi) || []).length, pal: lin.split(/\s+/).filter(Boolean).length };
  }
  function fiabilidad(conf, clase, dudas, ileg, pal) {
    const base = (BASE[conf] ?? 80) - (clase === 'E' ? 20 : 0);
    return Math.round(base * (1 - Math.min(.9, (ileg + .5 * dudas) / Math.max(pal, 1))));
  }

  /* ===== Dónde sale un nombre en el texto, con las grafías de la época =====
     «Luis Ponce de León» encuentra «Luis Ponze de Leon» y «Cathalina F[ernande]z» a «Catalina Fernández», aunque el nombre parta de línea.
     nivel 1: el nombre (nombre y al menos un apellido); nivel 2: solo los apellidos; nivel 3: solo el nombre de pila; 0: no sale. */
  function claveNombre(w) {
    return w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ch/g, '§').replace(/ph/g, 'f').replace(/h/g, '').replace(/§/g, 'ch')
      .replace(/[vw]/g, 'b').replace(/ll/g, 'i').replace(/y/g, 'i').replace(/z/g, 's').replace(/c([ei])/g, 's$1').replace(/g([ei])/g, 'j$1').replace(/x/g, 'j')
      .replace(/(.)\1+/g, '$1').replace(/^josef$/, 'jose');
  }
  const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'lo', 'los', 'da', 'do', 'das', 'dos', 'd', 'i', 'e']);
  const TITULOS = new Set(['frai', 'fr', 'don', 'dona', 'sor', 'lisensiado', 'lisdo', 'bachiler', 'doctor', 'dr']);
  const CORTAN = new Set(['i', 'e', 'ijo', 'ija', 'con', 'mujer', 'marido', 'padre', 'madre', 'biuda', 'esposo', 'esposa']);
  function parecidas(a, b) {
    if (a === b) return true;
    if (a[0] !== b[0] || Math.min(a.length, b.length) < 6 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, dif = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++dif > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return dif + (a.length - i) + (b.length - j) <= 1;
  }
  function palabrasDe(texto) {
    const re = /\[[^\]\n]*\?\]|\[ilegible[^\]\n]*\]|((?:\p{L}|\[\p{L}+\])+(?:-\n(?:\p{L}|\[\p{L}+\])+)*)/giu, out = [];
    let m;
    while ((m = re.exec(texto))) if (m[1]) out.push({ a: m.index, b: m.index + m[1].length, k: claveNombre(m[1].replace(/[\[\]]|-\n/g, '')) });
    return out;
  }
  function buscarNombre(texto, nombre, pal = palabrasDe(texto)) {
    const todas = (nombre.match(/\p{L}+/gu) || []).map(claveNombre);
    const claves = todas.filter(k => !PARTICULAS.has(k) && !TITULOS.has(k));   // «Fray Benito de Escobar» puede salir como «Benito de Escobar»
    if (!claves.length) return { rangos: [], nivel: 0 };
    const cortan = k => CORTAN.has(k) && !todas.includes(k);
    const secuencia = (qs, minimo) => {
      const out = [];
      for (let s = 0; s < pal.length; s++) {
        if (!parecidas(pal[s].k, qs[0])) continue;
        let q = 1, hallados = 1, fin = s, ajenas = 0;
        for (let t = s + 1; t < pal.length && q < qs.length && ajenas <= 2; t++) {
          const k = pal[t].k;
          if (/\n\s*\n/.test(texto.slice(pal[t - 1].b, pal[t].a))) break;
          const nq = qs.findIndex((x, n) => n >= q && parecidas(k, x));
          if (nq >= 0) { q = nq + 1; hallados++; fin = t; ajenas = 0; continue; }
          if (cortan(k)) break;
          if (!PARTICULAS.has(k)) ajenas++;
        }
        if (hallados >= minimo) { out.push([pal[s].a, pal[fin].b]); s = fin; }
      }
      return out;
    };
    if (claves.length === 1) { const r = secuencia(claves, 1); return { rangos: r, nivel: r.length ? 1 : 0 }; }
    let r = secuencia(claves, 2);
    if (r.length) return { rangos: r, nivel: 1 };
    const apellidos = claves.slice(1);
    r = secuencia(apellidos, apellidos.length);
    if (r.length) return { rangos: r, nivel: 2 };
    r = secuencia([claves[0]], 1);
    return { rangos: r, nivel: r.length ? 3 : 0 };
  }
  // Marcas en el texto antes de pasarlo a HTML: caracteres privados que luego se cambian por <mark>
  function conMarcas(t, rangos, actual) {
    let s = t;
    for (let k = rangos.length - 1; k >= 0; k--) { const [a, b] = rangos[k]; s = s.slice(0, a) + (k === actual ? '' : '') + s.slice(a, b) + '' + s.slice(b); }
    return s;
  }
  const marcasHtml = h => h.replace(//g, '<mark class="p">').replace(//g, '<mark class="p act">').replace(//g, '</mark>');
  // Las personas del encabezado: «personas: [a, b]» o una lista debajo con guiones
  function personasDelEncabezado(h) {
    const una = yamlLee(h, 'personas').replace(/^\[|\]$/g, '').split(',');
    const lista = /^personas:[ \t]*\n((?:[ \t]*-[ \t].*\n?)+)/m.exec(h || '');
    return [...una, ...(lista ? lista[1].split('\n').map(l => l.replace(/^\s*-\s*/, '')) : [])].map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }

  /* ===== Disco ===== */
  async function dirDe(raiz, partes, crear = false) { let d = raiz; for (const p of partes) d = await d.getDirectoryHandle(p, { create: crear }); return d; }
  async function archivoEn(raiz, partes, crear = false) { return (await dirDe(raiz, partes.slice(0, -1), crear)).getFileHandle(partes[partes.length - 1], { create: crear }); }
  async function escribir(asa, texto) { const w = await asa.createWritable(); await w.write(texto); await w.close(); }
  // File.text() quita el BOM sin avisar; aquí se conserva, para poder escribir el archivo igual que estaba.
  // Si no es UTF-8 (un .txt antiguo), se lee como Latin-1 y se avisa: guardarlo lo estropearía.
  async function leerBruto(fi) {
    const b = await fi.arrayBuffer();
    try { return { texto: new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }).decode(b), utf8: true }; }
    catch { return { texto: new TextDecoder('windows-1252').decode(b), utf8: false }; }
  }
  async function hayDir(raiz, partes) { try { await dirDe(raiz, partes); return true; } catch { return false; } }
  // Dónde van las copias y el registro: si la carpeta elegida contiene el proyecto, en su 9 Sistema/Control/registro.
  // k: cuántos trozos de la ruta van antes de la raíz del proyecto (la carpeta elegida puede ser toda la de Dropbox).
  async function proyecto(raiz, partes) {
    for (let k = 0; k < Math.min(partes.length, 4); k++)
      if (await hayDir(raiz, [...partes.slice(0, k), '9 Sistema', 'Control', 'registro']))
        return { k, base: [...partes.slice(0, k)], copias: ['9 Sistema', 'Control', 'registro', 'revisiones'], registro: ['9 Sistema', 'Control', 'registro', 'revisiones.csv'] };
    return { k: 0, base: [], copias: ['Copias de transcripciones'], registro: ['Copias de transcripciones', 'revisiones.csv'] };
  }
  async function apuntarRegistro(raiz, partes, campos) {
    const asa = await archivoEn(raiz, partes, true), f = await asa.getFile();
    const w = await asa.createWritable({ keepExistingData: true }); await w.seek(f.size);
    await w.write((f.size ? '' : '﻿fecha;md;accion;texto_cambiado;copia;nota\r\n') + campos.map(csvCampo).join(';') + '\r\n'); await w.close();
  }
  async function pedirEscritura(raiz) {
    if (await raiz.queryPermission({ mode: 'readwrite' }) === 'granted') return;
    if (await raiz.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error(`El navegador no ha dado permiso para guardar en la carpeta «${raiz.name}». Vuelve a pulsar Guardar y elige «Permitir».`);
  }

  /* ===== Aspecto ===== */
  const CSS = `
.vd{--vd-fondo:#efe8da;--vd-papel:#fbf6ea;--vd-papel2:#f4ecdc;--vd-tinta:#2b2118;--vd-suave:#75654f;--vd-linea:#d9cbb1;--vd-acento:#8a2f12;--vd-acento-t:#fff8ee;
  --vd-marca-p:#bfe6b4;--vd-marca-pf:#7fce6f;--vd-ok:#2f6b3f;--vd-aviso:#a86a00;--vd-mal:#b3261e;--vd-marca-i:#f6c8c2;--vd-marca-d:#f7e0a0;--vd-marca-a:#dde6f4;--vd-marg:#6b5a8c;--vd-tit:#8a2f12;
  display:grid;grid-template-rows:auto 1fr;height:100%;width:100%;min-height:0;flex:1;background:var(--vd-fondo);color:var(--vd-tinta);font:14px/1.4 system-ui,"Segoe UI",sans-serif;text-align:left}
@media (prefers-color-scheme: dark){.vd{--vd-fondo:#17130f;--vd-papel:#231d17;--vd-papel2:#2c251d;--vd-tinta:#efe5d3;--vd-suave:#b0a08a;--vd-linea:#463b2f;--vd-acento:#f0a77e;--vd-acento-t:#2b1409;
  --vd-marca-p:#28552a;--vd-marca-pf:#3d8a40;--vd-ok:#7fc48f;--vd-aviso:#e8b95a;--vd-mal:#f0897f;--vd-marca-i:#6b2a24;--vd-marca-d:#5f4a14;--vd-marca-a:#2c3a50;--vd-marg:#b9a6e0;--vd-tit:#f0a77e}}
.vd *,.vd *::before{box-sizing:border-box}
.vd button,.vd select,.vd input{font:inherit;color:inherit;width:auto;margin:0}
.vd button{cursor:pointer;background:var(--vd-papel2);border:1px solid var(--vd-linea);border-radius:7px;padding:5px 10px;min-height:30px;height:auto;min-width:0;box-shadow:none}
.vd button:hover{border-color:var(--vd-acento);background:var(--vd-papel2)}
.vd button:focus-visible,.vd select:focus-visible,.vd input:focus-visible{outline:2px solid var(--vd-acento);outline-offset:1px}
.vd button:disabled{opacity:.45;cursor:default}
.vd button.vd-prim{background:var(--vd-acento);border-color:var(--vd-acento);color:var(--vd-acento-t);font-weight:600}
.vd select,.vd input[type=text],.vd input[type=search]{background:var(--vd-papel);border:1px solid var(--vd-linea);border-radius:7px;padding:5px 8px;min-height:30px;min-width:0}
.vd kbd{font:12px ui-monospace,Consolas,monospace;background:var(--vd-papel2);border:1px solid var(--vd-linea);border-radius:4px;padding:0 5px}

.vd-barra{display:flex;align-items:center;gap:10px;padding:6px 10px;background:#241b13;color:#f3e6d0;min-width:0}
.vd .vd-barra button,.vd .vd-barra select{background:#3a2c20;border-color:#54432f;color:#f3e6d0}
.vd .vd-barra button:hover{border-color:#f0c98a;background:#3a2c20}
.vd-ranura{display:flex;align-items:center;gap:10px;flex:none}
.vd-ranura:empty{display:none}
.vd-tituloBarra{flex:1;min-width:0}
.vd-tituloBarra b{display:block;font:600 15px/1.25 Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vd-tituloBarra span{display:block;font-size:12px;color:#c8b698;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vd-barra a{color:#f0c98a;font-size:13px}
.vd .vd-paginaDoc{max-width:150px}

.vd-area{display:grid;grid-template-columns:minmax(240px,var(--vd-ancho,70%)) 7px minmax(320px,1fr);min-height:0}
.vd.vd-soloTexto .vd-area{grid-template-columns:1fr}
.vd.vd-soloTexto .vd-visor,.vd.vd-soloTexto .vd-separador{display:none}
.vd-separador{background:#2e241a;cursor:col-resize;position:relative;touch-action:none}
.vd-separador:hover,.vd-separador.activo{background:var(--vd-acento)}
.vd-separador::after{content:"";position:absolute;left:2px;top:50%;width:3px;height:36px;margin-top:-18px;border-radius:2px;background:#8c7a60}

.vd-visor{position:relative;background:#14110d;min-width:0;min-height:0;overflow:hidden}
.vd-lienzo{position:absolute;inset:0;overflow:scroll;display:flex;cursor:grab;scrollbar-color:#5b4c3a #1d1812;scrollbar-width:thin;touch-action:pan-x pan-y;background:none}
.vd-lienzo.moviendo{cursor:grabbing;user-select:none}
.vd-hoja{position:relative;flex:none;margin:auto}
.vd-img{position:absolute;left:50%;top:50%;max-width:none;display:block;user-select:none;-webkit-user-drag:none;transform-origin:center}
.vd-faltaImagen{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;gap:10px;color:#d8c7ab;padding:30px;text-align:center}
.vd-faltaImagen p{color:#d8c7ab;margin:0;max-width:440px}
.vd-faltaImagen a{color:#f0c98a}
.vd-faltaImagen iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}
.vd-nombreFoto{position:absolute;left:10px;top:8px;font-size:12px;color:#e8dcc6;background:rgba(20,16,12,.72);padding:3px 8px;border-radius:6px;max-width:70%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
.vd-herr{position:absolute;left:10px;right:160px;bottom:14px;margin:0 auto;width:fit-content;display:flex;gap:3px;align-items:center;padding:5px;border-radius:12px;background:rgba(32,25,18,.9);border:1px solid #54432f;box-shadow:0 6px 22px rgba(0,0,0,.45);color:#f3e6d0;flex-wrap:wrap;justify-content:center}
.vd .vd-herr button{background:transparent;border:1px solid transparent;color:#f3e6d0;min-width:32px;padding:3px 8px}
.vd .vd-herr button:hover{background:#3d2f22}
.vd .vd-herr button.activo{background:#6a3a1d;border-color:#b07a4c}
.vd-herr .sep{width:1px;height:20px;background:#54432f;margin:0 3px}
.vd-zoomTxt{min-width:52px;text-align:center;font-variant-numeric:tabular-nums;font-size:13px}
.vd-herr a{color:#f0c98a;padding:0 6px;font-size:13px}
.vd-ajustes{position:absolute;right:12px;top:40px;width:270px;padding:12px;border-radius:12px;background:rgba(32,25,18,.96);border:1px solid #54432f;color:#f3e6d0;display:none;box-shadow:0 6px 22px rgba(0,0,0,.45)}
.vd-ajustes.abierto{display:block}
.vd .vd-ajustes label{display:grid;grid-template-columns:72px 1fr 42px;gap:6px;align-items:center;font-size:13px;margin:7px 0;color:inherit}
.vd-ajustes output{text-align:right;font-variant-numeric:tabular-nums;font-size:12px;color:#c8b698}
.vd .vd-ajustes input[type=range]{width:100%;accent-color:#e0955f;padding:0;min-height:0;border:0}
.vd-ajustes .chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.vd .vd-ajustes button{background:#3a2c20;border-color:#54432f;color:#f3e6d0;font-size:12px;min-height:26px;padding:2px 8px}
.vd .vd-ajustes button.activo{background:#6a3a1d;border-color:#b07a4c}
.vd-ajustes .botonera{display:flex;gap:4px;margin-top:8px}
.vd-mini{position:absolute;right:12px;bottom:14px;background:#000;border:1px solid #54432f;border-radius:6px;overflow:hidden;display:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.5);touch-action:none}
.vd-miniImg{position:absolute;left:50%;top:50%;max-width:none;transform-origin:center;opacity:.85;pointer-events:none}
.vd-miniVista{position:absolute;border:2px solid #f0c98a;background:rgba(240,201,138,.14);pointer-events:none}
.vd-regla{position:absolute;left:0;right:0;height:var(--vd-alto-regla,70px);display:none;pointer-events:none;box-shadow:0 0 0 100vmax rgba(8,6,4,.5);border-top:1px solid rgba(240,201,138,.7);border-bottom:1px solid rgba(240,201,138,.7)}

.vd-panel{display:flex;flex-direction:column;background:var(--vd-papel);min-width:0;min-height:0;position:relative}
.vd-cabeza{display:flex;gap:12px;padding:10px 12px;border-bottom:1px solid var(--vd-linea);align-items:center}
.vd-anillo{position:relative;width:74px;height:74px;flex:none;cursor:help}
.vd-anillo svg{transform:rotate(-90deg);display:block}
.vd-anillo circle{fill:none;stroke-width:7}
.vd-anilloFondo{stroke:var(--vd-linea)}
.vd-anilloValor{stroke:var(--vd-ok);stroke-linecap:round;transition:stroke-dashoffset .25s}
.vd-anillo>div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
.vd-anilloNum{font:700 22px/1 Georgia,serif;font-variant-numeric:tabular-nums}
.vd-anilloTipo{font-size:10px;color:var(--vd-suave);margin-top:2px}
.vd-datos{flex:1;min-width:0}
.vd-datos .t{font:600 14px/1.3 Georgia,serif;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.vd-datos .m{font-size:12px;color:var(--vd-suave);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vd-gente{display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;max-height:48px;overflow-y:auto;scrollbar-width:thin}
.vd-chip{display:inline-flex;align-items:center;font-size:11px;background:var(--vd-papel2);border:1px solid var(--vd-linea);border-radius:9px;white-space:nowrap;line-height:16px}
.vd .vd-chip button{font-size:11px;line-height:16px;min-height:0;background:none;border:0;padding:0 6px;border-radius:9px}
.vd .vd-chip button:hover{background:none;color:var(--vd-acento)}
.vd-chip small{font-size:10px;color:var(--vd-suave);margin-left:3px;font-variant-numeric:tabular-nums}
.vd-chip a{color:var(--vd-suave);text-decoration:none;padding-right:6px}
.vd-chip a:hover{color:var(--vd-acento)}
.vd-chip.nada{opacity:.55}
.vd-chip.activa{background:var(--vd-marca-p);border-color:var(--vd-marca-pf);font-weight:600}
.vd-chip.activa small{color:inherit}
.vd .vd-chip .quita{padding:0 6px 0 0}
.vd mark.p{background:var(--vd-marca-p);color:inherit;border-radius:3px}
.vd mark.p mark{background:none}
.vd mark.p.act{background:var(--vd-marca-pf);box-shadow:0 0 0 2px var(--vd-marca-pf)}
.vd-marcas{display:flex;gap:6px;margin-top:4px;font-size:12px;align-items:center;flex-wrap:wrap}
.vd-marcas b.i{background:var(--vd-marca-i);border-radius:4px;padding:0 5px;font-weight:600}
.vd-marcas b.d{background:var(--vd-marca-d);border-radius:4px;padding:0 5px;font-weight:600}
.vd-avisos{border-bottom:1px solid var(--vd-linea);background:var(--vd-papel2);display:none}
.vd-avisos summary{padding:6px 12px;cursor:pointer;font-weight:600;color:var(--vd-mal);font-size:13px}
.vd-avisosLista{max-height:min(120px,16vh);overflow:auto;padding:0 8px 8px}
.vd-aviso{display:grid;grid-template-columns:1fr auto;gap:2px 6px;padding:5px 6px;border-top:1px solid var(--vd-linea);font-size:12px;cursor:pointer}
.vd-aviso:hover{background:var(--vd-papel)}
.vd-aviso .q{grid-column:1/3;color:var(--vd-suave)}
.vd-aviso .v{font-size:11px;color:var(--vd-suave)}
.vd-aviso.grave b{color:var(--vd-mal)}
.vd .vd-aviso button{min-height:22px;padding:0 7px;font-size:11px}
.vd-pestanas{display:flex;align-items:center;gap:3px;padding:6px 10px 0;flex-wrap:wrap}
.vd .vd-pestanas .tab{border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom:none;background:transparent;min-height:26px;padding:2px 10px}
.vd .vd-pestanas .tab.activo{background:var(--vd-papel2);font-weight:600}
.vd .vd-version{margin-left:auto;max-width:55%}
.vd-herrTexto{display:flex;flex-wrap:wrap;gap:3px;padding:6px 10px;background:var(--vd-papel2);border-top:1px solid var(--vd-linea);border-bottom:1px solid var(--vd-linea)}
.vd .vd-herrTexto button{min-height:26px;padding:1px 7px;font-size:12.5px;background:var(--vd-papel)}
.vd-herrTexto .sep{width:1px;background:var(--vd-linea);margin:2px 3px}
.vd-barraBuscar{display:none;gap:4px;padding:6px 10px;background:var(--vd-papel2);border-bottom:1px solid var(--vd-linea);flex-wrap:wrap;align-items:center}
.vd-barraBuscar.abierta{display:flex}
.vd .vd-barraBuscar input{flex:1 1 90px;min-height:26px;padding:2px 7px}
.vd .vd-barraBuscar button{min-height:26px;padding:1px 7px;font-size:12px}
.vd-marco{position:relative;flex:1;min-height:0;background:var(--vd-papel)}
.vd .vd-fondoTexto,.vd .vd-texto,.vd .vd-cabecera,.vd .vd-leer{position:absolute;inset:0;margin:0;padding:12px 14px;border:0;border-radius:0;box-shadow:none;font:var(--vd-letra,16px)/1.6 Georgia,"Times New Roman",serif;white-space:pre-wrap;overflow-wrap:break-word;tab-size:4;letter-spacing:0;overflow-y:scroll;scrollbar-width:thin;max-width:none;min-height:0}
.vd .vd-fondoTexto{color:var(--vd-tinta);background:none;overflow-x:hidden;pointer-events:none;user-select:none}
.vd-fondoTexto mark{color:inherit;border-radius:3px}
.vd-fondoTexto mark.i{background:var(--vd-marca-i)}
.vd-fondoTexto mark.d{background:var(--vd-marca-d)}
.vd-fondoTexto mark.a{background:var(--vd-marca-a)}
.vd-fondoTexto .tit{color:var(--vd-tit)}
.vd-fondoTexto .mg{color:var(--vd-marg)}
.vd .vd-texto{background:transparent;color:transparent;caret-color:var(--vd-tinta);resize:none;outline:none;width:100%;height:100%;z-index:1}
.vd .vd-texto::selection{background:rgba(120,120,200,.38);color:transparent}
.vd .vd-cabecera{display:none;background:var(--vd-papel);color:var(--vd-tinta);resize:none;outline:none;width:100%;height:100%;font:13px/1.55 ui-monospace,Consolas,monospace}
.vd .vd-leer{display:none;white-space:normal;background:var(--vd-papel);color:var(--vd-tinta)}
.vd-leer blockquote{margin:8px 0;padding:4px 12px;border-left:3px solid var(--vd-linea);color:var(--vd-suave)}
.vd-leer h3,.vd-leer h4,.vd-leer h5{font:600 1.05em Georgia,serif;color:var(--vd-tit);margin:14px 0 6px}
.vd-leer table{border-collapse:collapse;font-size:.9em}.vd-leer td,.vd-leer th{border:1px solid var(--vd-linea);padding:2px 6px;text-align:left;vertical-align:top}
.vd-leer details.yaml{font:12.5px system-ui,sans-serif;color:var(--vd-suave);margin-bottom:8px}
.vd-puerta{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;background:var(--vd-papel);text-align:center;z-index:3}
.vd-puerta p{margin:0;max-width:370px;color:var(--vd-suave)}
.vd-puerta h2{margin:0;font:600 20px Georgia,serif;color:var(--vd-tit)}
.vd-pie{padding:8px 10px;border-top:1px solid var(--vd-linea);background:var(--vd-papel2);display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.vd .vd-pie label{display:flex;gap:4px;align-items:center;font-size:12.5px;margin:0;color:inherit}
.vd .vd-nota{display:none;flex:1 1 100%;width:100%}
.vd-estadoGuardar{font-size:12px;color:var(--vd-suave);flex:1 1 60px;min-width:60px}
.vd-estadoGuardar.sucio{color:var(--vd-aviso);font-weight:600}
.vd .vd-afecta.activo{background:var(--vd-aviso);border-color:var(--vd-aviso);color:#201608;font-weight:600}
.vd .vd-btnRev{padding:7px 14px;font-size:14.5px}
.vd .vd-btnRev.hecha{background:var(--vd-ok);border-color:var(--vd-ok)}
.vd-selloRev{display:none;color:var(--vd-ok);font-weight:600;font-size:13px;cursor:pointer}
.vd.vd-soloLectura .vd-herrTexto,.vd.vd-soloLectura .vd-guardar,.vd.vd-soloLectura .vd-btnRev,.vd.vd-soloLectura .vd-afecta{display:none}

.vd-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#241b13;color:#f3e6d0;padding:8px 14px;border-radius:9px;z-index:30;display:none;max-width:90vw;box-shadow:0 6px 22px rgba(0,0,0,.45)}
.vd-dialogo{border:1px solid var(--vd-linea);border-radius:12px;background:var(--vd-papel);color:var(--vd-tinta);max-width:540px;padding:18px}
.vd-dialogo::backdrop{background:rgba(0,0,0,.45)}
.vd-dialogo h3{margin:0 0 8px;font:600 18px Georgia,serif;color:var(--vd-tit)}
.vd-dialogoCuerpo{max-height:68vh;overflow:auto}
.vd-dialogoCuerpo table{border-collapse:collapse;width:100%}
.vd-dialogoCuerpo td{padding:2px 8px 2px 0;vertical-align:top}
.vd-dialogoBotones{display:flex;justify-content:flex-end;gap:6px;margin-top:14px;flex-wrap:wrap}
@media (max-width:860px){
  .vd-area{grid-template-columns:1fr;grid-template-rows:minmax(200px,55%) 7px 1fr}
  .vd.vd-soloTexto .vd-area{grid-template-rows:1fr}
  .vd-separador{cursor:row-resize}
}`;

  const HTML = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="vd-nitidez" color-interpolation-filters="sRGB"><feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 -0.7 0 -0.7 3.8 -0.7 0 -0.7 0"/></filter></svg>
<div class="vd-barra">
  <span class="vd-ranura vd-izq"></span>
  <button class="vd-ant" title="Página anterior (Alt+←)">‹</button>
  <button class="vd-sig" title="Página siguiente (Alt+→)">›</button>
  <select class="vd-paginaDoc" title="Ir a otra página de este documento"></select>
  <div class="vd-tituloBarra"><b class="vd-tTitulo"></b><span class="vd-tRuta"></span></div>
  <span class="vd-ranura vd-der"></span>
  <button class="vd-ayuda" title="Atajos y explicación del porcentaje">?</button>
  <span class="vd-ranura vd-fin"></span>
</div>
<div class="vd-area">
  <section class="vd-visor" aria-label="Imagen del documento">
    <div class="vd-lienzo" tabindex="0"><div class="vd-hoja"><img class="vd-img" alt="Foto del documento" draggable="false"></div></div>
    <div class="vd-faltaImagen"></div>
    <div class="vd-regla"></div>
    <div class="vd-nombreFoto"></div>
    <div class="vd-ajustes">
      <div class="chips vd-preajustes"></div>
      <label>Brillo <input type="range" class="vd-fBrillo" min="40" max="220" step="1"><output class="vd-oBrillo"></output></label>
      <label>Contraste <input type="range" class="vd-fContraste" min="50" max="320" step="1"><output class="vd-oContraste"></output></label>
      <label>Color <input type="range" class="vd-fColor" min="0" max="200" step="1"><output class="vd-oColor"></output></label>
      <label>Enderezar <input type="range" class="vd-fGiro" min="-15" max="15" step="0.1"><output class="vd-oGiro"></output></label>
      <label>Alto regla <input type="range" class="vd-fRegla" min="24" max="240" step="2"><output class="vd-oRegla"></output></label>
      <div class="botonera"><button class="vd-bNegativo" title="Invierte claros y oscuros">Negativo</button><button class="vd-bNitidez" title="Afila los trazos. En fotos muy grandes puede ir más lento">Nitidez</button><button class="vd-bRestaurar">Restaurar</button></div>
    </div>
    <div class="vd-herr">
      <button class="vd-zMenos" title="Alejar (Alt+−, o la rueda del ratón)">−</button>
      <span class="vd-zoomTxt">100 %</span>
      <button class="vd-zMas" title="Acercar (Alt++, o la rueda del ratón)">+</button>
      <span class="sep"></span>
      <button class="vd-zAncho" title="Ancho de página (Alt+0)">Ancho</button>
      <button class="vd-zPagina" title="Página entera">Entera</button>
      <button class="vd-z100" title="Tamaño real de la foto">1:1</button>
      <span class="sep"></span>
      <button class="vd-gIzq" title="Girar a la izquierda">⟲</button>
      <button class="vd-gDer" title="Girar a la derecha">⟳</button>
      <span class="sep"></span>
      <button class="vd-bRegla" title="Banda que sigue al ratón para leer línea a línea (Alt+R)">Regla</button>
      <button class="vd-bAjustes" title="Brillo, contraste, negativo, nitidez…">☀ Imagen</button>
      <a class="vd-abrirFoto" target="_blank" rel="noopener" title="Abrir la foto original en otra pestaña">Original ↗</a>
    </div>
    <div class="vd-mini"><img class="vd-miniImg" alt="" draggable="false"><div class="vd-miniVista"></div></div>
  </section>
  <div class="vd-separador" role="separator" aria-label="Mover la separación" title="Arrastra para cambiar el reparto"></div>
  <aside class="vd-panel" aria-label="Transcripción">
    <div class="vd-cabeza">
      <div class="vd-anillo">
        <svg width="74" height="74"><circle class="vd-anilloFondo" cx="37" cy="37" r="32"/><circle class="vd-anilloValor" cx="37" cy="37" r="32"/></svg>
        <div><span class="vd-anilloNum">—</span><span class="vd-anilloTipo"></span></div>
      </div>
      <div class="vd-datos">
        <div class="t vd-dTitulo"></div>
        <div class="m vd-dMeta"></div>
        <div class="vd-gente"></div>
        <div class="vd-marcas"></div>
      </div>
    </div>
    <details class="vd-avisos" open><summary class="vd-avisosTit"></summary><div class="vd-avisosLista"></div></details>
    <div class="vd-pestanas">
      <button class="tab activo vd-tabTexto" title="Corregir el texto">Transcripción</button>
      <button class="tab vd-tabLeer" title="El texto ya presentado, para leerlo">Lectura</button>
      <button class="tab vd-tabCab">Encabezado</button>
      <select class="vd-version" title="Hay más de una transcripción de esta foto" style="display:none"></select>
    </div>
    <div class="vd-herrTexto">
      <button class="vd-tDeshacer" title="Deshacer (Ctrl+Z)">↶</button>
      <button class="vd-tRehacer" title="Rehacer (Ctrl+Y)">↷</button>
      <span class="sep"></span>
      <button class="vd-tDuda" title="Lectura dudosa, detrás de la palabra (Alt+Q)">[?]</button>
      <button class="vd-tIleg" title="Ilegible (Alt+I)">[ilegible]</button>
      <button class="vd-tCorch" title="Pone entre corchetes lo seleccionado: abreviatura desarrollada (Alt+B)">[ab]</button>
      <button class="vd-tMargen" title="Nota marginal, en su línea">&gt; Margen</button>
      <button class="vd-tPartida" title="Separador entre partidas">---</button>
      <span class="sep"></span>
      <button class="vd-tSigDuda" title="Ir a la siguiente duda (Alt+D)">Siguiente duda ↓</button>
      <button class="vd-tBuscar" title="Buscar y reemplazar (Ctrl+F)">Buscar</button>
      <span class="sep"></span>
      <button class="vd-tMenos" title="Letra más pequeña">A−</button>
      <button class="vd-tMas" title="Letra más grande">A+</button>
    </div>
    <div class="vd-barraBuscar">
      <input type="search" class="vd-bTexto" placeholder="Buscar" aria-label="Buscar">
      <input type="text" class="vd-bPor" placeholder="Cambiar por" aria-label="Cambiar por">
      <button class="vd-bSig">Siguiente</button><button class="vd-bCambia">Cambiar</button><button class="vd-bTodos">Todos</button><button class="vd-bCierra" aria-label="Cerrar">✕</button>
    </div>
    <div class="vd-marco">
      <pre class="vd-fondoTexto" aria-hidden="true"></pre>
      <textarea class="vd-texto" spellcheck="false" aria-label="Texto de la transcripción"></textarea>
      <textarea class="vd-cabecera" spellcheck="false" aria-label="Encabezado de la transcripción"></textarea>
      <div class="vd-leer md"></div>
      <div class="vd-puerta"><h2 class="vd-puertaTit"></h2><p class="vd-puertaTxt"></p><button class="vd-prim vd-puertaBtn"></button><div class="vd-puertaCaja"></div></div>
    </div>
    <div class="vd-pie">
      <label>Legibilidad <select class="vd-confianza" title="«confianza» del encabezado: cómo de legible es la letra"><option value="alta">alta</option><option value="media">media</option><option value="baja">baja</option></select></label>
      <button class="vd-afecta" title="Marca que esta corrección cambia un dato del árbol, para decidirlo luego">⚑ Afecta al árbol</button>
      <span class="vd-estadoGuardar"></span>
      <span class="vd-selloRev" title="Pulsa para quitar la marca"></span>
      <button class="vd-guardar" title="Guardar (Ctrl+S)">Guardar</button>
      <button class="vd-prim vd-btnRev" title="Marca revisada, guarda y pasa a la siguiente (Ctrl+Intro)">✓ Revisada y siguiente</button>
      <input type="text" class="vd-nota" placeholder="¿Qué dato del árbol cambia?" aria-label="Nota sobre el árbol">
    </div>
  </aside>
</div>
<div class="vd-toast" role="status"></div>
<dialog class="vd-dialogo"><h3 class="vd-dialogoTit"></h3><div class="vd-dialogoCuerpo"></div><div class="vd-dialogoBotones"></div></dialog>`;

  const FILT_DEF = { b: 100, c: 100, s: 100, n: false, neg: false };
  const PRE = [['Normal', { b: 100, c: 100, s: 100, neg: false }], ['Tinta débil', { b: 92, c: 175, s: 0, neg: false }], ['Papel oscuro', { b: 145, c: 135, s: 40, neg: false }], ['Microfilm', { b: 108, c: 190, s: 0, neg: false }], ['Negativo', { b: 105, c: 130, s: 0, neg: true }]];
  const CIRC = 2 * Math.PI * 32;

  /* ===== El visor =====
     op: { reparto, activo(), ir(d), irHermana(valor), haySiguiente(), alEscape(), alGuardar(pagina, datos), alMedir(pagina, p), alIrPersona(href), avisoNoMd }  */
  function crear(contenedor, op = {}) {
    if (!document.getElementById('vd-css')) { const s = document.createElement('style'); s.id = 'vd-css'; s.textContent = CSS; document.head.append(s); }
    const raizDom = document.createElement('div'); raizDom.className = 'vd'; raizDom.innerHTML = HTML; contenedor.append(raizDom);
    const cache = new Map();
    const $ = n => { if (!cache.has(n)) cache.set(n, raizDom.querySelector('.vd-' + n)); return cache.get(n); };
    const activo = () => (op.activo ? op.activo() : true);
    const cur = {};
    let pagina = null, cuenta = 0, chips = [];

    let toastT;
    function toast(t, ms = 3200) { const e = $('toast'); if (!t) { e.style.display = 'none'; return; } e.textContent = t; e.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => e.style.display = 'none', ms); }
    function preguntar(tit, html, botones) {
      return new Promise(ok => {
        const d = $('dialogo'); $('dialogoTit').textContent = tit; $('dialogoCuerpo').innerHTML = html;
        const c = $('dialogoBotones'); c.innerHTML = '';
        botones.forEach(([txt, val, prim]) => { const b = document.createElement('button'); b.textContent = txt; if (prim) b.className = 'vd-prim'; b.onclick = () => { d.close(); ok(val); }; c.append(b); });
        d.oncancel = e => { e.preventDefault(); d.close(); ok(null); };
        d.showModal();
      });
    }

    /* ----- Imagen ----- */
    const lienzo = $('lienzo'), hoja = $('hoja'), img = $('img'), visor = $('visor');
    const V = { z: 1, rot: 0, ang: 0, W: 0, H: 0, bw: 0, bh: 0 };
    let F = { ...FILT_DEF, ...local.leer('filtros', {}) };
    function pintarFiltros() {
      let f = `brightness(${F.b}%) contrast(${F.c}%) saturate(${F.s}%)`;
      if (F.neg) f += ' invert(1)';
      if (F.n) f += ' url(#vd-nitidez)';
      img.style.filter = f;
      $('fBrillo').value = F.b; $('oBrillo').textContent = F.b + '%';
      $('fContraste').value = F.c; $('oContraste').textContent = F.c + '%';
      $('fColor').value = F.s; $('oColor').textContent = F.s + '%';
      $('bNegativo').classList.toggle('activo', F.neg); $('bNitidez').classList.toggle('activo', F.n);
      [...$('preajustes').children].forEach((b, k) => { const p = PRE[k][1]; b.classList.toggle('activo', p.b === F.b && p.c === F.c && p.s === F.s && p.neg === F.neg); });
      local.poner('filtros', F);
    }
    PRE.forEach(([n, p]) => { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { Object.assign(F, p); pintarFiltros(); }; $('preajustes').append(b); });
    function caja() { const t = (V.rot + V.ang) * Math.PI / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t)); V.bw = V.W * c + V.H * s; V.bh = V.W * s + V.H * c; }
    function pintarHoja() {
      if (!V.W) return;
      caja();
      hoja.style.width = Math.round(V.bw * V.z) + 'px'; hoja.style.height = Math.round(V.bh * V.z) + 'px';
      img.style.width = V.W * V.z + 'px'; img.style.height = V.H * V.z + 'px';
      img.style.transform = `translate(-50%,-50%) rotate(${V.rot + V.ang}deg)`;
      $('zoomTxt').textContent = Math.round(V.z * 100) + ' %';
      pintarMini();
    }
    const limZ = z => Math.min(10, Math.max(.02, z));
    function zoomEn(nz, cx, cy) {
      if (!V.W) return;
      if (cx === undefined) { cx = lienzo.clientWidth / 2; cy = lienzo.clientHeight / 2; }
      const fx = (lienzo.scrollLeft + cx - hoja.offsetLeft) / hoja.offsetWidth, fy = (lienzo.scrollTop + cy - hoja.offsetTop) / hoja.offsetHeight;
      V.z = limZ(nz); pintarHoja();
      lienzo.scrollLeft = fx * hoja.offsetWidth + hoja.offsetLeft - cx;
      lienzo.scrollTop = fy * hoja.offsetHeight + hoja.offsetTop - cy;
    }
    function ajustarAncho() { if (!V.W) return; caja(); V.z = limZ((lienzo.clientWidth - 2) / V.bw); pintarHoja(); lienzo.scrollLeft = 0; lienzo.scrollTop = 0; }
    function ajustarPagina() { if (!V.W) return; caja(); V.z = limZ(Math.min((lienzo.clientWidth - 2) / V.bw, (lienzo.clientHeight - 2) / V.bh)); pintarHoja(); }
    function recordarGiro() { if (!pagina?.clave) return; const g = local.leer('giros', {}); if (V.rot || V.ang) g[pagina.clave] = [V.rot, V.ang]; else delete g[pagina.clave]; local.poner('giros', g); }
    function girar(d) { V.rot = (V.rot + d + 360) % 360; recordarGiro(); ajustarAncho(); }
    function faltaImagen(html) { img.style.display = 'none'; hoja.style.width = hoja.style.height = '0'; const x = $('faltaImagen'); x.style.display = 'flex'; if (html !== undefined) x.innerHTML = html; $('mini').style.display = 'none'; return x; }
    async function cargarImagen(p, turno) {
      V.W = 0; $('faltaImagen').style.display = 'none'; $('faltaImagen').innerHTML = ''; img.style.display = 'block'; $('mini').style.display = 'none';
      const [r, a] = local.leer('giros', {})[p.clave] || [0, 0]; V.rot = r; V.ang = a; $('fGiro').value = a; $('oGiro').textContent = a + '°';
      hoja.style.width = hoja.style.height = '0';
      img.removeAttribute('src'); $('abrirFoto').removeAttribute('href');
      let url;
      try { url = typeof p.foto === 'function' ? await p.foto() : p.foto; }
      catch (e) { if (turno === cuenta) { const x = faltaImagen(''); if (p.sinFoto) p.sinFoto(x, e); else x.textContent = e.message; } return; }
      if (turno !== cuenta) return;
      $('abrirFoto').href = url;
      const f = (p.form || (p.nombre || '').split('.').pop() || '').toLowerCase();
      if (f === 'pdf') { faltaImagen(`<iframe src="${esc(url)}" title="${esc(p.nombre || 'PDF')}"></iframe>`); return; }
      if (f && !/^(jpe?g|png|gif|tiff?|bmp|webp|heic|avif)$/.test(f)) { faltaImagen(`<p><a href="${esc(url)}" target="_blank" rel="noopener">Abrir ${esc(f.toUpperCase())}</a></p>`); return; }
      img.onload = () => { if (turno !== cuenta) return; V.W = img.naturalWidth; V.H = img.naturalHeight; $('miniImg').src = img.src; ajustarAncho(); };
      img.onerror = () => { if (turno !== cuenta) return; faltaImagen(); $('faltaImagen').textContent = /^tiff?$/.test(f) ? 'El navegador no sabe mostrar fotos .tif. Usa «Original ↗» para abrirla con otro programa.' : /^heic$/.test(f) ? 'El navegador no sabe mostrar fotos .heic. Usa «Original ↗».' : 'No se encuentra la foto. Comprueba que Dropbox la tiene descargada en este ordenador.'; };
      img.src = url;
    }
    lienzo.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.shiftKey) { lienzo.scrollTop += e.deltaY || e.deltaX; return; }
      const r = lienzo.getBoundingClientRect(); zoomEn(V.z * Math.exp(-e.deltaY * .0022), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    let arr = null;
    lienzo.addEventListener('pointerdown', e => {
      if (e.button !== 0) return; const r = lienzo.getBoundingClientRect(); if (e.clientX - r.left > lienzo.clientWidth || e.clientY - r.top > lienzo.clientHeight) return;
      arr = { x: e.clientX, y: e.clientY, l: lienzo.scrollLeft, t: lienzo.scrollTop }; lienzo.setPointerCapture(e.pointerId); lienzo.classList.add('moviendo');
    });
    lienzo.addEventListener('pointermove', e => { if (!arr) return; lienzo.scrollLeft = arr.l - (e.clientX - arr.x); lienzo.scrollTop = arr.t - (e.clientY - arr.y); });
    const finArr = () => { arr = null; lienzo.classList.remove('moviendo'); };
    lienzo.addEventListener('pointerup', finArr); lienzo.addEventListener('pointercancel', finArr);
    lienzo.addEventListener('dblclick', e => { const r = lienzo.getBoundingClientRect(); zoomEn(V.z * (e.shiftKey ? .625 : 1.6), e.clientX - r.left, e.clientY - r.top); });
    let rafMini = 0; lienzo.addEventListener('scroll', () => { if (!rafMini) rafMini = requestAnimationFrame(() => { rafMini = 0; pintarMini(); }); });
    function pintarMini() {
      const m = $('mini'), ow = hoja.offsetWidth, oh = hoja.offsetHeight;
      if (!V.W || (ow <= lienzo.clientWidth + 1 && oh <= lienzo.clientHeight + 1)) { m.style.display = 'none'; return; }
      const k = Math.min(130 / V.bw, 190 / V.bh), w = V.bw * k, h = V.bh * k;
      m.style.display = 'block'; m.style.width = w + 'px'; m.style.height = h + 'px';
      const mi = $('miniImg'); mi.style.width = V.W * k + 'px'; mi.style.height = V.H * k + 'px'; mi.style.transform = `translate(-50%,-50%) rotate(${V.rot + V.ang}deg)`;
      const vis = $('miniVista'), x = Math.max(0, lienzo.scrollLeft - hoja.offsetLeft), y = Math.max(0, lienzo.scrollTop - hoja.offsetTop);
      vis.style.left = x / ow * w + 'px'; vis.style.top = y / oh * h + 'px';
      vis.style.width = Math.min(1, lienzo.clientWidth / ow) * w + 'px'; vis.style.height = Math.min(1, lienzo.clientHeight / oh) * h + 'px';
    }
    function miniIr(e) {
      const m = $('mini').getBoundingClientRect();
      lienzo.scrollLeft = (e.clientX - m.left) / m.width * hoja.offsetWidth + hoja.offsetLeft - lienzo.clientWidth / 2;
      lienzo.scrollTop = (e.clientY - m.top) / m.height * hoja.offsetHeight + hoja.offsetTop - lienzo.clientHeight / 2;
    }
    let miniArr = false;
    $('mini').addEventListener('pointerdown', e => { miniArr = true; $('mini').setPointerCapture(e.pointerId); miniIr(e); });
    $('mini').addEventListener('pointermove', e => { if (miniArr) miniIr(e); });
    $('mini').addEventListener('pointerup', () => miniArr = false);
    let reglaOn = local.leer('regla', false), altoRegla = local.leer('altoRegla', 70);
    function pintarRegla() {
      $('regla').style.display = reglaOn ? 'block' : 'none'; $('bRegla').classList.toggle('activo', reglaOn);
      visor.style.setProperty('--vd-alto-regla', altoRegla + 'px'); $('fRegla').value = altoRegla; $('oRegla').textContent = altoRegla; local.poner('regla', reglaOn); local.poner('altoRegla', altoRegla);
    }
    visor.addEventListener('pointermove', e => { if (reglaOn) { const r = visor.getBoundingClientRect(); $('regla').style.top = (e.clientY - r.top - altoRegla / 2) + 'px'; } });
    $('zMas').onclick = () => zoomEn(V.z * 1.25); $('zMenos').onclick = () => zoomEn(V.z / 1.25);
    $('zAncho').onclick = ajustarAncho; $('zPagina').onclick = ajustarPagina; $('z100').onclick = () => zoomEn(1);
    $('gIzq').onclick = () => girar(-90); $('gDer').onclick = () => girar(90);
    $('bRegla').onclick = () => { reglaOn = !reglaOn; pintarRegla(); };
    $('bAjustes').onclick = () => { const a = $('ajustes').classList.toggle('abierto'); $('bAjustes').classList.toggle('activo', a); };
    $('fBrillo').oninput = e => { F.b = +e.target.value; pintarFiltros(); };
    $('fContraste').oninput = e => { F.c = +e.target.value; pintarFiltros(); };
    $('fColor').oninput = e => { F.s = +e.target.value; pintarFiltros(); };
    $('fGiro').oninput = e => { V.ang = +e.target.value; $('oGiro').textContent = V.ang + '°'; pintarHoja(); recordarGiro(); };
    $('fRegla').oninput = e => { altoRegla = +e.target.value; pintarRegla(); };
    $('bNegativo').onclick = () => { F.neg = !F.neg; pintarFiltros(); };
    $('bNitidez').onclick = () => { F.n = !F.n; pintarFiltros(); };
    $('bRestaurar').onclick = () => { F = { ...FILT_DEF }; pintarFiltros(); V.ang = 0; $('fGiro').value = 0; $('oGiro').textContent = '0°'; pintarHoja(); recordarGiro(); };
    // Separador
    (function () {
      const sep = $('separador'), area = $('area'); let arrastra = false;
      const def = op.reparto || 70;
      const pon = p => { p = Math.min(88, Math.max(25, p)); area.style.setProperty('--vd-ancho', p + '%'); local.poner('reparto', p); };
      area.style.setProperty('--vd-ancho', local.leer('reparto', def) + '%');
      sep.addEventListener('pointerdown', e => { if (innerWidth <= 860) return; arrastra = true; sep.classList.add('activo'); sep.setPointerCapture(e.pointerId); });
      sep.addEventListener('pointermove', e => { if (arrastra) { const r = area.getBoundingClientRect(); pon((e.clientX - r.left) / r.width * 100); pintarMini(); } });
      sep.addEventListener('pointerup', () => { arrastra = false; sep.classList.remove('activo'); });
      sep.addEventListener('dblclick', () => { pon(def); ajustarAncho(); });
    })();
    addEventListener('resize', pintarMini);

    /* ----- Puerta: lo que tapa el texto cuando no se puede mostrar ----- */
    function puerta(titulo, texto, boton, accion) {
      const p = $('puerta');
      p.style.display = titulo ? 'flex' : 'none';
      $('puertaCaja').innerHTML = '';
      if (!titulo) return p;
      $('puertaTit').textContent = titulo; $('puertaTxt').textContent = texto || '';
      $('puertaBtn').textContent = boton || ''; $('puertaBtn').onclick = accion || null; $('puertaBtn').style.display = accion ? '' : 'none';
      return p;
    }

    /* ----- Texto ----- */
    const ta = $('texto'), fondo = $('fondoTexto');
    const hayCambios = () => cur.cargado && !cur.soloLectura && (cur.hdr !== cur.oHdr || cur.body !== cur.oBody);
    const claveBorrador = () => 'borrador:' + (cur.ver?.ruta || cur.ver?.partes?.join('/') || '');
    function resaltar(t) {
      return esc(t).replace(/\[ilegible[^\]\n]*\]|\[[^\]\n]*\?\]|\[[^\]\n]+\]|^#{1,6} .*$|^&gt;.*$/gmi, m => {
        if (/^\[ilegible/i.test(m)) return `<mark class="i">${m}</mark>`;
        if (m[0] === '[' && m.endsWith('?]')) return `<mark class="d">${m}</mark>`;
        if (m[0] === '[') return `<mark class="a">${m}</mark>`;
        if (m[0] === '#') return `<span class="tit">${m}</span>`;
        return `<span class="mg">${m}</span>`;
      });
    }
    // La persona que se está mirando: { nombre, rangos, i, nivel }. Sus apariciones se recalculan si cambia el texto.
    let persona = null;
    function recalcularPersona() {
      if (!persona) return;
      const r = buscarNombre(ta.value, persona.nombre);
      persona.rangos = r.rangos; persona.nivel = r.nivel; persona.i = Math.min(persona.i, Math.max(0, r.rangos.length - 1));
    }
    function pintarTexto() {
      recalcularPersona();
      fondo.innerHTML = marcasHtml(resaltar(persona ? conMarcas(ta.value, persona.rangos, persona.i) : ta.value)) + '\n';
      fondo.scrollTop = ta.scrollTop;
    }
    function pintarLeer() {
      if (!cur.cargado) { $('leer').innerHTML = ''; return; }
      const cuerpo = persona ? conMarcas(cur.body, persona.rangos, persona.i) : cur.body;
      $('leer').innerHTML = marcasHtml(md((cur.hdr ? `---\n${cur.hdr}\n---\n` : '') + cuerpo));
    }
    function verApariencia() {
      if (pestana === 'cab') ponPestana('texto');
      if (pestana === 'leer') {
        pintarLeer();
        const m = $('leer').querySelector('mark.act'); if (m) $('leer').scrollTop = Math.max(0, m.offsetTop - $('leer').clientHeight / 3);
        return;
      }
      pintarTexto();
      const m = fondo.querySelector('mark.act');
      if (m) { ta.scrollTop = Math.max(0, m.offsetTop - ta.clientHeight / 3); fondo.scrollTop = ta.scrollTop; }
    }
    function quitarPersona() { if (!persona) return false; persona = null; pintarTexto(); if (pestana === 'leer') pintarLeer(); pintarGente(); return true; }
    // Pulsar un nombre: resalta todas sus apariciones y va a la primera; volver a pulsarlo, a la siguiente (con Mayús, a la anterior).
    function pulsarNombre(nombre, atras) {
      if (!cur.cargado) return;
      if (persona?.nombre === nombre && persona.rangos.length) {
        const n = persona.rangos.length; persona.i = (persona.i + (atras ? n - 1 : 1)) % n;
      } else {
        const r = buscarNombre(cur.body, nombre);
        if (!r.rangos.length) { toast(`«${nombre}» no aparece escrito así en este texto. Puede estar con otra grafía o en otra página.`, 4000); return; }
        persona = { nombre, rangos: r.rangos, nivel: r.nivel, i: 0 };
        if (r.nivel === 2) toast(`El nombre completo no aparece: se marca solo el apellido. Puede ser otra persona.`, 4000);
        if (r.nivel === 3) toast(`Los apellidos no aparecen: se marca solo el nombre de pila. Puede ser otra persona.`, 4000);
      }
      verApariencia(); pintarGente();
    }
    $('gente').addEventListener('click', async e => {
      const a = e.target.closest('a');
      if (a) { e.preventDefault(); if (await puedoSalir()) op.alIrPersona ? op.alIrPersona(a.getAttribute('href')) : (location.hash = a.getAttribute('href')); return; }
      if (e.target.closest('.quita')) { quitarPersona(); return; }
      const c = e.target.closest('.vd-chip'); if (c) pulsarNombre(chips[+c.dataset.k].nombre, e.shiftKey);
    });
    ta.addEventListener('scroll', () => { fondo.scrollTop = ta.scrollTop; });
    function actualizarEstado() {
      const s = $('estadoGuardar'), h = hayCambios();
      s.textContent = cur.soloLectura && cur.cargado ? (cur.motivoLectura || 'Solo lectura') : h ? 'Sin guardar' : (cur.cargado ? (cur.nuevo ? 'Sin crear todavía' : 'Guardado') : '');
      s.className = 'vd-estadoGuardar' + (h ? ' sucio' : '');
    }
    let tBorr;
    function alCambiar() {
      cur.body = ta.value; pintarTexto(); pintarAnillo(); actualizarEstado();
      clearTimeout(tBorr); tBorr = setTimeout(() => { const k = claveBorrador(); if (hayCambios()) local.poner(k, { body: cur.body, hdr: cur.hdr }); else local.quitar(k); }, 700);
    }
    ta.addEventListener('input', alCambiar);
    $('cabecera').addEventListener('input', e => { cur.hdr = e.target.value; pintarCabeceraDatos(); actualizarEstado(); });
    function insertar(t) { if (cur.soloLectura) return; ta.focus(); if (!document.execCommand('insertText', false, t)) { ta.setRangeText(t, ta.selectionStart, ta.selectionEnd, 'end'); alCambiar(); } }
    function verEnTexto(a, b) {
      if (pestana !== 'texto') ponPestana('texto');
      ta.focus(); ta.setSelectionRange(a, b);
      const antes = fondo.innerHTML; fondo.innerHTML = esc(ta.value.slice(0, a)) + '<span class="vd-pto"></span>' + esc(ta.value.slice(a)) + '\n';
      const y = fondo.querySelector('.vd-pto').offsetTop; fondo.innerHTML = antes;
      ta.scrollTop = Math.max(0, y - ta.clientHeight / 3); fondo.scrollTop = ta.scrollTop;
    }
    function ponDuda() { const f = ta.selectionEnd; ta.setSelectionRange(f, f); insertar(' [?]'.replace(/^ /, ta.value[f - 1] === ' ' || f === 0 ? '' : ' ')); }
    function ponCorchetes() { const a = ta.selectionStart, b = ta.selectionEnd; insertar('[' + ta.value.slice(a, b) + ']'); if (a === b) ta.setSelectionRange(a + 1, a + 1); }
    function aLinea(pref) { const a = ta.selectionStart, ini = ta.value.lastIndexOf('\n', a - 1) + 1; ta.setSelectionRange(ini, ini); insertar(pref); }
    function sigDuda() { const re = /\[ilegible[^\]\n]*\]|\[[^\]\n]*\?\]/gi; re.lastIndex = ta.selectionEnd; let m = re.exec(ta.value); if (!m) { re.lastIndex = 0; m = re.exec(ta.value); } if (m) verEnTexto(m.index, m.index + m[0].length); else toast('No quedan dudas marcadas.'); }
    $('tDeshacer').onclick = () => { ta.focus(); document.execCommand('undo'); }; $('tRehacer').onclick = () => { ta.focus(); document.execCommand('redo'); };
    $('tDuda').onclick = ponDuda; $('tIleg').onclick = () => insertar('[ilegible]'); $('tCorch').onclick = ponCorchetes;
    $('tMargen').onclick = () => aLinea('> Margen: '); $('tPartida').onclick = () => aLinea('\n---\n\n'); $('tSigDuda').onclick = sigDuda;
    let letra = local.leer('letra', 16);
    function pintarLetra() { $('marco').style.setProperty('--vd-letra', letra + 'px'); local.poner('letra', letra); }
    $('tMas').onclick = () => { letra = Math.min(30, letra + 1); pintarLetra(); }; $('tMenos').onclick = () => { letra = Math.max(11, letra - 1); pintarLetra(); };
    function abrirBuscar() { $('barraBuscar').classList.add('abierta'); const s = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (s && !s.includes('\n')) $('bTexto').value = s; $('bTexto').focus(); $('bTexto').select(); }
    $('tBuscar').onclick = abrirBuscar; $('bCierra').onclick = () => { $('barraBuscar').classList.remove('abierta'); ta.focus(); };
    function buscaSig() { const q = $('bTexto').value; if (!q) return false; const t = ta.value.toLowerCase(), b = q.toLowerCase(); let k = t.indexOf(b, ta.selectionEnd); if (k < 0) k = t.indexOf(b); if (k < 0) { toast('No está.'); return false; } verEnTexto(k, k + q.length); return true; }
    $('bSig').onclick = buscaSig; $('bTexto').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscaSig(); $('bTexto').focus(); } });
    $('bCambia').onclick = () => { const q = $('bTexto').value; if (ta.value.slice(ta.selectionStart, ta.selectionEnd).toLowerCase() === q.toLowerCase() && q) insertar($('bPor').value); buscaSig(); };
    $('bTodos').onclick = () => { const q = $('bTexto').value; if (!q) return; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); const n = (ta.value.match(re) || []).length; if (!n) { toast('No está.'); return; } ta.focus(); ta.select(); insertar(ta.value.replace(re, () => $('bPor').value)); toast(`Cambiados ${n}.`); };
    // Pestañas: Transcripción (se corrige), Lectura (ya presentada), Encabezado
    let pestana = 'texto';
    function ponPestana(p) {
      pestana = p;
      for (const [n, t] of [['tabTexto', 'texto'], ['tabLeer', 'leer'], ['tabCab', 'cab']]) $(n).classList.toggle('activo', p === t);
      ta.style.display = fondo.style.display = p === 'texto' ? 'block' : 'none';
      $('cabecera').style.display = p === 'cab' ? 'block' : 'none';
      $('leer').style.display = p === 'leer' ? 'block' : 'none';
      $('herrTexto').style.display = p === 'texto' ? '' : 'none';
      if (p === 'leer') pintarLeer(); else if (p === 'texto' && persona) pintarTexto();
      local.poner('pestana', p);
    }
    $('tabTexto').onclick = () => ponPestana('texto'); $('tabLeer').onclick = () => ponPestana('leer'); $('tabCab').onclick = () => ponPestana('cab');
    $('confianza').onchange = e => { cur.hdr = yamlPon(cur.hdr, 'confianza', e.target.value); $('cabecera').value = cur.hdr; pintarAnillo(); actualizarEstado(); };
    $('afecta').onclick = () => {
      if (!cur.cargado) return;
      if (afectaEn(cur.hdr)) cur.hdr = yamlQuita(yamlQuita(cur.hdr, 'afecta_arbol'), 'nota_revision'); else cur.hdr = yamlPon(cur.hdr, 'afecta_arbol', 'true');
      $('cabecera').value = cur.hdr; pintarCabeceraDatos(); actualizarEstado(); if (afectaEn(cur.hdr)) $('nota').focus();
    };
    $('nota').oninput = e => { const v = e.target.value.replace(/"/g, "'"); cur.hdr = v ? yamlPon(cur.hdr, 'nota_revision', '"' + v + '"') : yamlQuita(cur.hdr, 'nota_revision'); $('cabecera').value = cur.hdr; actualizarEstado(); };

    /* ----- Datos de la página ----- */
    function pintarCabeceraDatos() {
      const h = cur.hdr, fe = yamlLee(h, 'fecha_doc'), ti = yamlLee(h, 'tipo'), ar = yamlLee(h, 'archivo');
      $('dMeta').textContent = [fe, ti, ar].filter(Boolean).join(' · '); $('dMeta').title = ar;
      const c = confDe(h), cs = $('confianza'); if (c) cs.value = c; else cs.selectedIndex = -1;
      const rev = revisadoEn(h), afe = afectaEn(h);
      $('afecta').classList.toggle('activo', afe); $('nota').style.display = afe ? 'block' : 'none'; $('nota').value = yamlLee(h, 'nota_revision');
      const sello = $('selloRev'); sello.style.display = rev ? 'inline' : 'none'; sello.textContent = rev ? '✓ Revisada' + (yamlLee(h, 'revisado_fecha') ? ' el ' + yamlLee(h, 'revisado_fecha') : '') : '';
      pintarBtnRev();
      pintarGente();
      pintarAnillo();
    }
    function pintarBtnRev() {
      const rev = cur.cargado && revisadoEn(cur.hdr), hay = op.haySiguiente ? op.haySiguiente() : false, br = $('btnRev');
      br.textContent = rev ? 'Siguiente →' : hay ? '✓ Revisada y siguiente' : '✓ Marcar revisada';
      br.classList.toggle('hecha', rev);
      br.disabled = (rev && !hay) || (!cur.cargado);
    }
    function pintarGente() {
      // Quien dice la página (los que citan el documento) y además las personas del encabezado de la transcripción
      chips = [];
      const vistos = new Set();
      const clave = n => (n.match(/\p{L}+/gu) || []).map(claveNombre).filter(k => !PARTICULAS.has(k)).join(' ');
      for (const x of [...(pagina?.gente || []), ...personasDelEncabezado(cur.hdr).map(nombre => ({ nombre }))]) {
        const k = clave(x.nombre); if (!k || vistos.has(k)) continue;
        vistos.add(k); chips.push(x);
      }
      const pal = cur.cargado ? palabrasDe(cur.body) : null;
      $('gente').innerHTML = chips.map((x, k) => {
        const activa = persona?.nombre === x.nombre;
        const veces = pal ? buscarNombre(cur.body, x.nombre, pal) : null, n = veces && veces.nivel === 1 ? veces.rangos.length : 0;
        const cuenta = activa ? `${persona.i + 1}/${persona.rangos.length}` : n ? String(n) : '';
        const titulo = (x.titulo ? x.titulo + '. ' : '') + (n || activa ? 'Pulsa para ir a donde sale; otra vez, a la siguiente (con Mayús, a la anterior).' : pal ? 'No aparece así en este texto.' : '');
        return `<span class="vd-chip${activa ? ' activa' : ''}${pal && !n && !activa ? ' nada' : ''}" data-k="${k}"><button type="button" title="${esc(titulo)}">${esc(x.nombre)}${cuenta ? `<small>${cuenta}</small>` : ''}</button>${activa ? '<button type="button" class="quita" title="Quitar el resaltado (Esc)" aria-label="Quitar el resaltado">✕</button>' : ''}${x.href ? `<a href="${esc(x.href)}" title="Ver su ficha" aria-label="Ver la ficha de ${esc(x.nombre)}">↗</a>` : ''}</span>`;
      }).join('');
    }
    function pintarAnillo() {
      let p = null, tipo = '', expl = '';
      const f = pagina;
      if (f && (cur.cargado || f.previo)) {
        const pv = f.previo || {};
        const m = cur.cargado ? medirTexto(cur.body) : { clase: pv.clase, dudas: pv.dudas, ileg: pv.ileg, pal: pv.pal };
        const co = cur.cargado ? confDe(cur.hdr) : pv.conf;
        const rev = cur.cargado ? revisadoEn(cur.hdr) : pv.rev;
        if (rev) { p = 100; tipo = 'revisada'; expl = 'La ha cotejado una persona con la foto.'; }
        else if (f.medida != null) { p = f.medida; tipo = 'medida'; expl = 'Medida en esta página en una muestra, con agentes de Claude, no por una persona.'; }
        else { p = fiabilidad(co, m.clase, m.dudas, m.ileg, m.pal); tipo = 'estimada'; expl = 'Estimación para ordenar el trabajo, no medida en esta página. Parte de ' + (BASE[co] ?? 80) + ' según la legibilidad' + (co === 'baja' || !co ? ' (cifra supuesta, sin medir)' : ' (muestra de 27 páginas)') + ' y resta lo marcado como dudoso o ilegible.' + (m.clase === 'E' ? ' Es un extracto: 20 puntos menos.' : ''); }
        $('marcas').innerHTML = `<b class="i">${m.ileg} ${m.ileg === 1 ? 'ilegible' : 'ilegibles'}</b><b class="d">${m.dudas} ${m.dudas === 1 ? 'duda' : 'dudas'}</b><span style="color:var(--vd-suave)">${num(m.pal)} palabras${m.clase === 'E' ? ' · extracto' : ''}</span>`;
        if (cur.cargado && f.medida == null && op.alMedir) op.alMedir(f, rev ? 100 : p);
      } else $('marcas').innerHTML = '';
      $('anilloNum').textContent = p === null ? '—' : (tipo === 'estimada' ? '≈' : '') + p + (p === 100 ? '' : '%');
      $('anilloNum').style.fontSize = p === 100 ? '24px' : '19px';
      $('anilloTipo').textContent = tipo; $('anillo').title = expl;
      const a = $('anilloValor'); a.style.strokeDasharray = CIRC; a.style.strokeDashoffset = CIRC * (1 - (p || 0) / 100); a.style.stroke = p === null ? 'transparent' : colorFia(p);
    }
    function pintarAvisos() {
      const lista = pagina?.avisos, c = $('avisos');
      if (!lista || !lista.length) { c.style.display = 'none'; return; }
      c.style.display = 'block';
      const graves = lista.filter(a => a[5] === 'grave').length;
      $('avisosTit').textContent = `Posibles errores detectados: ${lista.length} (${graves} graves). Compruébalos en la foto`;
      $('avisosLista').innerHTML = lista.map((a, k) => `<div class="vd-aviso ${esc(a[5])}" data-k="${k}"><div><b>${esc(a[1])}</b> → ${esc(a[2])}</div>${a[4] === 'ciega' ? `<button data-usar="${k}" title="Cambia el texto por la otra lectura. Míralo antes en la foto">Cambiar</button>` : '<span class="v">' + esc(a[4]) + '</span>'}<div class="q">${esc(a[0])}: ${esc(a[3])}</div></div>`).join('');
    }
    $('avisosLista').addEventListener('click', e => {
      const u = e.target.closest('[data-usar]'), r = e.target.closest('.vd-aviso'); if (!r) return;
      const a = pagina.avisos[+r.dataset.k], hit = buscarLectura(a[1]);
      if (!hit) { toast('No encuentro esa lectura en el texto: puede estar ya corregida o escrita de otra forma.'); return; }
      verEnTexto(hit[0], hit[1]);
      if (u) insertar(a[2].replace(/\s*\(\d+ veces\)|\s*\(varias\)/, ''));
    });
    function buscarLectura(s) {
      s = s.replace(/\s*\([^)]*\)/g, '').replace(/[….]+$/, '').trim();
      if (!s) return null;
      const palabra = w => [...w].filter(c => !/[\[\]]/.test(c)).map(c => c.replace(/[.*+?^${}()|\\/-]/g, '\\$&')).join('[\\[\\]]*');
      const trozo = t => t.trim().split(/\s+/).filter(Boolean).map(palabra).join('\\s+');
      // Lo marcado como dudoso o ilegible entra en lo seleccionado, para que «Cambiar» no deje medio corchete
      const pat = s.split(/\[(?:\?|ilegible|…)[^\]]*\]/).map(trozo).join('\\s*(?:\\[[^\\]\\n]*\\])?\\s*');
      try { const m = new RegExp(pat, 'i').exec(cur.body); return m && m[0] ? [m.index, m.index + m[0].trimEnd().length] : null; } catch { return null; }
    }

    /* ----- Abrir una transcripción ----- */
    function vaciarTexto() {
      persona = null; cur.cargado = false; cur.ver = null; cur.asa = null; cur.nuevo = false; cur.soloLectura = false; cur.hdr = cur.oHdr = ''; cur.body = cur.oBody = '';
      ta.value = ''; $('cabecera').value = ''; ta.readOnly = false; $('cabecera').readOnly = false; pintarTexto(); $('leer').innerHTML = '';
      raizDom.classList.remove('vd-soloLectura');
      $('dMeta').textContent = ''; $('nota').style.display = 'none'; $('selloRev').style.display = 'none'; $('afecta').classList.remove('activo');
      actualizarEstado();
    }
    function pintarTextoCargado() {
      ta.value = cur.body; $('cabecera').value = cur.hdr; ta.scrollTop = 0; pintarTexto(); pintarCabeceraDatos(); actualizarEstado();
      if (pestana === 'leer') pintarLeer();
    }
    async function abrirVersion(ver, turno) {
      $('estadoGuardar').textContent = 'Abriendo…'; $('estadoGuardar').className = 'vd-estadoGuardar';
      try {
        const asa = typeof ver.asa === 'function' ? await ver.asa() : ver.asa;
        let bruto, lm = 0, utf8 = true;
        if (asa) { const fi = await asa.getFile(); ({ texto: bruto, utf8 } = await leerBruto(fi)); lm = fi.lastModified; } else bruto = await ver.leer();
        if (turno !== cuenta) return;
        cur.ver = ver; cur.asa = asa || null; cur.lm = lm; cur.nuevo = false; cur.bom = bruto.charCodeAt(0) === 0xFEFF; cur.crlf = bruto.includes('\r\n');
        const editable = !!(asa && ver.raiz) && utf8 && /\.(md|txt)$/i.test(ver.etiqueta || ver.ruta || '');
        cur.soloLectura = !editable; cur.motivoLectura = editable ? '' : !utf8 ? 'Solo lectura: este archivo no está en UTF-8' : asa && ver.raiz ? 'Este tipo de archivo no se edita aquí' : 'Solo lectura: elige la carpeta para poder guardar';
        raizDom.classList.toggle('vd-soloLectura', !editable); ta.readOnly = !editable; $('cabecera').readOnly = !editable;
        const n = (cur.bom ? bruto.slice(1) : bruto).replace(/\r\n/g, '\n');
        const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(n);
        cur.tieneHdr = !!m; cur.hdr = cur.oHdr = m ? m[1] : ''; cur.body = cur.oBody = m ? n.slice(m[0].length) : n; cur.cargado = true;
        puerta('');
        pintarTextoCargado();
        const b = editable ? local.leer(claveBorrador(), null) : null;
        if (b && (b.body !== cur.body || b.hdr !== cur.hdr)) {
          const r = await preguntar('Hay cambios sin guardar', '<p>De una sesión anterior quedó un borrador de esta página que no llegó a guardarse.</p>', [['Descartarlo', 'no'], ['Recuperarlo', 'si', true]]);
          if (r === 'si') { cur.body = b.body; cur.hdr = b.hdr; ta.value = b.body; $('cabecera').value = b.hdr; pintarTexto(); pintarCabeceraDatos(); } else local.quitar(claveBorrador());
        }
        actualizarEstado();
      } catch (e) {
        if (turno !== cuenta) return;
        vaciarTexto();
        if (e.name === 'NotFoundError' || e.noExiste) $('estadoGuardar').textContent = op.avisoNoMd || 'No se encuentra el texto.';
        else $('estadoGuardar').textContent = 'No se pudo leer: ' + e.message;
      }
    }
    // Empezar una transcripción nueva: no se crea el archivo hasta guardar
    async function empezarNueva(ver) {
      const P = await proyecto(ver.raiz, ver.partes);
      const cab = ver.cab || {};
      const lineas = [`fuente: ${[...ver.partes.slice(P.k, -1), ver.fotoNombre || ''].join('/')}`, `archivo: ${cab.archivo || ''}`, `fecha_doc: ${cab.fecha_doc || ''}`, `tipo: ${cab.tipo || ''}`,
        `personas: [${(cab.personas || []).join(', ')}]`, 'lugares: []', 'confianza: media', 'revisado: false'];
      cur.ver = ver; cur.asa = null; cur.lm = 0; cur.nuevo = true; cur.soloLectura = false; cur.bom = false; cur.crlf = false; cur.tieneHdr = true;
      cur.hdr = cur.oHdr = lineas.join('\n'); cur.body = cur.oBody = '## Transcripción\n\n\n\n## Extracto\n\n'; cur.cargado = true;
      raizDom.classList.remove('vd-soloLectura'); ta.readOnly = false; $('cabecera').readOnly = false;
      puerta(''); pintarTextoCargado();
      if (pestana !== 'texto') ponPestana('texto');
      ta.focus(); const k = '## Transcripción\n\n'.length; ta.setSelectionRange(k, k);
    }
    let versiones = [];
    function pintarVersiones() {
      const v = $('version'), nueva = pagina?.nueva && versiones.length && !pagina.tieneDeLaFoto;
      if (versiones.length > 1 || nueva) {
        v.style.display = '';
        v.innerHTML = versiones.map((x, k) => `<option value="${k}">${esc(x.etiqueta)}</option>`).join('') + (nueva ? '<option value="nueva">+ Nueva, solo de esta foto</option>' : '');
        v.value = String(Math.max(0, versiones.indexOf(cur.ver)));
      } else v.style.display = 'none';
    }
    $('version').onchange = async e => {
      const val = e.target.value;
      if (!await puedoSalir()) { pintarVersiones(); return; }
      if (val === 'nueva') { const n = await pagina.nueva(); if (n?.raiz) await empezarNueva(n); return; }
      await abrirVersion(versiones[+val], cuenta); pintarVersiones();
    };
    async function cargarTexto(p, turno) {
      vaciarTexto(); puerta(''); $('version').style.display = 'none';
      let l = [];
      try { l = (typeof p.versiones === 'function' ? await p.versiones() : p.versiones) || []; }
      catch (e) { if (turno === cuenta) $('estadoGuardar').textContent = 'No se pudo leer: ' + e.message; return; }
      if (turno !== cuenta) return;
      versiones = l;
      if (l.length) { await abrirVersion(l[0], turno); if (turno === cuenta) pintarVersiones(); pintarAnillo(); return; }
      if (p.sinTexto) { pintarAnillo(); puerta('Sin transcripción', ''); p.sinTexto($('puertaCaja')); return; }
      const n = p.nueva ? await p.nueva().catch(() => null) : null;
      if (turno !== cuenta) return;
      pintarAnillo();
      if (n?.raiz) puerta('Sin transcripción', 'Esta foto aún no tiene texto. Se crea un .md a su lado, con el mismo nombre, al guardar.', 'Empezar a transcribir', () => empezarNueva(n));
      else puerta('Sin transcripción', p.foto ? 'Esta foto aún no tiene texto.' : '');
    }

    /* ----- Guardar ----- */
    function componer(hdr, body) { const n = (hdr || cur.tieneHdr ? `---\n${hdr}\n---\n` : '') + body; return (cur.bom ? '﻿' : '') + (cur.crlf ? n.replace(/\n/g, '\r\n') : n); }
    async function guardar() {
      if (!cur.cargado || !hayCambios()) return true;
      const ver = cur.ver;
      try {
        await pedirEscritura(ver.raiz);
        const P = await proyecto(ver.raiz, ver.partes), rel = ver.partes.slice(P.k).join('/');
        const nombre = ver.partes[ver.partes.length - 1], sello = new Date();
        const hhmmss = `${dosd(sello.getHours())}${dosd(sello.getMinutes())}${dosd(sello.getSeconds())}`;
        const cambioTexto = cur.body !== cur.oBody; let copia = '', asa = cur.asa;
        if (cur.nuevo) {
          // Crear sin pisar: si entre tanto ha aparecido el archivo, se abre ese y lo tecleado queda de borrador
          let ya = null; try { ya = await archivoEn(ver.raiz, ver.partes); } catch (e) { if (e.name !== 'NotFoundError') throw e; }
          if (ya) throw new Error(`Ya existe «${nombre}»: alguien la ha creado mientras escribías. Tu texto sigue aquí; cópialo y vuelve a abrir la foto.`);
          asa = await archivoEn(ver.raiz, ver.partes, true);
        } else {
          const ahora = await asa.getFile();
          if (ahora.lastModified !== cur.lm) {
            const r = await preguntar('Este archivo ha cambiado', '<p>Alguien lo ha modificado desde que lo abriste, quizá desde el otro ordenador. Si guardas, lo tuyo sustituye a lo otro, aunque queda copia de lo que hay ahora.</p>', [['Cancelar', null], ['Guardar lo mío', 'si', true]]);
            if (r !== 'si') return false;
          }
          if (cambioTexto) {
            const c = [...P.copias, hoy(), `${hhmmss}_${nombre}`];
            await escribir(await archivoEn(ver.raiz, [...P.base, ...c], true), await ahora.arrayBuffer());
            copia = c.join('/');
          }
        }
        if (!cur.tieneHdr && cur.hdr) cur.hdr = 'fuente: ' + (pagina?.ruta || rel) + '\n' + cur.hdr;
        const salida = componer(cur.hdr, cur.body);
        await escribir(asa, salida);
        const leida = (await leerBruto(await asa.getFile())).texto;
        if (leida !== salida) throw new Error('lo leído no coincide con lo escrito');
        const acc = [], rA = !cur.nuevo && revisadoEn(cur.oHdr), rN = revisadoEn(cur.hdr), aA = afectaEn(cur.oHdr), aN = afectaEn(cur.hdr);
        if (rN !== rA) acc.push(rN ? 'revisada' : 'quitar_revisada');
        if (aN !== aA) acc.push(aN ? 'afecta_arbol' : 'quitar_afecta');
        if (cur.nuevo) acc.push('creada'); else if (cambioTexto || !acc.length) acc.push('guardada');
        try { await apuntarRegistro(ver.raiz, [...P.base, ...P.registro], [`${hoy()} ${dosd(sello.getHours())}:${dosd(sello.getMinutes())}:${dosd(sello.getSeconds())}`, rel, acc.join('+'), cambioTexto ? 'si' : 'no', copia, yamlLee(cur.hdr, 'nota_revision')]); }
        catch (e) { toast('Guardado, pero no se pudo apuntar en el registro: ' + e.message, 6000); }
        const eraNuevo = cur.nuevo;
        cur.asa = asa; cur.lm = (await asa.getFile()).lastModified; cur.tieneHdr = !!cur.hdr; cur.oHdr = cur.hdr; cur.oBody = cur.body; cur.nuevo = false;
        local.quitar(claveBorrador());
        if (eraNuevo) { ver.asa = asa; ver.leer = async () => (await asa.getFile()).text(); versiones = [ver, ...versiones]; if (pagina) pagina.tieneDeLaFoto = true; pintarVersiones(); }
        pintarCabeceraDatos(); actualizarEstado();
        const m = medirTexto(cur.body);
        op.alGuardar?.(pagina, { rev: rN, afe: aN, conf: confDe(cur.hdr), ...m });
        return true;
      } catch (e) {
        await preguntar('No se ha podido guardar', `<p>${esc(e.message)}</p><p>Tu texto sigue aquí y queda como borrador. Si Dropbox está sincronizando este archivo, espera unos segundos y vuelve a pulsar Guardar.</p>`, [['Entendido', 1, true]]);
        return false;
      }
    }
    async function puedoSalir() {
      if (!hayCambios()) return true;
      const r = await preguntar('Tienes cambios sin guardar', `<p>${esc(cur.ver?.etiqueta || '')}</p>`, [['Seguir aquí', null], ['Descartar', 'no'], ['Guardar', 'si', true]]);
      if (r === 'si') return guardar();
      if (r === 'no') { local.quitar(claveBorrador()); cur.body = cur.oBody; cur.hdr = cur.oHdr; return true; }
      return false;
    }
    $('guardar').onclick = async () => { if (!hayCambios()) { toast('No hay cambios que guardar.', 1500); return; } if (await guardar()) toast('Guardado.', 1500); };
    $('btnRev').onclick = async () => {
      if (!cur.cargado) return;
      if (!revisadoEn(cur.hdr)) { cur.hdr = yamlPon(yamlPon(cur.hdr, 'revisado', 'true'), 'revisado_fecha', hoy()); $('cabecera').value = cur.hdr; }
      if (await guardar() && op.haySiguiente?.()) op.ir?.(1);
    };
    $('selloRev').onclick = async () => {
      if (cur.soloLectura) return;
      const r = await preguntar('¿Quitar la marca de revisada?', '', [['No', null], ['Quitarla', 'si', true]]);
      if (r === 'si') { cur.hdr = yamlQuita(yamlPon(cur.hdr, 'revisado', 'false'), 'revisado_fecha'); $('cabecera').value = cur.hdr; await guardar(); }
    };
    addEventListener('beforeunload', e => { if (hayCambios()) { e.preventDefault(); e.returnValue = ''; } });

    /* ----- Navegación y teclado ----- */
    $('ant').onclick = () => op.ir?.(-1); $('sig').onclick = () => op.ir?.(1);
    $('paginaDoc').onchange = async e => { const val = e.target.value; if (await puedoSalir()) op.irHermana?.(val); else e.target.value = pagina?.actual; };
    addEventListener('keydown', e => {
      if (!activo() || $('dialogo').open) return;
      const k = e.key, enForm = /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement?.tagName || '');
      if (e.ctrlKey && !e.altKey) {
        if (k === 's' || k === 'S') { e.preventDefault(); $('guardar').click(); return; }
        if (k === 'Enter') { e.preventDefault(); if (!cur.soloLectura) $('btnRev').click(); return; }
        if (k === 'f' || k === 'F') { e.preventDefault(); abrirBuscar(); return; }
        return;
      }
      if (e.altKey) {
        const u = lienzo.clientHeight * .35, acc = { ArrowRight: () => op.ir?.(1), ArrowLeft: () => op.ir?.(-1), ArrowDown: () => lienzo.scrollBy({ top: u, behavior: 'smooth' }), ArrowUp: () => lienzo.scrollBy({ top: -u, behavior: 'smooth' }),
          q: ponDuda, i: () => insertar('[ilegible]'), b: ponCorchetes, d: sigDuda, r: () => $('bRegla').click(), '0': ajustarAncho, '+': () => zoomEn(V.z * 1.25), '=': () => zoomEn(V.z * 1.25), '-': () => zoomEn(V.z / 1.25) }[k.length === 1 ? k.toLowerCase() : k];
        if (acc) { e.preventDefault(); acc(); }
        return;
      }
      if (k === 'Escape') {
        if ($('ajustes').classList.contains('abierto')) { $('ajustes').classList.remove('abierto'); $('bAjustes').classList.remove('activo'); return; }
        if ($('barraBuscar').classList.contains('abierta')) { $('barraBuscar').classList.remove('abierta'); return; }
        if (quitarPersona()) return;
        op.alEscape?.(); return;
      }
      if (enForm) return;
      // Sin nada que desplazar a los lados (la foto cabe de ancho), ← y → pasan de página
      const cabeAncho = hoja.offsetWidth <= lienzo.clientWidth + 1;
      const u = lienzo.clientHeight * .35, acc = { ArrowDown: () => lienzo.scrollBy({ top: u, behavior: 'smooth' }), ArrowUp: () => lienzo.scrollBy({ top: -u, behavior: 'smooth' }),
        ArrowLeft: () => cabeAncho ? op.ir?.(-1) : lienzo.scrollBy({ left: -u, behavior: 'smooth' }), ArrowRight: () => cabeAncho ? op.ir?.(1) : lienzo.scrollBy({ left: u, behavior: 'smooth' }),
        PageDown: () => op.ir?.(1), PageUp: () => op.ir?.(-1),
        ' ': () => lienzo.scrollBy({ top: lienzo.clientHeight * .85, behavior: 'smooth' }), '+': () => zoomEn(V.z * 1.25), '-': () => zoomEn(V.z / 1.25), '0': ajustarAncho }[k];
      if (acc) { e.preventDefault(); acc(); }
    });
    $('ayuda').onclick = () => preguntar('Cómo se usa', `
<table>
<tr><td><b>Imagen</b></td><td></td></tr>
<tr><td>Rueda · doble clic</td><td>acercar o alejar en ese punto</td></tr>
<tr><td>Arrastrar · <kbd>Mayús</kbd>+rueda</td><td>moverse por la foto</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>↑</kbd> <kbd>↓</kbd></td><td>subir y bajar sin soltar el texto</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>+</kbd> <kbd>−</kbd> · <kbd>Alt</kbd>+<kbd>0</kbd></td><td>zoom · ancho de página</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>R</kbd></td><td>regla de lectura</td></tr>
<tr><td><b>Texto</b></td><td></td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>Q</kbd> · <kbd>Alt</kbd>+<kbd>I</kbd> · <kbd>Alt</kbd>+<kbd>B</kbd></td><td>[?] · [ilegible] · [corchetes]</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>D</kbd></td><td>siguiente duda</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>F</kbd></td><td>buscar y cambiar</td></tr>
<tr><td><b>Páginas</b></td><td></td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>guardar</td></tr>
<tr><td><kbd>Ctrl</kbd>+<kbd>Intro</kbd></td><td>marcar revisada (y pasar a la siguiente)</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>←</kbd> <kbd>→</kbd> · <kbd>Re Pág</kbd> <kbd>Av Pág</kbd></td><td>página anterior y siguiente</td></tr>
</table>
<p><b>El porcentaje</b> sirve para ordenar el trabajo, no es una medida exacta. «≈» es una estimación: parte de 92 si la legibilidad es alta y de 90 si es media, sacados de una muestra de 27 páginas; 65 si es baja, cifra supuesta sin medir. Resta lo marcado como dudoso o ilegible. «Medida» es lo hallado en esa página en la muestra, por agentes de Claude. «Revisada» es lo que has cotejado tú.</p>
<p><b>Al guardar</b> se cambia el <code>.md</code> que está junto a la foto (la primera vez, el navegador pide permiso para escribir en la carpeta). Si cambias el texto, antes se hace copia, y cada cambio se apunta en <code>revisiones.csv</code>. El árbol no se toca: lo marcado con ⚑ queda para decidirlo luego.</p>`, [['Entendido', 1, true]]);

    /* ----- Abrir una página ----- */
    function abrir(p) {
      const turno = ++cuenta;
      pagina = p;
      $('tTitulo').textContent = p.titulo || ''; $('tRuta').textContent = p.ruta || ''; $('nombreFoto').textContent = p.nombre || ''; $('dTitulo').textContent = p.titulo || '';
      raizDom.classList.toggle('vd-soloTexto', !p.foto);
      const sel = $('paginaDoc'), h = p.hermanas || [];
      sel.innerHTML = h.map(x => `<option value="${esc(x.valor)}">${esc(x.etiqueta)}</option>`).join('');
      sel.style.display = h.length > 1 ? '' : 'none'; if (h.length) sel.value = p.actual;
      $('ant').style.display = $('sig').style.display = op.ir ? '' : 'none';
      pintarGente(); pintarAvisos();
      if (p.foto) cargarImagen(p, turno); else { V.W = 0; img.removeAttribute('src'); }
      const t = cargarTexto(p, turno);
      pintarBtnRev(); pintarAnillo();
      return t;
    }

    pintarFiltros(); pintarRegla(); pintarLetra(); ponPestana(local.leer('pestana', 'texto'));
    vaciarTexto();

    return {
      abrir, puedoSalir, toast, preguntar, puerta, guardar,
      hayCambios,
      ranura: n => $(n),
      get pagina() { return pagina; },
      ponExtras(ex) { if (!pagina) return; Object.assign(pagina, ex); pintarGente(); pintarAvisos(); pintarAnillo(); },
      alRedimensionar() { pintarMini(); if (V.W) ajustarAncho(); },
      refrescarBotones: pintarBtnRev,
      // Para las pruebas
      fijarTexto(t) { ta.value = t; alCambiar(); },
      texto: () => cur.body, encabezado: () => cur.hdr,
    };
  }

  globalThis.VisorDoc = { crear, md, esc, medirTexto, fiabilidad, local, proyecto, buscarNombre };
})();
