// app/page.tsx — P1, landing page.
//
// A server component, and it must stay one: no hooks, no store, no client
// JavaScript at all. The corridor drawing is generated at module scope, so this
// page is static HTML and CSS end to end.
//
// It is deliberately dark in both themes — see the .night block in globals.css.
// `/` is a planning console; `/plan` is the app screen. They share the drawing
// language so the two pages read as one object.
//
// The accent (--night-accent, set by AccentProvider) runs through the chrome
// here and through the model's own lighting, so picking a swatch visibly
// changes the page. What it does NOT move is the three population colours
// inside the drawing — spectator blue, resident green, business amber encode
// which population is which, and /plan uses the same three.

import Link from 'next/link';
import { CorridorField } from '@/components/home/CorridorField';
import { CorridorScene } from '@/components/home/CorridorScene';
import { AccentProvider } from '@/components/home/AccentProvider';
import { AccentSelector } from '@/components/home/AccentSelector';
import { StackLoop } from '@/components/home/StackLoop';

const GUTTER = 'px-5 sm:px-8 lg:px-12';

const READOUT = [
  { label: 'Scenario', value: 'Rose Bowl / LA28' },
  { label: 'Origin', value: '0, 0' },
  { label: 'Extent', value: '3.9 × 2.4 km' },
];

export default function Home() {
  return (
    <AccentProvider>
      <main className="night flex min-h-dvh flex-col">
      {/* ---- instrument chrome ---- */}
      <header className="relative z-20 border-b border-[var(--night-hairline)]">
        <div className={`${GUTTER} flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5`}>
          <p className="flex items-center gap-2.5 text-sm font-semibold tracking-[0.26em] uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-[var(--night-accent)]" />
            Arroyo
          </p>
          <dl className="ml-auto flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] tracking-[0.14em] text-[var(--night-dim)] uppercase tabular-nums">
            {READOUT.map((r) => (
              <div key={r.label} className="flex gap-1.5">
                <dt>{r.label}</dt>
                <dd className="font-medium text-[var(--bone)]">{r.value}</dd>
              </div>
            ))}
          </dl>
          <div className="ml-auto flex items-center gap-4 lg:ml-5">
            <span aria-hidden className="hidden h-4 w-px bg-[var(--night-hairline)] lg:block" />
            <AccentSelector />
          </div>
        </div>
      </header>

      {/* ---- hero ---- */}
      {/* `grid-cols-[minmax(0,1fr)]` is load-bearing. An `auto` grid track
          sizes to its item's MAX-content, and the ticker's track is one long
          unwrapped line — so the copy column grew to 488px inside a 375px
          phone and the paragraph was clipped rather than wrapped. The
          minmax(0,...) lets the track refuse to grow past the container. */}
      <section className="relative grid flex-1 grid-cols-[minmax(0,1fr)] items-center overflow-hidden">
        {/* the field. The grid used to be a CSS background here; it now lives
            on the ground plane inside the drawing, because a square backdrop
            grid behind a projected plan reads as two surfaces, not one. */}
        <div
          aria-hidden
          className="relative aspect-[16/9] max-w-full border-t border-[var(--night-hairline)] lg:absolute lg:inset-0 lg:aspect-auto lg:border-t-0"
        >
          <CorridorScene>
            <CorridorField />
          </CorridorScene>
        </div>

        {/* scrim, so the type sits on near-solid ground over the drawing */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden lg:block"
          style={{
            background:
              'linear-gradient(101deg, var(--ink) 0%, var(--ink) 26%,' +
              ' color-mix(in oklab, var(--ink), transparent 32%) 48%,' +
              ' color-mix(in oklab, var(--ink), transparent 88%) 72%, transparent 100%)',
          }}
        />

        <div
          className={`${GUTTER} relative z-10 order-first flex min-w-0 max-w-2xl flex-col gap-7 py-10 lg:order-none lg:py-16`}
        >
          <p className="flex items-center gap-2.5 font-mono text-[10px] tracking-[0.22em] text-[var(--night-accent)] uppercase">
            <span aria-hidden className="h-px w-6 bg-[var(--night-accent)] opacity-70" />
            Last-mile planning sandbox
          </p>

          <h1 className="text-[clamp(2.1rem,5.4vw,4.2rem)] leading-[0.99] font-medium tracking-[-0.035em] text-balance">
            Cities plan the stadium.{' '}
            <span
              style={{
                color: 'color-mix(in oklab, var(--night-accent) 42%, var(--night-dim))',
              }}
            >
              Nobody plans the mile around it.
            </span>
          </h1>

          <p className="max-w-[30rem] text-[1.0625rem] leading-relaxed font-light text-[var(--night-dim)]">
            Ninety thousand people leave in an hour, through somebody&rsquo;s neighbourhood.
            Build the last mile &mdash;{' '}
            <strong className="font-normal text-[var(--bone)]">
              and see what your plan costs each of them.
            </strong>
          </p>

          <div className="flex flex-wrap items-center gap-5">
            <Link
              href="/plan"
              className="inline-flex items-center gap-3 rounded-[2px] border border-[var(--night-accent)] px-5 py-3 font-mono text-xs tracking-[0.16em] text-[var(--night-accent)] uppercase transition-colors hover:bg-[var(--night-accent)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--night-accent)]"
            >
              Open the planner
              <svg viewBox="0 0 13 9" fill="none" aria-hidden className="h-[9px] w-[13px]">
                <path d="M0 4.5h11M8 1l3.5 3.5L8 8" stroke="currentColor" strokeWidth={1.2} />
              </svg>
            </Link>
          </div>

          {/* Built with — under the call to action, inside the copy column,
              the way the Marketeer and Doppel heroes carry theirs. It is held
              to the column's width on purpose: run full-bleed it reads as a
              footer strip, and this page has no footer. */}
          <div className="w-full min-w-0 max-w-md">
            <p className="mb-2.5 font-mono text-[10px] tracking-[0.18em] text-[var(--night-accent)] uppercase">
              Built with
            </p>
            <StackLoop />
          </div>
        </div>
      </section>
      </main>
    </AccentProvider>
  );
}
