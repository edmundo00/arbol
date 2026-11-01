// Pruebas que se pasan en el navegador (pruebas.html), con el GEDCOM real servido por servidor_local.py.
import { Gedcom, decodificar, codificar } from './gedcom.js?v=202611011129';
import { Arbol } from './modelo.js?v=202611011129';
import { clave, buscar, prepararVariantes } from './buscar.js?v=202611011129';
const RUTAS = { gedcom: '/Genealogia_2/01_arboles/edmundo_actualizado/edmundo.ged' };
import { Servidor, Carpetas } from './almacen.js?v=202611011129';
import { BaseNombres, tokensClave, TRATAMIENTOS } from './nombresdb.js?v=202611011129';

const out = document.getElementById('out');
let fallos = 0;
function ok(cond, txt) { if (!cond) fallos++; out.insertAdjacentHTML('beforeend', `<li class="${cond ? 'bien' : 'mal'}">${cond ? '✔' : '✘'} ${txt}</li>`); }
function iguales(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }

async function main() {
  const t0 = performance.now();
  const bytes = new Uint8Array(await (await fetch(encodeURI(RUTAS.gedcom), { cache: 'no-store' })).arrayBuffer());
  ok(bytes.length > 1e6, `GEDCOM leído: ${(bytes.length / 1e6).toFixed(2)} MB`);

  const ged = Gedcom.desdeBytes(bytes);
  ok(ged.cod === 'utf16le' && ged.nl === '\r\n', `Codificación ${ged.cod}, saltos ${JSON.stringify(ged.nl)}`);
  ok(iguales(ged.bytes(), bytes), 'Ida y vuelta sin cambios: idéntico byte a byte');

  // Se fuerza que todos los registros se rehagan desde su árbol de nodos: también debe salir idéntico.
  for (const r of ged.registros) { r.arbol; r.modificado = true; }
  ok(iguales(ged.bytes(), bytes), 'Ida y vuelta rehaciendo los 22.000 registros desde el árbol: idéntico byte a byte');

  // Un cambio en un registro solo altera ese registro.
  const g2 = Gedcom.desdeBytes(bytes), r1 = g2.porXref.get('@I1@');
  const nodo = r1.arbol.hijos.find(h => h.tag === 'NAME'); nodo.valor = 'Prueba /Cambio/'; nodo.cambiado = true; r1.modificado = true;
  const t2 = g2.texto(), t1 = decodificar(bytes).texto;
  ok(t2.replace('1 NAME Prueba /Cambio/', '1 NAME Edmundo /Fraga Lopez/') === t1, 'Un cambio de nombre en I1 solo cambia esa línea');

  ok(iguales(codificar('a\uD800b', 'utf16le'), new Uint8Array([0xFF, 0xFE, 0x61, 0, 0x00, 0xD8, 0x62, 0])), 'Los sustitutos sueltos se conservan');

  const arbol = new Arbol(ged);
  ok(arbol.personas.size > 13000, `${arbol.personas.size} personas, ${arbol.familias.size} familias`);
  const etiquetas = ['_FILE', '_REG', '_KEYS', '_ASID'].map(t => [t, (t1.match(new RegExp('\\r\\n\\d+ ' + t + '[ \\r]', 'g')) || []).length]);
  ok(etiquetas.every(([, n]) => n > 0), 'Etiquetas propias presentes y conservadas: ' + etiquetas.map(e => e.join(' ')).join(', '));

  ok(clave('Ávila') === clave('abila'), 'Ávila = abila');
  ok(clave('Ferreyro') === clave('Ferreiro'), 'Ferreyro = Ferreiro');
  ok(clave('Hermida') === clave('Ermida'), 'Hermida = Ermida (h muda)');
  ok(clave('Castillo') === clave('Castiyo'), 'll = y');
  ok(clave('Ximénez') === clave('Jiménez'), 'Ximénez = Jiménez');
  ok(clave('González') === clave('Gonzales'), 'González = Gonzales');
  ok(clave('Sánchez') !== clave('Sanez'), 'ch no se pierde (Sánchez ≠ Sanez)');

  const variantes = prepararVariantes(await (await fetch('variantes.json?v=202611011129')).json());
  const b = q => buscar(arbol, q, { variantes }).lista.map(p => p.id);
  ok(b('houwelingen').length >= 5, `«houwelingen»: ${b('houwelingen').length} personas`);
  ok(b('abelinguen').length === b('houwelingen').length, `«abelinguen» encuentra lo mismo que «houwelingen» (${b('abelinguen').length})`);
  ok(b('bezlinge').length === b('houwelingen').length, `«bezlinge» encuentra lo mismo (${b('bezlinge').length})`);
  ok(b('edmundo fraga lopez')[0] === '@I1@', '«edmundo fraga lopez» → I1 el primero');
  ok(b('fraga edmundo').includes('@I1@'), 'Orden de palabras indiferente');
  ok(b('antonia sotomayor').length > 0, `«antonia sotomayor»: ${b('antonia sotomayor').length}`);
  ok(b('barela').length === b('varela').length && b('varela').length > 0, `Barela = Varela (${b('varela').length})`);
  const anc = arbol.ahnentafel('@I1@');
  ok(anc.get('@I1@')[0] === 1 && anc.get('@I47@')[0] === 2, `Ahnentafel de Edmundo: ${anc.size} antepasados; I47 es el n.º 2`);
  ok(arbol.ahnentafel('@I2528@').size > 1, `Ahnentafel de Diana: ${arbol.ahnentafel('@I2528@').size} antepasados`);
  const ferrol = buscar(arbol, '', { lugar: 'ferrol', desde: 1800, hasta: 1850, variantes });
  const porNA = (n, ap) => buscar(arbol, '', { nombre: n, apellidos: ap, variantes, limite: 99999 }).lista;
  ok(porNA('', 'fraga').some(p => p.id === '@I1@') && !porNA('fraga', '').some(p => p.id === '@I1@'), 'Apellidos «fraga» encuentra a Edmundo Fraga; Nombre «fraga» no');
  ok(porNA('edmundo', 'fraga lopez')[0]?.id === '@I1@', 'Nombre «edmundo» + Apellidos «fraga lopez» → I1');
  ok(porNA('', 'abelinguen').length === 6, `Apellidos con variantes: «abelinguen» → ${porNA('', 'abelinguen').length} Houwelingen`);
  ok(porNA('juan', '').every(p => p.claveN.split(' ').some(w => w.startsWith('juan'))), `Nombre «juan»: ${porNA('juan', '').length} personas, todas con Juan en el nombre`);
  ok(ferrol.total > 0, `Filtro lugar «ferrol» y años 1800–1850: ${ferrol.total}`);

  arbol.ponerRaices([]);
  ok(arbol.raices.length === 1 && arbol.raices[0].id === '@I1@', `Sin elegir, la persona de referencia es la primera del archivo: ${arbol.raices[0]?.nombre}`);
  arbol.ponerRaices(['@I1@', '@I2528@']);
  ok(arbol.raices.map(r => r.letra).join() === 'E,D', 'Referencias elegidas: E (Edmundo) y D (Diana)');

  // Fotos y transcripciones buscadas dentro de una carpeta cualquiera (aquí, la de Dropbox servida por el servidor local)
  const srv = new Servidor();
  const foto = String.raw`D:\Dropbox\Genealogia\Documentos\Memorias_Edmundo_Fraga_Ferreiro_04.jpg`;
  ok((await srv.buscar(foto)).rel.join('/') === 'Genealogia/Documentos/Memorias_Edmundo_Fraga_Ferreiro_04.jpg', 'Foto encontrada quitando «D:/Dropbox» de delante');
  ok((await srv.buscar(String.raw`E:\Otro\Sitio\Genealogia\Documentos\Memorias_Edmundo_Fraga_Ferreiro_05.jpg`)).rel[0] === 'Genealogia', 'Foto encontrada aunque el GEDCOM traiga otra ruta delante');
  const tr = await srv.transcripcion(foto);
  ok(tr && /03_transcripciones\/Documentos\/Memorias_Edmundo_Fraga_Ferreiro_04\.md$/.test(tr.rel), `Transcripción de la foto: ${tr?.rel}`);
  ok(/Fraga/.test((await srv.texto('03_transcripciones/Documentos/Fraga_Ferreiro_Edmundo_familia_numerosa.md')).texto), 'Archivo citado por ruta relativa encontrado en una subcarpeta');

  // Dos carpetas elegidas por separado: fotos en «Genealogia», transcripciones en «Genealogia_2»
  class Sub extends Servidor {
    constructor(base) { super(); this.base = base; this.nombre = base; }
    exacto(p) { return p.length ? super.exacto([this.base, ...p]) : null; }
    subcarpetas(p) { return super.subcarpetas([this.base, ...p]); }
  }
  const dos = new Carpetas([new Sub('Genealogia_2'), new Sub('Genealogia')]);
  const padron = String.raw`D:\Dropbox\Genealogia\PADRONES\As Pontes\Puentes_1827_padron_14.jpg`;
  ok((await dos.buscar(padron)).c.nombre === 'Genealogia', 'Con dos carpetas: la foto del padrón de As Pontes aparece en «Genealogia»');
  const tr2 = await dos.transcripcion(foto);
  ok(tr2 && /^03_transcripciones\/Documentos\/Memorias_Edmundo_Fraga_Ferreiro_04\.md$/.test(tr2.rel), `Foto en «Genealogia», transcripción en «Genealogia_2»: ${tr2?.rel}`);
  const sola = new Carpetas([new Sub('Genealogia_2')]);
  let e2 = null; try { await sola.buscar(padron); } catch (e) { e2 = e; }
  ok(e2?.noExiste && /No está en «Genealogia_2»/.test(e2.message), `Solo con «Genealogia_2» lo explica: ${e2?.message}`);

  // Base de nombres y lugares, con sql.js (sin internet)
  const bdb = new Uint8Array(await (await fetch('/Genealogia_2/00_control/nombres_lugares.db', { cache: 'no-store' })).arrayBuffer());
  const base = await BaseNombres.abrir(bdb, 'nombres_lugares.db', Date.now());
  const claveNombre = n => tokensClave(n).filter(k => !TRATAMIENTOS.has(k)).join(' ');
  const pg = base.filas('SELECT nombre, clave FROM personas_gedcom');
  const malP = pg.filter(r => claveNombre(r.nombre || '') !== (r.clave || ''));
  ok(malP.length === 0, `Clave fonética igual que en Python en las ${pg.length} personas` + (malP.length ? `; distintas ${malP.length}: ${malP.slice(0, 3).map(r => r.nombre + ' → ' + claveNombre(r.nombre) + ' ≠ ' + r.clave).join(' | ')}` : ''));
  const mm = base.filas('SELECT nombre, clave FROM menciones WHERE id % 20 = 0');
  const malM = mm.filter(r => claveNombre(r.nombre || '') !== (r.clave || ''));
  ok(malM.length / mm.length < 0.001, `Clave igual en ${mm.length - malM.length} de ${mm.length} menciones` + (malM.length ? `: ${malM.slice(0, 3).map(r => r.nombre + ' → ' + claveNombre(r.nombre) + ' ≠ ' + r.clave).join(' | ')}` : ''));
  const comp = (t, p, m) => { const r = base.donde(t); ok(r.personas.length === p && r.menciones.length === m, `«${t}»: ${r.personas.length} personas y ${r.menciones.length} menciones (Python: ${p} y ${m})`); };
  comp('Ysabel Fraga', 1, 31); comp('Pardo Osorio', 61, 300); comp('Ferr* Romero', 3, 156); comp('Houwelingen', 6, 69);
  const lv = base.enLugar('Valdoviño', { desde: 1700, hasta: 1750 });
  ok(lv.lugares.length === 18 && lv.eventos.length === 143 && lv.menciones.length === 400, `Lugar «Valdoviño» 1700–1750: ${lv.lugares.length} lugares, ${lv.eventos.length} hechos, ${lv.menciones.length} menciones (Python: 18, 143, 400)`);
  const na = base.donde('', { nombre: 'Ysabel', apellidos: 'Fraga' }), libre = base.donde('Ysabel Fraga');
  ok(na.menciones.length > 0 && na.menciones.every(m => libre.menciones.some(x => x.id === m.id)), `Nombre «Ysabel» + Apellidos «Fraga»: ${na.menciones.length} menciones (de ${libre.menciones.length} en búsqueda libre)`);
  const soloAp = base.donde('', { apellidos: 'Fraga' }), soloN = base.donde('', { nombre: 'Fraga' });
  ok(soloAp.personas.length > soloN.personas.length && soloN.personas.every(p => p.clave.startsWith('fraga')), `Apellidos «Fraga»: ${soloAp.personas.length} personas del árbol; Nombre «Fraga»: ${soloN.personas.length}`);
  const me = base.menciones('@I1@');
  ok(me.enlazadas.length > 0, `Menciones de Edmundo (I1): ${me.enlazadas.length} enlazadas y ${me.posibles.length} posibles`);
  base.cerrar();

  ok(true, `Tiempo total: ${Math.round(performance.now() - t0)} ms`);
  document.title = fallos ? `FALLAN ${fallos}` : 'TODO BIEN';
  out.insertAdjacentHTML('beforeend', `<li><b>${fallos ? fallos + ' pruebas fallan' : 'Todas las pruebas pasan'}</b></li>`);
}
main().catch(e => { ok(false, 'Error: ' + e.message); document.title = 'ERROR'; });
