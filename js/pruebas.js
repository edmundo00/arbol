// Pruebas que se pasan en el navegador (pruebas.html), con el GEDCOM real servido por servidor_local.py.
import { Gedcom, decodificar, codificar } from './gedcom.js?v=202611051114';
import { Arbol } from './modelo.js?v=202611051114';
import { clave, buscar, prepararVariantes } from './buscar.js?v=202611051114';
const RUTAS = { gedcom: '/Genealogia/1 Árbol/Árbol de trabajo/edmundo.ged' };
import { Servidor, Carpetas } from './almacen.js?v=202611051114';
import { BaseNombres, tokensClave, TRATAMIENTOS } from './nombresdb.js?v=202611051114';
import { esArbolHecho } from './menciones.js?v=202611051114';
import { aGedcom } from './fechas.js?v=202611051114';
import { entender, comoSeEntiende } from './consulta.js?v=202611051114';
import { lugares as listaDeLugares } from './investigar.js?v=202611051114';

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

  const variantes = prepararVariantes(await (await fetch('variantes.json?v=202611051114')).json());
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
  const MEM = '2 Documentos/Particulares/Papeles de familia/memorias_fraga_ferreiro/Memorias_Edmundo_Fraga_Ferreiro_0';
  const foto = String.raw`D:\Dropbox\Genealogia\\` + MEM.replace(/\//g, '\\') + '4.jpg';
  ok((await srv.buscar(foto)).rel.join('/') === 'Genealogia/' + MEM + '4.jpg', 'Foto encontrada quitando «D:/Dropbox» de delante');
  ok((await srv.buscar(String.raw`E:\Otro\Sitio\Genealogia\\` + MEM + '5.jpg')).rel[0] === 'Genealogia', 'Foto encontrada aunque el GEDCOM traiga otra ruta delante');
  const tr = await srv.transcripcion(foto);
  ok(tr && tr.rel === 'Genealogia/' + MEM + '4.md', `Transcripción al lado de la foto: ${tr?.rel}`);
  ok(/Fraga/.test((await srv.texto('2 Documentos/Sin archivo/Familia/familia_numerosa_1953/Fraga_Ferreiro_Edmundo_familia_numerosa.md')).texto), 'Archivo citado por ruta relativa encontrado en una subcarpeta');

  // Rutas de antes de la mudanza (1-XI-2026), traducidas con «9 Sistema/Control/mudanza/mapa_rutas.csv»
  class Sub extends Servidor {
    constructor(base) { super(); this.base = base; this.nombre = base; }
    exacto(p) { return p.length ? super.exacto([this.base, ...p]) : null; }
    subcarpetas(p) { return super.subcarpetas([this.base, ...p]); }
  }
  const una = new Carpetas([new Sub('Genealogia')]), toda = new Carpetas([new Servidor()]);
  const padron = String.raw`D:\Dropbox\Genealogia\PADRONES\As Pontes\Puentes_1827_padron_14.jpg`;
  ok((await una.buscar(padron)).rel.join('/') === '2 Documentos/Libros completos/As Pontes/Puentes_1827_padron_14.jpg', 'Ruta antigua de PADRONES traducida (por la carpeta) con «Genealogia» elegida');
  ok((await toda.buscar('Genealogia/Documentos/Memorias_Edmundo_Fraga_Ferreiro_04.jpg')).rel.join('/') === 'Genealogia/' + MEM + '4.jpg', 'Ruta antigua de Documentos traducida con toda la de Dropbox elegida');
  ok(/Fraga/.test((await una.texto('03_transcripciones/Documentos/Fraga_Ferreiro_Edmundo_familia_numerosa.md')).texto), 'Transcripción citada con la ruta antigua de Genealogia_2 encontrada');
  const tr2 = await una.transcripcion(String.raw`D:\Dropbox\Genealogia\Documentos\Memorias_Edmundo_Fraga_Ferreiro_04.jpg`);
  ok(tr2 && tr2.rel.endsWith(MEM + '4.md'), `Transcripción de una foto con ruta antigua: ${tr2?.rel}`);
  const nada = new Carpetas([new Sub('Genealogia')]);
  let e2 = null; try { await nada.buscar('Genealogia/Documentos/no_existe_nunca.jpg'); } catch (e) { e2 = e; }
  ok(e2?.noExiste && /No está en «Genealogia»/.test(e2.message), `Lo que no está lo explica: ${e2?.message}`);

  // Base de nombres y lugares, con sql.js (sin internet)
  const bdb = new Uint8Array(await (await fetch(encodeURI('/Genealogia/9 Sistema/Control/nombres_lugares.db'), { cache: 'no-store' })).arrayBuffer());
  const base = await BaseNombres.abrir(bdb, 'nombres_lugares.db', Date.now());
  const claveNombre = n => tokensClave(n).filter(k => !TRATAMIENTOS.has(k)).join(' ');
  const pg = base.filas('SELECT nombre, clave FROM personas_gedcom');
  const malP = pg.filter(r => claveNombre(r.nombre || '') !== (r.clave || ''));
  ok(malP.length === 0, `Clave fonética igual que en Python en las ${pg.length} personas` + (malP.length ? `; distintas ${malP.length}: ${malP.slice(0, 3).map(r => r.nombre + ' → ' + claveNombre(r.nombre) + ' ≠ ' + r.clave).join(' | ')}` : ''));
  const mm = base.filas('SELECT nombre, clave FROM menciones WHERE id % 20 = 0');
  const malM = mm.filter(r => claveNombre(r.nombre || '') !== (r.clave || ''));
  ok(malM.length / mm.length < 0.001, `Clave igual en ${mm.length - malM.length} de ${mm.length} menciones` + (malM.length ? `: ${malM.slice(0, 3).map(r => r.nombre + ' → ' + claveNombre(r.nombre) + ' ≠ ' + r.clave).join(' | ')}` : ''));
  // Sin filtros no se pierde nada: las mismas cifras que contando directamente en la base.
  const comp = t => {
    const r = base.donde(t), w = t.split(' ').map(x => x.endsWith('*') ? `(' ' || clave || ' ') LIKE '% ${tokensClave(x)[0]}%'` : `(' ' || clave || ' ') LIKE '% ${tokensClave(x)[0]} %'`).join(' AND ');
    const p = base.filas(`SELECT COUNT(*) n FROM personas_gedcom WHERE ${w}`)[0].n, m = base.filas(`SELECT COUNT(*) n FROM menciones WHERE ${w}`)[0].n;
    ok(r.personas.length === p && r.menciones.length === m, `«${t}»: ${r.personas.length} personas y ${r.menciones.length} menciones (contadas en la base: ${p} y ${m})`);
    ok(r.menciones.every(x => x._g === 0), `«${t}» sin filtros: ninguna queda fuera`);
  };
  comp('Ysabel Fraga'); comp('Pardo Osorio'); comp('Ferr* Romero'); comp('Houwelingen');
  // El caso que motivó los filtros: el entierro de María Fernández en Xubia, 4-VII-1734
  const caso = base.donde('', { nombre: 'maria', apellidos: 'fernandez', lugar: 'jubia', desde: 1731, hasta: 1735 });
  const docsCaso = caso.menciones.filter(m => !esArbolHecho(m));
  const pos = docsCaso.findIndex(m => /fernandez_maria_defuncion\.md$/.test(m.ruta) && m.anio === 1734);
  ok(pos >= 0 && pos < 5 && docsCaso[pos]._g === 0, `María Fernández, Xubia, 1731–1735: el entierro de 1734 sale en el puesto ${pos + 1} y cumple`);
  ok(docsCaso[pos]?.contexto?.includes('viuda'), `El entierro de 1734 trae su frase: «${(docsCaso[pos]?.contexto || '').slice(0, 60)}…»`);
  const cumplen = docsCaso.filter(m => m._g === 0);
  ok(cumplen.every(m => m._p.notas.length === 2), 'Todos los que cumplen dicen su año y su lugar');
  ok(!cumplen.some(m => /Cee|Córgomo|Valdeorras/.test(m.lugar || '')), 'Ninguno de los que cumplen es de otro sitio');
  ok(caso.menciones.some(m => m._g === 2) && caso.menciones.some(m => m._g === 3), 'Los que no tienen el dato o no coinciden siguen en sus grupos, no se pierden');
  // Tipo y archivo: el mismo caso sigue saliendo con «Defunción» y «Diocesano Mondoñedo», y desaparece de lo que cumple con «Bautismo»
  const conTipo = o => base.donde('', { nombre: 'maria', apellidos: 'fernandez', lugar: 'jubia', desde: 1731, hasta: 1735, ...o }).menciones.find(m => /fernandez_maria_defuncion\.md$/.test(m.ruta) && m.anio === 1734);
  ok(conTipo({ tipo: 'Defunción o entierro', archivo: 'Diocesano Mondoñedo' })?._g === 0, 'Con tipo «Defunción» y archivo «Diocesano Mondoñedo», el entierro cumple');
  ok(conTipo({ tipo: 'Bautismo o nacimiento' })?._g === 3, 'Con tipo «Bautismo», el entierro queda fuera de lo pedido');
  ok(conTipo({ archivo: 'ARCHV Valladolid' })?._g === 3, 'Con archivo «ARCHV Valladolid», el entierro queda fuera de lo pedido');
  ok(base.archivos().includes('Diocesano Mondoñedo'), `El desplegable de archivos tiene ${base.archivos().length} archivos`);
  // Fechas: cualquier forma razonable
  for (const [txt, g] of [['antes 1734', 'BEF 1734'], ['antes de 1734', 'BEF 1734'], ['ant. 1734', 'BEF 1734'], ['ant 1734', 'BEF 1734'], ['bef 1734', 'BEF 1734'], ['bef. 1734', 'BEF 1734'], ['BEF 1734', 'BEF 1734'], ['before 1734', 'BEF 1734'], ['a.1800', 'BEF 1800'], ['a. 1800', 'BEF 1800'], ['<1734', 'BEF 1734'],
    ['después 1734', 'AFT 1734'], ['despues de 1734', 'AFT 1734'], ['desp. 1734', 'AFT 1734'], ['aft 1734', 'AFT 1734'], ['after 1734', 'AFT 1734'], ['tras 1734', 'AFT 1734'], ['d. 1734', 'AFT 1734'],
    ['hacia 1750', 'ABT 1750'], ['h. 1750', 'ABT 1750'], ['h1750', 'ABT 1750'], ['c. 1750', 'ABT 1750'], ['ca 1750', 'ABT 1750'], ['ca. 1750', 'ABT 1750'], ['circa 1750', 'ABT 1750'], ['sobre 1750', 'ABT 1750'], ['abt 1750', 'ABT 1750'], ['about 1750', 'ABT 1750'], ['aprox. 1750', 'ABT 1750'], ['alrededor de 1750', 'ABT 1750'], ['1750?', 'ABT 1750'],
    ['entre 1700 y 1710', 'BET 1700 AND 1710'], ['de 1700 a 1710', 'BET 1700 AND 1710'], ['desde 1700 hasta 1710', 'BET 1700 AND 1710'], ['between 1700 and 1710', 'BET 1700 AND 1710'], ['BET 1700 AND 1710', 'BET 1700 AND 1710'], ['1700-1710', 'BET 1700 AND 1710'], ['1797/1800', 'BET 1797 AND 1800'], ['s. XVIII', 'BET 1701 AND 1800'],
    ['4 jul 1734', '4 JUL 1734'], ['4 de julio de 1734', '4 JUL 1734'], ['4/7/1734', '4 JUL 1734'], ['4-7-1734', '4 JUL 1734'], ['4.7.1734', '4 JUL 1734'], ['4-VII-1734', '4 JUL 1734'], ['1734-07-04', '4 JUL 1734'], ['4 JUL 1734', '4 JUL 1734'], ['july 4 1734', '4 JUL 1734'], ['4 xullo 1734', '4 JUL 1734'],
    ['julio 1734', 'JUL 1734'], ['julio de 1734', 'JUL 1734'], ['VII-1734', 'JUL 1734'], ['antes de julio de 1734', 'BEF JUL 1734'], ['hacia 4 jul 1734', 'ABT 4 JUL 1734'], ['antes del 4 de julio de 1734', 'BEF 4 JUL 1734'], ['1734', '1734']]) {
    const r = aGedcom(txt); ok(r.ged === g, `Fecha «${txt}» → ${r.ged || r.error}`);
  }
  ok(aGedcom('patata').error, 'Lo que no es fecha se dice: «patata»');
  // Cuadro de arriba: cada palabra a su sitio
  const ent = (t, esperado) => { const c = entender(t, arbol, () => listaDeLugares(arbol).todos); ok(Object.entries(esperado).every(([k, v]) => c[k] === v), `«${t}» → ${comoSeEntiende(c)}`); };
  ent('maria fernandez jubia 1731-1735', { nombre: 'maria', apellidos: 'fernandez', lugar: 'jubia', desde: 1731, hasta: 1735 });
  ent('fernandez maria defunción 1734 xubia', { nombre: 'maria', apellidos: 'fernandez', lugar: 'xubia', desde: 1734, hasta: 1734, tipo: 'Defunción o entierro' });
  ent('ysabel da fraga', { nombre: 'ysabel', apellidos: 'fraga', lugar: '' });
  ent('fraga', { nombre: '', apellidos: 'fraga', lugar: '' });
  ent('juan', { nombre: 'juan', apellidos: '' });
  ent('pardo osorio en san martin de jubia', { apellidos: 'pardo osorio', lugar: 'san martin de jubia' });
  const lv = base.enLugar('Valdoviño', { desde: 1700, hasta: 1750 });
  ok(lv.lugares.length > 0 && lv.eventos.some(e => e._g === 0) && lv.menciones.some(m => m._g === 0) && lv.menciones.some(m => m._g === 2), `Lugar «Valdoviño» 1700–1750: ${lv.lugares.length} lugares, ${lv.eventos.filter(e => e._g === 0).length} hechos, ${lv.menciones.filter(m => m._g === 0).length} menciones en esos años y ${lv.menciones.filter(m => m._g === 2).length} sin fecha`);
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
