// icons.js  --  v8: one small line-icon set, drawn on a 24 px grid with a 1.75 px stroke, so every icon on the page
// shares the same weight. Returns inline SVG strings; the stroke takes the text colour.
const P = {
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.3-2.5 4"/><path d="M12 17.2v.1"/>',
  waves: '<path d="M2.5 8.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 3-1.5"/><path d="M2.5 13c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 3-1.5"/><path d="M2.5 17.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 3-1.5"/>',
  lowland: '<path d="M2.5 18h19"/><path d="M2.5 14.5c3 0 4-3 7-3s3.5 2 5.5 2 3-1.5 6.5-1.5"/><path d="M12 3.5v5m0 0-2-2m2 2 2-2"/>',
  river: '<path d="M7 2.5c0 4 4 4.5 4 8.5s-5 4.5-5 8.5"/><path d="M13 2.5c0 4 4 4.5 4 8.5s-5 4.5-5 8.5"/>',
  sink: '<path d="M12 3v11m0 0-4-4m4 4 4-4"/><path d="M3 19h18"/><path d="M5 21.5h14" opacity=".5"/>',
  sea: '<path d="M2.5 12c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 3-1.5"/><path d="M2.5 17c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 3-1.5"/><path d="M12 8V2.5m0 0-2.5 2.5M12 2.5l2.5 2.5"/>',
  cyclone: '<path d="M18.5 7.5A8 8 0 1 0 20 12"/><path d="M15.5 9.5a4.5 4.5 0 1 0 1 2.5"/><circle cx="12" cy="12" r="1.2"/>',
  columns: '<path d="M4 20V11"/><path d="M9 20V6"/><path d="M14 20v-6"/><path d="M19 20V9"/><path d="M2.5 20h19"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 2.5-6.5 7-6.5 0 4.5-2.5 6.5-7 6.5Z"/><path d="M12 14.5C12 11 10 9 5.5 9c0 3.5 2 5.5 6.5 5.5Z"/>',
  sliders: '<path d="M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14h8"/>',
  layers: '<path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="m2.5 12.5 9.5 5 9.5-5"/><path d="m2.5 16.5 9.5 5 9.5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevL: '<path d="m15 5-7 7 7 7"/>', chevR: '<path d="m9 5 7 7-7 7"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14c3 0 5 2 5 5"/>',
  wheat: '<path d="M12 21V9"/><path d="M12 9c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z"/><path d="M12 14c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4Zm0 0c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z"/>',
  droplet: '<path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3Z"/>',
  overview: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  map: '<path d="m3 6 6-2.5 6 2.5 6-2.5v14.5L15 20.5 9 18l-6 2.5z"/><path d="M9 3.5V18M15 6v14.5"/>'
};
export const icon = (name, size = 20, cls = "") => `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ""}</svg>`;
export const STEP_ICON = { cover: "question", bay: "waves", low: "lowland", silt: "river", sink: "sink", sea: "sea", storms: "cyclone", priority: "columns", raise: "sprout", explore: "sliders" };
// put an icon into every element that asks for one: <span data-icon="search"></span>
export function hydrate(root = document) { root.querySelectorAll("[data-icon]").forEach(el => { el.innerHTML = icon(el.dataset.icon, +(el.dataset.size || 20)); }); }
