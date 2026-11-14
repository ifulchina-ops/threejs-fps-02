// EMBERLINE — the look plan, in one place. A dusk industrial yard: cold slate surfaces,
// warm amber light, rust-orange containers, teal accents. The same names are the CSS
// custom properties in index.html, so the 3D scene and the HUD share one palette.
export const PALETTE = {
  canvas: '#191d26',
  sky: '#2b3849',
  surface: '#262c38',
  hairline: '#39404e',
  ink: '#ece7db',
  muted: '#9aa3b0',
  accent: '#f0a830',
  ember: '#e2603a',
  vanguard: '#4f8fd0',
  teal: '#3fa7a0',
  rust: '#a85a2e',
  concrete: '#2b2f38',
  ground: '#20242c',
  relay: '#57d7e8',
  danger: '#e5484d',
};

export function shade(name) {
  return PALETTE[name];
}
