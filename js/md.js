// Markdown sencillo para las transcripciones y fichas. Está en visordoc.js porque también lo usa el revisor,
// que se abre con doble clic y no puede cargar módulos.
import {} from './visordoc.js?v=202611070959';

export const esc = globalThis.VisorDoc.esc;
export const md = globalThis.VisorDoc.md;
