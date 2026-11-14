// components/home/accents.ts — P1
//
// The landing page's accent presets.
//
// Modelled on the accent system in the Doppel frontend: a small set of
// presets, written to CSS custom properties on <html> and remembered in
// localStorage.
//
// What it recolours here is narrower than in Doppel, on purpose. ARROYO's
// three population colours — spectator blue, resident green, business amber —
// are a LEGEND: each appears once, tied to a real count, and the plan canvas
// uses the same three. Letting a colour picker move them would make the page
// lie about its own key. So the accent drives the instrument's chrome and the
// temperature the plan is lit at, and the three populations stay put.

export interface AccentPreset {
  id: string;
  label: string;
  /** the accent itself */
  accent: string;
  /** a deeper step, for edges and shadows */
  deep: string;
  /** the colour the plan's cool lighting is thrown in, in the 3D model */
  lamp: string;
}

export const ACCENTS: AccentPreset[] = [
  {
    id: 'sodium',
    label: 'Sodium',
    accent: 'oklch(0.78 0.14 68)',
    deep: 'oklch(0.58 0.12 68)',
    lamp: '#d8b184',
  },
  {
    id: 'mercury',
    label: 'Mercury',
    accent: 'oklch(0.80 0.09 230)',
    deep: 'oklch(0.58 0.09 230)',
    lamp: '#8fb4d6',
  },
  {
    id: 'halide',
    label: 'Halide',
    accent: 'oklch(0.86 0.06 150)',
    deep: 'oklch(0.62 0.08 150)',
    lamp: '#a9d6bb',
  },
  {
    id: 'xenon',
    label: 'Xenon',
    accent: 'oklch(0.88 0.04 300)',
    deep: 'oklch(0.64 0.07 300)',
    lamp: '#c3bcd9',
  },
  {
    id: 'bone',
    label: 'Bone',
    accent: 'oklch(0.935 0.008 85)',
    deep: 'oklch(0.70 0.01 85)',
    lamp: '#e6e2dc',
  },
];

export const DEFAULT_ACCENT_ID = 'mercury';
export const ACCENT_STORAGE_KEY = 'arroyo:accent';
