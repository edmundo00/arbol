// Búsqueda de personas: sin tildes, con grafías parecidas y con variantes conocidas de apellidos.

// Clave «fonética» de un texto. Se aplica igual a los nombres del árbol y a lo que se escribe en el buscador.
export function clave(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/[^a-z0-9|]+/g, ' ')
    .replace(/ch/g, 'C')                     // ch se protege antes de quitar la h
    .replace(/ph/g, 'f').replace(/th/g, 't')
    .replace(/h/g, '')                        // h muda
    .replace(/ll/g, 'y')                      // ll / y
    .replace(/w/g, 'v').replace(/v/g, 'b')    // b / v / w
    .replace(/y/g, 'i')                       // y / i
    .replace(/qu(?=[ei])/g, 'k').replace(/q/g, 'k')
    .replace(/c(?=[ei])/g, 's').replace(/c/g, 'k').replace(/z/g, 's')   // ce, ci, z, s
    .replace(/gu(?=[ei])/g, 'g').replace(/g(?=[ei])/g, 'j').replace(/x/g, 'j')   // gue/ge/je, x/j
    .replace(/C/g, 'ch')
    .replace(/([a-z])\1+/g, '$1')             // letras dobles
    .replace(/\s+/g, ' ').trim();
}

const VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'i', 'e', 'da', 'do', 'das', 'dos', 'van', 'ban', 'der', 'den']);

// Grupos de variantes: [['Houwelingen', 'Abelinguen', ...], ...] → lista de grupos de claves.
export function prepararVariantes(grupos) {
  return grupos.map(g => [...new Set(g.map(x => clave(x).replace(/ /g, '')).filter(Boolean))]);
}

function alternativas(t, variantes) {
  const alt = new Set([t]);
  if (t.length >= 4) for (const g of variantes) if (g.some(v => v.startsWith(t))) g.forEach(v => alt.add(v));
  return [...alt];
}

// Devuelve las personas que cumplen: cada palabra escrita debe aparecer en el nombre (en cualquier orden).
export function buscar(arbol, texto, { lugar = '', desde = null, hasta = null, linea = null, nombre = '', apellidos = '', variantes = [], limite = 300 } = {}) {
  const tokens = clave(texto).split(' ').filter(t => t && !VACIAS.has(t));
  const alts = tokens.map(t => alternativas(t, variantes));
  // Nombre y apellidos por separado: cada palabra tiene que empezar una palabra del nombre (o de los apellidos).
  const tN = clave(nombre).split(' ').filter(t => t && !VACIAS.has(t));
  const tA = clave(apellidos).split(' ').filter(t => t && !VACIAS.has(t)).map(t => alternativas(t, variantes));
  const cLugar = clave(lugar);
  const anc = linea ? arbol.ahnentafel(linea) : null;
  if (!tokens.length && !tN.length && !tA.length && !cLugar && desde == null && hasta == null && !anc) return { total: 0, lista: [] };
  const res = [];
  for (const p of arbol.personas.values()) {
    if (anc && !anc.has(p.id)) continue;
    if (tN.length) { const w = p.claveN.split(' '); if (!tN.every(t => w.some(x => x.startsWith(t)))) continue; }
    if (tA.length) { const w = p.claveA.split(' '); if (!tA.every(a => a.some(t => w.some(x => x.startsWith(t))))) continue; }
    if (cLugar && !p.claveLugar.includes(cLugar)) continue;
    if (desde != null && (p.ymax == null || p.ymax < desde)) continue;
    if (hasta != null && (p.ymin == null || p.ymin > hasta)) continue;
    let punt = 0, ok = true;
    const palabras = p.clave.split(' ');
    for (const a of alts) {
      let mejor = -1;
      for (const v of a) {
        if (palabras.includes(v)) mejor = Math.max(mejor, 3);
        else if (palabras.some(w => w.startsWith(v))) mejor = Math.max(mejor, 2);
        else if (p.clave.replace(/ /g, '').includes(v)) mejor = Math.max(mejor, 1);
      }
      if (mejor < 0) { ok = false; break; }
      punt += mejor;
    }
    if (!ok) continue;
    if (arbol.raices.some(r => arbol.ahnentafel(r.id).has(p.id))) punt += 1;
    res.push({ p, punt });
  }
  res.sort((a, b) => b.punt - a.punt || (a.p.apellidos + ' ' + a.p.nombre).localeCompare(b.p.apellidos + ' ' + b.p.nombre, 'es'));
  return { total: res.length, lista: res.slice(0, limite).map(r => r.p) };
}
