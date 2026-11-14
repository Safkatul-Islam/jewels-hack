// components/home/corridorPalette.ts — P1
//
// The `.night` palette as hex, for three.js.
//
// The tokens themselves live in globals.css as oklch, which is where they
// belong — but three.js cannot parse oklch, and resolving a CSS custom
// property to something it can parse means a layout read on every colour at
// startup. These are the same eleven colours, converted once.
//
// If you change a `--night-*` or `--pop-*` token in globals.css, change it
// here too. There is no mechanism that will tell you that you forgot.

export const NIGHT = {
  ink: '#090d13', // --ink              oklch(0.158 0.014 252)
  inkRaise: '#141a20', // --ink-raise        oklch(0.213 0.016 252)
  grid: '#1a1f25', // --night-grid       oklch(0.238 0.013 252)
  hairline: '#2d333a', // --night-hairline   oklch(0.318 0.016 252)
  bone: '#ece9e4', // --bone             oklch(0.935 0.008 85)
  dim: '#7f858c', // --night-dim        oklch(0.615 0.013 252)
  roadMajor: '#626a73', // --night-road-major oklch(0.520 0.018 252)
  roadMinor: '#383e44', // --night-road-minor oklch(0.360 0.014 252)
  spectator: '#39a3ff', // --pop-spectator    oklch(0.700 0.170 250)
  resident: '#51c672', // --pop-resident     oklch(0.740 0.160 150)
  business: '#fca942', // --pop-business     oklch(0.800 0.150 68)
} as const;
