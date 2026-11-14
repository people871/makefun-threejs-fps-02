// palette.js — look plan: "dusk depot: cold steel, amber hazard light"
// A dim industrial yard at dusk: dark blue-grey steel and asphalt, warm
// amber reserved for hazard markings and site pads, ink-white UI text.
export const PALETTE = {
  canvas: '#0f1418',
  surface: '#1c232b',
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
