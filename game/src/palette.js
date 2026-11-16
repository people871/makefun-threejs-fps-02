// palette.js — look plan: "late-afternoon depot: sunlit steel, warm haze"
// A sunlit industrial yard in warm late-afternoon light: pale sky blue for
// fog/background, mid steel for surfaces, warm amber reserved for hazard
// markings and site pads, ink-white UI text.
export const PALETTE = {
  canvas: '#9db8cc',
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
