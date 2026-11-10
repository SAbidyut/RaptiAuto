// RaptiAuto logo mark (inline SVG).
export function logoMark(size = 40, id = 'lg') {
  // the RAPTI blue tile, a white chip and the yellow bolt
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" class="logo-mark" aria-hidden="true">
  <defs>
    <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d68ff"/><stop offset="0.55" stop-color="#1d4bff"/><stop offset="1" stop-color="#1438e0"/></linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="17" fill="url(#${id}a)"/>
  <g stroke="#fff" stroke-width="3" stroke-linecap="round">
    <path d="M22 13v6M32 13v6M42 13v6M22 45v6M32 45v6M42 45v6M13 22h6M13 32h6M13 42h6M45 22h6M45 32h6M45 42h6"/>
  </g>
  <rect x="19" y="19" width="26" height="26" rx="6" fill="#0b1026" stroke="#fff" stroke-width="2.6"/>
  <path d="M34.5 22.5 26 33.5h6l-2.5 8 8.5-11h-6z" fill="#ffd92e"/>
</svg>`;
}

export function wordmark() {
  return `<span class="wordmark"><b>Rapti</b><i>Auto</i></span>`;
}
