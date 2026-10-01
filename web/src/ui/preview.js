// Static SVG preview of a whole project (used for project / example cards).
import { getDef, partProps, partTransform, worldBox, pinsOf, toWorld } from '../components/registry.js';

const cache = new Map();

export function projectPreview(project, maxParts = 60) {
  const key = project.id + ':' + (project.updated || 0) + ':' + project.parts.length + ':' + project.wires.length;
  if (cache.has(key)) return cache.get(key);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let body = '';
  const parts = project.parts.filter((p) => getDef(p.type)).slice(0, maxParts);
  const sorted = [...parts].sort((a, b) => (getDef(a.type).layer === -1 ? -1 : 0) - (getDef(b.type).layer === -1 ? -1 : 0));
  for (const p of sorted) {
    const def = getDef(p.type);
    const b = worldBox(p);
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    let inner = '';
    try { inner = def.render(partProps(p)); } catch (e) { inner = ''; }
    body += `<g transform="${partTransform(p)}">${inner}</g>`;
  }
  const byId = new Map(parts.map((p) => [p.id, p]));
  const pos = (ref) => {
    const part = byId.get(ref.part);
    if (!part) return null;
    const pin = pinsOf(part).find((x) => x.id === ref.pin);
    return pin ? toWorld(part, pin.x, pin.y) : null;
  };
  for (const w of project.wires) {
    const a = pos(w.from), b = pos(w.to);
    if (!a || !b) continue;
    const pts = [a, ...(w.points || []), b];
    const d = 'M' + pts.map((p) => p.join(' ')).join(' L');
    body += `<path d="${d}" fill="none" stroke="#0b1020" stroke-opacity=".55" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${w.color || '#22c55e'}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (!Number.isFinite(x0)) { x0 = 0; y0 = 0; x1 = 100; y1 = 60; }
  const pad = 14;
  const svg = `<svg viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}" preserveAspectRatio="xMidYMid meet" class="preview-svg">${body}</svg>`;
  cache.set(key, svg);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return svg;
}
