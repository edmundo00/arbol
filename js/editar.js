// Cambios en el GEDCOM: personas, familias y enlaces. Cada cambio es una «operación» que se puede deshacer.
// Solo se tocan las líneas necesarias: el resto de cada registro se conserva tal cual (con sus etiquetas propias).
import { Registro, hijo, hijos } from './gedcom.js?v=202611050015';

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'das', 'dos', 'van', 'von', 'der', 'den', 'di']);

// «de la Fuente López» → ['de la Fuente', 'López'];  «Houwelingen y Sotomayor» → ['Houwelingen', 'y Sotomayor']
export function partirApellidos(ap) {
  const w = (ap || '').trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < w.length - 1 && PARTICULAS.has(w[i].toLowerCase())) i++;
  return [w.slice(0, i + 1).join(' '), w.slice(i + 1).join(' ')];
}
export const primerApellido = ap => partirApellidos(ap)[0];
export const segundoApellido = ap => primerApellido(partirApellidos(ap)[1]);

// Apellidos a la española
export function apellidosHijo(padre, madre) { return [primerApellido(padre?.apellidos), primerApellido(madre?.apellidos)].filter(Boolean).join(' '); }
export function apellidosPadre(persona) { return primerApellido(persona?.apellidos); }
export function apellidosMadre(persona) { return segundoApellido(persona?.apellidos); }

const nodo = (nivel, tag, valor = '', hijosN = []) => ({ nivel, xref: null, tag, valor, raw: null, hijos: hijosN, cambiado: true });

function hoy() {
  const d = new Date(), M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const t = [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => String(x).padStart(2, '0')).join(':');
  return { fecha: `${d.getDate()} ${M[d.getMonth()]} ${d.getFullYear()}`, hora: t };
}

// Como partir() de documentos_ged.py: las líneas de más de 255 caracteres se parten con CONC a unos 240, sin cortar junto a un espacio.
export function partirLargas(texto, maximo = 240) {
  const out = [];
  for (const l of texto.split('\r\n')) {
    if (l.length <= 255) { out.push(l); continue; }
    const m = /^(\d+) (@[^@]+@ )?(\w+) ?/.exec(l);
    const nivel = +m[1], cab = l.slice(0, m[0].length);
    let resto = l.slice(m[0].length), primero = true;
    while (resto) {
      let corte = Math.min(maximo, resto.length);
      while (corte > 0 && corte < resto.length && (resto[corte - 1] === ' ' || resto[corte] === ' ')) corte--;
      if (corte === 0) corte = Math.min(maximo, resto.length);
      const trozo = resto.slice(0, corte); resto = resto.slice(corte);
      out.push(primero ? cab + trozo : `${nivel + 1} CONC ${trozo}`); primero = false;
    }
  }
  return out.join('\r\n');
}

export class Editor {
  constructor(ged, arbol) {
    this.ged = ged; this.arbol = arbol;
    this.historial = [];   // operaciones hechas: { desc, antes: Map(xref → texto o null si se creó), despues }
    this.tx = null;
  }

  // ---------- Operaciones ----------
  empezar(desc) { if (this.tx) throw new Error('Ya hay un cambio a medias.'); this.tx = { desc, antes: new Map(), cabecera: null, log: [] }; }
  cancelar() { if (this.tx) { const tx = this.tx; this.restaurar(tx); this.tx = null; this.refrescar([...tx.antes.keys()]); } }
  terminar() {
    const tx = this.tx; this.tx = null;
    for (const x of tx.antes.keys()) { const r = this.ged.porXref.get(x); if (r && r.modificado) this.sello(r); }
    this.historial.push(tx);
    this.refrescar([...tx.antes.keys()]);
    return tx;
  }
  // Guarda el texto de un registro antes de tocarlo (una vez por operación).
  tocar(xref) {
    const r = this.ged.porXref.get(xref);
    if (!r) throw new Error(`No existe ${xref}.`);
    if (!this.tx.antes.has(xref)) this.tx.antes.set(xref, r.texto());
    r.arbol; r.modificado = true;
    return r;
  }
  // Deshace la última operación (en memoria; después hay que guardar).
  deshacer() {
    const tx = this.historial.pop();
    if (!tx) return null;
    this.restaurar(tx);
    this.refrescar([...tx.antes.keys()]);
    return tx;
  }
  restaurar(tx) {
    const idx = x => this.ged.registros.findIndex(r => r.xref === x);
    // Altas y bajas, al revés de como se hicieron
    for (const op of [...(tx.log || [])].reverse()) {
      if (op.tipo === 'crear') { const i = idx(op.xref); if (i >= 0) this.ged.registros.splice(i, 1); this.ged.porXref.delete(op.xref); }
      else if (op.tipo === 'borrar' && tx.antes.get(op.xref) != null) {
        const r = new Registro(tx.antes.get(op.xref), this.ged.nl);
        this.ged.registros.splice(op.indice, 0, r); this.ged.porXref.set(op.xref, r);
      }
    }
    // Y el texto de antes de los registros tocados
    for (const [x, texto] of tx.antes) {
      if (texto === null) continue;
      const i = idx(x);
      if (i >= 0) { const r = new Registro(texto, this.ged.nl); this.ged.registros[i] = r; this.ged.porXref.set(x, r); }
    }
    if (tx.cabecera !== null && tx.cabecera !== undefined) {
      const i = this.ged.registros.findIndex(r => r.tipo === 'HEAD');
      this.ged.registros[i] = new Registro(tx.cabecera, this.ged.nl);
    }
  }
  // Pone al día las personas y familias tocadas en el modelo (sin releer todo el árbol).
  refrescar(xrefs) {
    for (const x of xrefs) {
      const r = this.ged.porXref.get(x);
      if (!r) { this.arbol.personas.delete(x); this.arbol.familias.delete(x); continue; }
      if (r.tipo === 'INDI') this.arbol.personas.set(x, this.arbol.persona(r));
      else if (r.tipo === 'FAM') this.arbol.familias.set(x, this.arbol.familia(r));
    }
    this.arbol.lineas = {};
    this.arbol.ponerRaices(this.arbol.raices.map(r => r.id));
  }
  // Fecha de último cambio (CHAN), como hace Family Historian.
  sello(r) {
    const a = r.arbol, { fecha, hora } = hoy();
    let c = hijo(a, 'CHAN');
    if (!c) { c = nodo(1, 'CHAN'); a.hijos.push(c); }
    c.cambiado = true;
    c.hijos = [nodo(2, 'DATE', fecha, [nodo(3, 'TIME', hora)])];
  }

  // ---------- Números nuevos (@I13400@, @F5040@) ----------
  nuevoXref(letra) {
    let max = 0;
    const re = new RegExp(`^@${letra}(\\d+)@$`);
    for (const x of this.ged.porXref.keys()) { const m = re.exec(x); if (m) max = Math.max(max, +m[1]); }
    // Family Historian apunta en la cabecera (_USED) los últimos números usados: no se repiten.
    const head = this.ged.registros.find(r => r.tipo === 'HEAD');
    const used = head && hijo(head.arbol, '_USED');
    const m = used && new RegExp(`(?:^|,)${letra}(\\d+)`).exec(used.valor);
    if (m) max = Math.max(max, +m[1]);
    const n = max + 1;
    if (used) {
      if (this.tx.cabecera === null || this.tx.cabecera === undefined) this.tx.cabecera = head.texto();
      used.valor = m ? used.valor.replace(new RegExp(`(^|,)${letra}\\d+`), `$1${letra}${n}`) : used.valor + `,${letra}${n}`;
      used.cambiado = true; head.modificado = true;
    }
    return `@${letra}${n}@`;
  }

  crear(tipo, letra, hijosN) {
    const xref = this.nuevoXref(letra);
    const lineas = [`0 ${xref} ${tipo}`];
    const volcar = n => { lineas.push(`${n.nivel} ${n.tag}${n.valor !== '' ? ' ' + n.valor : ''}`); n.hijos.forEach(volcar); };
    hijosN.forEach(volcar);
    const r = new Registro(lineas.join(this.ged.nl) + this.ged.nl, this.ged.nl);
    // Las personas nuevas van detrás de la última persona; las familias, detrás de la última familia.
    let i = -1;
    this.ged.registros.forEach((x, k) => { if (x.tipo === tipo) i = k; });
    if (i < 0) i = this.ged.registros.findIndex(x => x.tipo === 'TRLR') - 1;
    this.ged.registros.splice(i + 1, 0, r);
    this.ged.porXref.set(xref, r);
    this.tx.antes.set(xref, null);
    this.tx.log.push({ tipo: 'crear', xref });
    r.arbol; r.modificado = true;
    return xref;
  }

  // Quita un registro entero (se puede deshacer).
  eliminar(xref) {
    this.tocar(xref);
    const i = this.ged.registros.findIndex(r => r.xref === xref);
    if (i < 0) return;
    this.ged.registros.splice(i, 1); this.ged.porXref.delete(xref);
    this.tx.log.push({ tipo: 'borrar', xref, indice: i });
  }

  // Todas las líneas del archivo que apuntan a un registro: [{ r, nodo, padre }]
  referencias(xref) {
    const out = [];
    for (const r of this.ged.registros) {
      if (r.xref === xref || (!r.modificado && !r.raw.includes(xref))) continue;
      const ver = (n, padre) => { if (n.valor === xref) out.push({ r, nodo: n, padre }); n.hijos.forEach(h => ver(h, n)); };
      ver(r.arbol, null);
    }
    return out;
  }

  quitarLinea(xref, tag, valor) {
    const r = this.tocar(xref), h = r.arbol.hijos;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].tag === tag && h[i].valor === valor) h.splice(i, 1);
  }

  // Inserta una línea de nivel 1 en el sitio de costumbre: detrás de las de su clase o delante de las que van después.
  insertar(r, n, despues, antes) {
    const h = r.arbol.hijos;
    let i = -1;
    for (const t of despues) { h.forEach((x, k) => { if (x.tag === t) i = Math.max(i, k); }); if (i >= 0) break; }
    if (i < 0) { const k = h.findIndex(x => antes.includes(x.tag) || (x.tag || '').startsWith('_')); i = k < 0 ? h.length - 1 : k - 1; }
    h.splice(i + 1, 0, n);
  }
  enlazar(xref, tag, valor) {
    const r = this.tocar(xref);
    if (hijos(r.arbol, tag).some(x => x.valor === valor)) return;
    const n = nodo(1, tag, valor);
    if (r.tipo === 'INDI') {
      if (tag === 'FAMC') this.insertar(r, n, ['FAMC'], ['FAMS', 'NOTE', 'SOUR', 'OBJE', 'CHAN', 'REFN', 'RIN']);
      else this.insertar(r, n, ['FAMS', 'FAMC'], ['NOTE', 'SOUR', 'OBJE', 'CHAN', 'REFN', 'RIN']);
    } else {
      if (tag === 'CHIL') this.insertar(r, n, ['CHIL', 'WIFE', 'HUSB'], ['NOTE', 'SOUR', 'OBJE', 'CHAN']);
      else if (tag === 'WIFE') this.insertar(r, n, ['HUSB'], ['CHIL', 'NOTE', 'SOUR', 'OBJE', 'CHAN']);
      else this.insertar(r, n, [], ['WIFE', 'CHIL', 'NOTE', 'SOUR', 'OBJE', 'CHAN']);
    }
  }

  // Evento (BIRT, DEAT, MARR…): pone o quita fecha y lugar sin tocar sus notas ni fuentes.
  evento(xref, tag, fecha, lugar) {
    const r = this.tocar(xref), a = r.arbol;
    let e = hijo(a, tag);
    if (!e && !fecha && !lugar) return;
    if (!e) {
      e = nodo(1, tag);
      if (r.tipo === 'INDI') this.insertar(r, e, tag === 'BIRT' ? ['SEX', 'NAME'] : ['BURI', 'DEAT', 'BAPM', 'CHR', 'BIRT', 'SEX', 'NAME'], ['FAMC', 'FAMS', 'NOTE', 'SOUR', 'OBJE', 'CHAN']);
      else this.insertar(r, e, [], ['HUSB', 'WIFE', 'CHIL', 'NOTE', 'SOUR', 'OBJE', 'CHAN']);
    }
    for (const [t, v] of [['DATE', fecha], ['PLAC', lugar]]) {
      const x = hijo(e, t);
      if (v) { if (x) { if (x.valor !== v) { x.valor = v; x.cambiado = true; } } else { e.hijos.splice(t === 'DATE' ? 0 : e.hijos.findIndex(z => z.tag !== 'DATE') < 0 ? e.hijos.length : e.hijos.findIndex(z => z.tag !== 'DATE'), 0, nodo(2, t, v)); e.cambiado = true; } }
      else if (x) { e.hijos.splice(e.hijos.indexOf(x), 1); e.cambiado = true; }
    }
    if (!e.hijos.length && !e.valor) a.hijos.splice(a.hijos.indexOf(e), 1);
  }

  // Fecha y lugar de un hecho ya localizado (nodo de nivel 1).
  fechaLugar(e, fecha, lugar) {
    for (const [t, v] of [['DATE', fecha], ['PLAC', lugar]]) {
      const x = hijo(e, t);
      if (v) {
        if (x) { if (x.valor !== v) { x.valor = v; x.cambiado = true; } }
        else { const k = t === 'DATE' ? 0 : (e.hijos.findIndex(z => z.tag !== 'DATE') + 1 || e.hijos.length + 1) - 1; e.hijos.splice(k, 0, nodo(2, t, v)); }
      } else if (x) e.hijos.splice(e.hijos.indexOf(x), 1);
    }
  }

  // Texto largo → valor de la línea y líneas CONT/CONC (sin partir nunca junto a un espacio).
  static texto(nivel, texto) {
    const lineas = String(texto || '').replace(/\r\n?/g, '\n').split('\n'), hijosN = [];
    let primero = null;
    const trozos = l => {
      const out = [];
      while (l.length > 200) {
        let k = 200;
        while (k > 20 && (l[k - 1] === ' ' || l[k] === ' ')) k--;
        out.push(l.slice(0, k)); l = l.slice(k);
      }
      out.push(l); return out;
    };
    lineas.forEach((l, i) => {
      const t = trozos(l);
      if (i === 0) primero = t[0]; else hijosN.push(nodo(nivel + 1, 'CONT', t[0]));
      t.slice(1).forEach(x => hijosN.push(nodo(nivel + 1, 'CONC', x)));
    });
    return { valor: primero ?? '', hijos: hijosN };
  }
  // Pone un texto en un nodo (nota): cambia su valor y sus CONT/CONC, sin tocar lo demás (fuentes de la nota…).
  ponerTexto(n, texto) {
    const t = Editor.texto(n.nivel, texto);
    n.valor = t.valor; n.cambiado = true;
    n.hijos = [...t.hijos, ...n.hijos.filter(h => h.tag !== 'CONT' && h.tag !== 'CONC')];
  }

  // ---------- Lo que hace el usuario ----------
  datosPersona(xref, { nombre, apellidos, sexo, nac, def }) {
    const r = this.tocar(xref), a = r.arbol;
    let n = hijo(a, 'NAME');
    const sufijo = n ? (/\/[^/]*\/(.*)$/.exec(n.valor)?.[1] || '') : '';
    const valorNombre = `${nombre.trim()} /${apellidos.trim()}/${sufijo}`.replace(/^ /, '');
    if (!n) { n = nodo(1, 'NAME', valorNombre); a.hijos.unshift(n); }
    else if (n.valor !== valorNombre) {
      n.valor = valorNombre; n.cambiado = true;
      for (const g of hijos(n, 'GIVN')) { g.valor = nombre.trim(); g.cambiado = true; }
      for (const g of hijos(n, 'SURN')) { g.valor = apellidos.trim(); g.cambiado = true; }
    }
    if (sexo) {
      const s = hijo(a, 'SEX');
      if (s) { if (s.valor !== sexo) { s.valor = sexo; s.cambiado = true; } }
      else this.insertar(r, nodo(1, 'SEX', sexo), ['NAME'], []);
    }
    if (nac) this.evento(xref, 'BIRT', nac.fecha, nac.lugar);
    if (def) this.evento(xref, 'DEAT', def.fecha, def.lugar);
  }

  nuevaPersona(datos) {
    const xref = this.crear('INDI', 'I', [nodo(1, 'NAME', `${datos.nombre.trim()} /${datos.apellidos.trim()}/`), nodo(1, 'SEX', datos.sexo || 'U')]);
    this.datosPersona(xref, datos);
    return xref;
  }

  nuevaFamilia(marido, mujer) {
    const h = [];
    if (marido) h.push(nodo(1, 'HUSB', marido));
    if (mujer) h.push(nodo(1, 'WIFE', mujer));
    const f = this.crear('FAM', 'F', h);
    if (marido) this.enlazar(marido, 'FAMS', f);
    if (mujer) this.enlazar(mujer, 'FAMS', f);
    return f;
  }

  // Hijo: en la familia indicada, o en una nueva con solo esta persona como padre o madre.
  hijo(personaId, famId, hijoId) {
    const p = this.arbol.p(personaId), h = this.arbol.p(hijoId);
    if (h?.famc.length) throw new Error(`${h.nombre} ${h.apellidos} ya tiene padres en el árbol.`);
    if (hijoId === personaId) throw new Error('Una persona no puede ser hija de sí misma.');
    if (!famId) famId = this.nuevaFamilia(p.sexo === 'F' ? null : personaId, p.sexo === 'F' ? personaId : null);
    this.enlazar(famId, 'CHIL', hijoId);
    this.enlazar(hijoId, 'FAMC', famId);
    return famId;
  }

  // Padre o madre de alguien que no lo tiene.
  progenitor(personaId, rol, padreId) {
    if (padreId === personaId) throw new Error('Una persona no puede ser su propio padre.');
    const p = this.arbol.p(personaId);
    let fam = p.famc.map(f => this.arbol.f(f)).find(Boolean);
    const campo = rol === 'HUSB' ? 'marido' : 'mujer';
    if (fam && fam[campo]) throw new Error(`Ya tiene ${rol === 'HUSB' ? 'padre' : 'madre'}.`);
    if (fam) {
      this.enlazar(fam.id, rol, padreId);
      this.enlazar(padreId, 'FAMS', fam.id);
      return fam.id;
    }
    const f = this.nuevaFamilia(rol === 'HUSB' ? padreId : null, rol === 'WIFE' ? padreId : null);
    this.enlazar(f, 'CHIL', personaId);
    this.enlazar(personaId, 'FAMC', f);
    return f;
  }

  // ---------- Quitar enlaces y borrar ----------
  // Una familia que se queda sin nadie (o con una sola persona y sin datos propios) se quita.
  limpiarFamilia(famId) {
    const r = this.ged.porXref.get(famId);
    if (!r) return;
    const h = r.arbol.hijos;
    const miembros = h.filter(x => ['HUSB', 'WIFE', 'CHIL'].includes(x.tag));
    const otros = h.filter(x => !['HUSB', 'WIFE', 'CHIL', 'CHAN', 'RIN'].includes(x.tag) && !(x.tag || '').startsWith('_'));
    if (miembros.length > 1 || (miembros.length === 1 && otros.length)) return;
    for (const m of miembros) this.quitarLinea(m.valor, m.tag === 'CHIL' ? 'FAMC' : 'FAMS', famId);
    if (!this.referencias(famId).length) this.eliminar(famId);
  }
  quitarHijo(famId, hijoId) {
    this.quitarLinea(famId, 'CHIL', hijoId);
    this.quitarLinea(hijoId, 'FAMC', famId);
    this.limpiarFamilia(famId);
  }
  quitarConyuge(famId, personaId) {
    this.quitarLinea(famId, 'HUSB', personaId);
    this.quitarLinea(famId, 'WIFE', personaId);
    this.quitarLinea(personaId, 'FAMS', famId);
    this.limpiarFamilia(famId);
  }
  borrarPersona(id) {
    const p = this.arbol.p(id);
    for (const f of [...p.famc]) this.quitarHijo(f, id);
    for (const f of [...p.fams]) this.quitarConyuge(f, id);
    const quedan = this.referencias(id);
    if (quedan.length) throw new Error(`No se puede borrar: la nombran otras líneas del archivo (${quedan.slice(0, 3).map(x => (x.r.xref || x.r.tipo) + ' ' + x.nodo.tag).join(', ')}).`);
    // Sus notas propias (registros NOTE que solo usa ella) se van con ella.
    const notas = hijos(this.ged.porXref.get(id).arbol, 'NOTE').map(n => n.valor).filter(v => /^@[^@]+@$/.test(v));
    this.eliminar(id);
    for (const n of notas) if (!this.referencias(n).length) this.eliminar(n);
  }

  // ---------- Hechos (nacimiento, bautismo, boda, oficio…) ----------
  // nodo: el hecho que se cambia (null = nuevo). datos: { tag, tipo, fecha, lugar, valor, nota }
  hecho(xref, nodoHecho, d) {
    const r = this.tocar(xref), a = r.arbol;
    let e = nodoHecho;
    if (!e) {
      e = nodo(1, d.tag, d.valor || '');
      if (r.tipo === 'INDI') this.insertar(r, e, [], ['FAMC', 'FAMS', 'NOTE', 'SOUR', 'OBJE', 'CHAN', 'REFN', 'RIN']);
      else this.insertar(r, e, [], ['HUSB', 'WIFE', 'CHIL', 'NOTE', 'SOUR', 'OBJE', 'CHAN']);
    } else if (!a.hijos.includes(e)) throw new Error('Ese hecho ya no está en la ficha. Vuelve a abrirla.');
    if (e.tag !== d.tag) { e.tag = d.tag; e.cambiado = true; }
    if ((e.valor || '') !== (d.valor || '')) { e.valor = d.valor || ''; e.cambiado = true; }
    const t = hijo(e, 'TYPE');
    if (d.tipo) { if (t) { if (t.valor !== d.tipo) { t.valor = d.tipo; t.cambiado = true; } } else e.hijos.unshift(nodo(2, 'TYPE', d.tipo)); }
    else if (t && d.tipo !== undefined) e.hijos.splice(e.hijos.indexOf(t), 1);
    this.fechaLugar(e, d.fecha, d.lugar);
    // Nota del hecho: la primera nota escrita dentro (no las que apuntan a un registro NOTE)
    const n = e.hijos.find(x => x.tag === 'NOTE' && !/^@[^@]+@$/.test(x.valor));
    if (d.nota && d.nota.trim()) { if (n) this.ponerTexto(n, d.nota.trim()); else { const t2 = Editor.texto(2, d.nota.trim()); e.hijos.push(nodo(2, 'NOTE', t2.valor, t2.hijos)); } }
    else if (n && d.nota !== undefined) e.hijos.splice(e.hijos.indexOf(n), 1);
  }
  borrarHecho(xref, nodoHecho) {
    const a = this.tocar(xref).arbol, i = a.hijos.indexOf(nodoHecho);
    if (i < 0) throw new Error('Ese hecho ya no está en la ficha.');
    a.hijos.splice(i, 1);
  }

  // ---------- Notas de la persona ----------
  // nodoNota: línea «1 NOTE» de la persona (null = nueva). Si apunta a un registro NOTE, se cambia el registro.
  nota(xref, nodoNota, texto) {
    const r = this.tocar(xref), a = r.arbol;
    if (!nodoNota) {
      const t = Editor.texto(1, texto.trim());
      this.insertar(r, nodo(1, 'NOTE', t.valor, t.hijos), ['NOTE', 'FAMS', 'FAMC'], ['SOUR', 'OBJE', 'CHAN', 'REFN', 'RIN']);
      return;
    }
    if (!a.hijos.includes(nodoNota)) throw new Error('Esa nota ya no está en la ficha. Vuelve a abrirla.');
    if (/^@[^@]+@$/.test(nodoNota.valor)) { const rn = this.tocar(nodoNota.valor); this.ponerTexto(rn.arbol, texto.trim()); }
    else this.ponerTexto(nodoNota, texto.trim());
  }
  borrarNota(xref, nodoNota) {
    const a = this.tocar(xref).arbol, i = a.hijos.indexOf(nodoNota);
    if (i < 0) throw new Error('Esa nota ya no está en la ficha.');
    a.hijos.splice(i, 1);
    if (/^@[^@]+@$/.test(nodoNota.valor) && !this.referencias(nodoNota.valor).length) this.eliminar(nodoNota.valor);
  }

  // ---------- Citas de documentos ----------
  // Fuente de un documento del registro: el registro SOUR con «1 REFN reg:<id>» .
  fuenteDe(doc) {
    for (const r of this.ged.registros) if (r.tipo === 'SOUR' && r.raw.includes('reg:' + doc) && hijos(r.arbol, 'REFN').some(n => n.valor === 'reg:' + doc)) return r.xref;
    return null;
  }
  // Escribe la cita en la persona si el documento ya tiene fuente. Devuelve false si no la tiene.
  cita(xref, { doc, papel, que, pagina, quay }) {
    const sr = this.fuenteDe(doc);
    if (!sr) return false;
    const r = this.tocar(xref), h = r.arbol.hijos;
    if (h.some(n => n.tag === 'SOUR' && n.valor === sr && n.hijos.some(x => x.tag === '_REG' && x.valor === doc))) return true;
    const t = Editor.texto(2, `${papel}: ${que}`);
    const c = nodo(1, 'SOUR', sr, [...(pagina ? [nodo(2, 'PAGE', pagina)] : []), nodo(2, 'QUAY', quay), nodo(2, 'NOTE', t.valor, t.hijos), nodo(2, '_REG', doc)]);
    // Detrás de sus otras citas del registro; si no tiene, delante de sus fotos del registro y de «1 CHAN»
    let i = -1;
    h.forEach((n, k) => { if (n.tag === 'SOUR' && n.hijos.some(x => x.tag === '_REG')) i = k; });
    if (i < 0) { const k = h.findIndex(n => n.tag === 'CHAN' || (n.tag === 'OBJE' && /^@M\d/.test(n.valor))); i = (k < 0 ? h.length : k) - 1; }
    h.splice(i + 1, 0, c);
    return true;
  }

  // Crea un registro a partir de su texto (fuente u objeto del registro de documentos), delante de «0 TRLR».
  crearTexto(texto) {
    const r = new Registro(partirLargas(texto.replace(/\r?\n/g, '\r\n').replace(/(\r\n)+$/, '')).replace(/\r\n/g, this.ged.nl) + this.ged.nl, this.ged.nl);
    if (this.ged.porXref.has(r.xref)) return false;
    const i = this.ged.registros.findIndex(x => x.tipo === 'TRLR');
    this.ged.registros.splice(i < 0 ? this.ged.registros.length : i, 0, r);
    this.ged.porXref.set(r.xref, r);
    this.tx.antes.set(r.xref, null);
    this.tx.log.push({ tipo: 'crear', xref: r.xref });
    return true;
  }

  // Cita de un documento en una persona: SOUR / PAGE / QUAY / NOTE / _REG, y después
  // de sus citas las fotos (1 OBJE @M…@) sin repetir. «sr» es la fuente (ya en el archivo o recién creada).
  citaRegistro(xref, { sr, doc, papel, que, pagina, quay, grado = '', objs = [] }) {
    const r = this.tocar(xref), h = r.arbol.hijos;
    if (h.some(n => n.tag === 'SOUR' && n.valor === sr && n.hijos.some(x => x.tag === '_REG' && x.valor === doc))) return false;
    const lineas = [`1 SOUR ${sr}`, ...(pagina ? [`2 PAGE ${pagina}`] : []), `2 QUAY ${quay}`, `2 NOTE ${papel}: ${que}`, `2 _REG ${doc}`, ...(['C', 'N', 'P'].includes(grado) ? [`2 _GRADO ${grado}`] : [])];
    const nuevos = new Registro(partirLargas(['0 @X@ INDI', ...lineas].join('\r\n')).replace(/\r\n/g, this.ged.nl) + this.ged.nl, this.ged.nl).arbol.hijos;
    // Detrás de sus otras citas del registro; si no tiene, delante de «1 CHAN» (o al final)
    let i = -1;
    h.forEach((n, k) => { if (n.tag === 'SOUR' && n.hijos.some(x => x.tag === '_REG')) i = k; });
    if (i < 0) { const k = h.findIndex(n => n.tag === 'CHAN'); i = (k < 0 ? h.length : k) - 1; }
    h.splice(i + 1, 0, ...nuevos);
    // Fotos: detrás de sus fotos del registro o de la última cita del registro
    const ya = new Set(h.filter(n => n.tag === 'OBJE').map(n => n.valor));
    let j = -1;
    h.forEach((n, k) => { if ((n.tag === 'OBJE' && /^@M[0-9A-FX]+@$/.test(n.valor)) || (n.tag === 'SOUR' && n.hijos.some(x => x.tag === '_REG'))) j = k; });
    for (const o of objs) if (!ya.has(o)) { h.splice(++j, 0, nodo(1, 'OBJE', o)); ya.add(o); }
    return true;
  }

  // Pone el modelo al día en mitad de una operación (para encadenar varios pasos).
  alDia() { if (this.tx) this.refrescar([...this.tx.antes.keys()]); }

  // Hace que «padre» y «madre» sean los padres de «hijo», sin duplicar familias. Devuelve la familia.
  asegurarPadres(hijoId, padreId, madreId) {
    this.alDia();
    const h = this.arbol.p(hijoId);
    let fam = h.famc.map(f => this.arbol.f(f)).find(Boolean);
    if (fam) {
      if (padreId && fam.marido && fam.marido !== padreId) throw new Error(`${h.nombre} ${h.apellidos} ya tiene otro padre en el árbol.`);
      if (madreId && fam.mujer && fam.mujer !== madreId) throw new Error(`${h.nombre} ${h.apellidos} ya tiene otra madre en el árbol.`);
      if (padreId && !fam.marido) { this.enlazar(fam.id, 'HUSB', padreId); this.enlazar(padreId, 'FAMS', fam.id); }
      if (madreId && !fam.mujer) { this.enlazar(fam.id, 'WIFE', madreId); this.enlazar(madreId, 'FAMS', fam.id); }
      this.alDia(); return fam.id;
    }
    if (!padreId && !madreId) return null;
    // ¿Ya existe la pareja? Entonces el hijo va a esa familia
    let f = padreId && madreId ? this.arbol.p(padreId).fams.map(x => this.arbol.f(x)).find(x => x && x.mujer === madreId) : null;
    const famId = f ? f.id : this.nuevaFamilia(padreId || null, madreId || null);
    this.enlazar(famId, 'CHIL', hijoId); this.enlazar(hijoId, 'FAMC', famId);
    this.alDia(); return famId;
  }

  // Familia de la pareja (la que ya hay o una nueva). Devuelve la familia.
  asegurarPareja(aId, bId) {
    this.alDia();
    const a = this.arbol.p(aId), ya = a.fams.map(x => this.arbol.f(x)).find(x => x && (x.marido === bId || x.mujer === bId));
    if (ya) return ya.id;
    const f = this.conyuge(aId, bId); this.alDia(); return f;
  }

  // Cambia un lugar por otro en todos los hechos (unificar variantes). Devuelve cuántas líneas cambia.
  renombrarLugar(variantes, nuevo) {
    const vs = new Set(variantes.filter(v => v !== nuevo)); let n = 0;
    if (!vs.size) return 0;
    for (const r of [...this.ged.registros]) {
      if (r.tipo !== 'INDI' && r.tipo !== 'FAM') continue;
      if (!r.modificado && ![...vs].some(v => r.raw.includes(' PLAC ' + v))) continue;
      const cambiar = [];
      const ver = x => { if (x.tag === 'PLAC' && vs.has(x.valor)) cambiar.push(x); x.hijos.forEach(ver); };
      ver(r.arbol);
      if (!cambiar.length) continue;
      this.tocar(r.xref);
      for (const x of cambiar) { x.valor = nuevo; x.cambiado = true; n++; }
    }
    return n;
  }

  // Vuelve a poner un registro tal como está en una copia (si no existe, se crea).
  restaurarRegistro(xref, texto) {
    if (!this.ged.porXref.has(xref)) return this.crearTexto(texto);
    this.tocar(xref);
    const i = this.ged.registros.findIndex(r => r.xref === xref);
    const r = new Registro(texto.replace(/\r?\n/g, '\r\n').replace(/(\r\n)*$/, '\r\n').replace(/\r\n/g, this.ged.nl), this.ged.nl);
    this.ged.registros[i] = r; this.ged.porXref.set(xref, r);
    return true;
  }

  // ---------- Fusionar dos fichas de la misma persona ----------
  // Se queda «a»; lo de «b» pasa a «a» sin perder nada: el nombre y los hechos que no se eligen quedan como alternativos.
  // usar: { nombre: 'a'|'b', sexo: 'a'|'b', nac: 'a'|'b', def: 'a'|'b' }
  fusionar(aId, bId, usar = {}) {
    if (aId === bId) throw new Error('Es la misma ficha.');
    const A = this.tocar(aId), B = this.tocar(bId), pa = this.arbol.p(aId), pb = this.arbol.p(bId);
    for (const f of pa.fams) { const x = this.arbol.f(f); if (x && (x.marido === bId || x.mujer === bId)) throw new Error('Están casados entre sí en el árbol: no pueden ser la misma persona.'); }
    if (pa.famc.some(f => this.arbol.f(f)?.marido === bId || this.arbol.f(f)?.mujer === bId) || pb.famc.some(f => this.arbol.f(f)?.marido === aId || this.arbol.f(f)?.mujer === aId))
      throw new Error('Una es madre o padre de la otra: no pueden ser la misma persona.');
    const a = A.arbol, b = B.arbol;
    const mover = n => { b.hijos.splice(b.hijos.indexOf(n), 1); return n; };
    // Nombre: el elegido primero; el otro queda como segundo nombre (no se pierde la grafía)
    const nA = hijo(a, 'NAME'), nB = hijo(b, 'NAME');
    if (nB) {
      mover(nB);
      if (usar.nombre === 'b' && nA) { a.hijos.splice(a.hijos.indexOf(nA), 1, nB); if (nA.valor !== nB.valor) a.hijos.splice(a.hijos.indexOf(nB) + 1, 0, nA); }
      else if (!nA) a.hijos.unshift(nB);
      else if (nA.valor !== nB.valor) a.hijos.splice(a.hijos.indexOf(nA) + 1, 0, nB);
    }
    for (const n of hijos(b, 'NAME')) { mover(n); a.hijos.splice(a.hijos.indexOf(hijo(a, 'NAME')) + 1, 0, n); }
    // Sexo
    const sA = hijo(a, 'SEX'), sB = hijo(b, 'SEX');
    if (sB) { mover(sB); if (!sA) this.insertar(A, sB, ['NAME'], []); else if (usar.sexo === 'b') a.hijos.splice(a.hijos.indexOf(sA), 1, sB); }
    // Nacimiento y defunción: el elegido primero, el otro detrás (GEDCOM admite varios)
    for (const [tag, cual] of [['BIRT', usar.nac], ['DEAT', usar.def]]) {
      const eA = hijo(a, tag), lista = hijos(b, tag);
      for (const eB of lista) {
        mover(eB);
        if (!eA) this.insertar(A, eB, tag === 'BIRT' ? ['SEX', 'NAME'] : ['BURI', 'DEAT', 'CHR', 'BAPM', 'BIRT', 'SEX', 'NAME'], ['FAMC', 'FAMS', 'NOTE', 'SOUR', 'OBJE', 'CHAN']);
        else if (cual === 'b' && eB === lista[0]) a.hijos.splice(a.hijos.indexOf(eA), 0, eB);
        else a.hijos.splice(a.hijos.lastIndexOf(hijos(a, tag).slice(-1)[0]) + 1, 0, eB);
      }
    }
    // Familias: «b» se sustituye por «a»
    for (const n of hijos(b, 'FAMC')) {
      mover(n);
      const f = this.tocar(n.valor);
      const ya = hijos(f.arbol, 'CHIL').some(x => x.valor === aId);
      for (const c of hijos(f.arbol, 'CHIL')) if (c.valor === bId) { if (ya) f.arbol.hijos.splice(f.arbol.hijos.indexOf(c), 1); else { c.valor = aId; c.cambiado = true; } }
      this.enlazar(aId, 'FAMC', n.valor);
    }
    for (const n of hijos(b, 'FAMS')) {
      mover(n);
      const f = this.tocar(n.valor);
      for (const c of f.arbol.hijos) if ((c.tag === 'HUSB' || c.tag === 'WIFE') && c.valor === bId) { c.valor = aId; c.cambiado = true; }
      this.enlazar(aId, 'FAMS', n.valor);
    }
    // El resto de lo de «b» (bautismo, notas, fuentes, fotos…) pasa a «a», salvo sus datos internos
    for (const n of [...b.hijos]) {
      if (['CHAN', 'RIN', '_UID'].includes(n.tag)) continue;
      mover(n);
      this.insertar(A, n, [], ['CHAN']);
    }
    // Cualquier otra línea que nombre a «b» pasa a nombrar a «a»
    for (const { r, nodo: n } of this.referencias(bId)) {
      if (r.xref) this.tocar(r.xref);
      else { if (this.tx.cabecera == null && r.tipo === 'HEAD') this.tx.cabecera = r.texto(); r.arbol; r.modificado = true; }
      n.valor = aId; n.cambiado = true;
    }
    this.eliminar(bId);
    return { dosFamiliasDePadres: hijos(a, 'FAMC').length > 1 };
  }

  conyuge(personaId, otroId, boda) {
    if (otroId === personaId) throw new Error('Una persona no puede casarse consigo misma.');
    const p = this.arbol.p(personaId), o = this.arbol.p(otroId);
    const yaCasados = p.fams.some(f => { const x = this.arbol.f(f); return x && (x.marido === otroId || x.mujer === otroId); });
    if (yaCasados) throw new Error('Ya están casados en el árbol.');
    const elEs = p.sexo === 'F' ? false : o.sexo === 'F' ? true : p.sexo === 'M';
    const f = this.nuevaFamilia(elEs ? personaId : otroId, elEs ? otroId : personaId);
    if (boda && (boda.fecha || boda.lugar)) this.evento(f, 'MARR', boda.fecha, boda.lugar);
    return f;
  }
}
