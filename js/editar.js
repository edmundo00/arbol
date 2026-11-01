// Cambios en el GEDCOM: personas, familias y enlaces. Cada cambio es una «operación» que se puede deshacer.
// Solo se tocan las líneas necesarias: el resto de cada registro se conserva tal cual (con sus etiquetas propias).
import { Registro, hijo, hijos } from './gedcom.js?v=202611010938';

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

export class Editor {
  constructor(ged, arbol) {
    this.ged = ged; this.arbol = arbol;
    this.historial = [];   // operaciones hechas: { desc, antes: Map(xref → texto o null si se creó), despues }
    this.tx = null;
  }

  // ---------- Operaciones ----------
  empezar(desc) { if (this.tx) throw new Error('Ya hay un cambio a medias.'); this.tx = { desc, antes: new Map(), cabecera: null }; }
  cancelar() { if (this.tx) { this.restaurar(this.tx); this.tx = null; } }
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
    for (const [x, texto] of tx.antes) {
      const i = this.ged.registros.findIndex(r => r.xref === x);
      if (texto === null) { if (i >= 0) this.ged.registros.splice(i, 1); this.ged.porXref.delete(x); }
      else { const r = new Registro(texto, this.ged.nl); this.ged.registros[i] = r; this.ged.porXref.set(x, r); }
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
    r.arbol; r.modificado = true;
    return xref;
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
