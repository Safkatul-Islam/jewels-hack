// components/home/StackLoop.tsx — P1
//
// The "built with" ticker: a seamless marquee of the stack this is made from,
// as brand marks with their names.
//
// It is modelled on the LogoLoop component in the Marketeer and Doppel repos,
// and it keeps that component's actual behaviours — a seamless infinite loop,
// pause on hover, a fade at both edges, and freezing under reduced motion —
// but it is NOT a port of it, for two reasons.
//
// 1. LogoLoop drives the loop from requestAnimationFrame. This page already
//    runs a WebGL render loop for the corridor model; adding a second rAF loop
//    to slide a strip sideways is work the compositor will do for free from a
//    CSS animation.
// 2. Being CSS-only keeps this a SERVER component. The landing page ships its
//    whole first paint without JavaScript, and a ticker is not a good reason
//    to give that up.
//
// The seam: the list is rendered exactly twice and the track translates by
// -50%. At -50% the second copy sits precisely where the first began, so the
// restart is invisible. Render it any other number of times and it jumps.

import { STACK_ICONS } from './stackIcons';

/** Things in the stack with no brand mark worth drawing — name only. */
const EXTRA = ['Zustand', 'Recharts', 'Base UI'];

function Run({ hidden }: { hidden?: boolean }) {
  return (
    <ul
      aria-hidden={hidden}
      className="flex shrink-0 items-center gap-x-7 pr-7 font-mono text-[10px] tracking-[0.16em] whitespace-nowrap text-[var(--night-dim)] uppercase"
    >
      {STACK_ICONS.map((icon) => (
        <li key={icon.id} className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-3.5 shrink-0 text-[var(--night-accent)] opacity-80"
          >
            <path d={icon.d} fill="currentColor" />
          </svg>
          {icon.label}
        </li>
      ))}
      {EXTRA.map((label) => (
        <li key={label} className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-1 shrink-0 rounded-full bg-[var(--night-accent)] opacity-70"
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function StackLoop() {
  return (
    <div className="stack-loop relative overflow-hidden" role="region" aria-label="Built with">
      {/* Edge fades, so the strip reads as continuing past the frame rather
          than being chopped off at it. Kept narrow: the track moves left, so
          the left edge is where items LEAVE and the right is where they
          arrive, and a wide fade at the column's own left margin just looks
          like the first word failed to render. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5"
        style={{ background: 'linear-gradient(to right, var(--ink), transparent)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8"
        style={{ background: 'linear-gradient(to left, var(--ink), transparent)' }}
      />
      <div className="stack-loop-track flex w-max">
        <Run />
        <Run hidden />
      </div>
    </div>
  );
}
