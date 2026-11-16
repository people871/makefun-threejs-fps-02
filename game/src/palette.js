// palette.js — look plan: "golden-hour depot: low warm sun, violet dusk sky"
// A sunlit industrial yard in low late-afternoon light: warm peach for
// fog/background, mid steel for surfaces, warm amber reserved for hazard
// markings and site pads, ink-white UI text.
export const PALETTE = {
  canvas: '#e8b48c',
  surface: '#2a3540',
  hairline: '#39434d',
  ink: '#e8e4d8',
  muted: '#8b98a3',
  accent: '#f0a830',
};

// Team colours (hex numbers for three.js materials).
export const TEAM = {
  K: 0x2fae9e, // Kestrels — teal
  V: 0xc65a3a, // Vultures — rust
};

// Look up a palette colour by name.
export function shade(name) {
  return PALETTE[name];
}
