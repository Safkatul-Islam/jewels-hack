// app/page.tsx — P1, landing page.
//
// A server component, and it must stay one: no hooks, no store, no client
// JavaScript at all. The corridor drawing is generated at module scope, so this
// page is static HTML and CSS end to end.
//
// It is deliberately dark in both themes — see the .night block in globals.css.
// `/` is a planning console; `/plan` is the app screen. They share the drawing
// language (grid, hairline roads, venue circle, anchor squares, scale bar) so
// the two pages read as one object.
//
// Numbers here come from the default scenario's spec: 88,000 spectators and
// 4,200 resident trips are SimParams defaults, 40 is the business count.

import Link from 'next/link';
import { CorridorField } from '@/components/home/CorridorField';

const GUTTER = 'px-5 sm:px-8 lg:px-12';

const POPULATIONS = [
  {
    name: 'Spectators',
    value: '88,000',
    note: 'out in 60 min',
    color: 'var(--pop-spectator)',
  },
  {
    name: 'Residents',
    value: '4,200',
    note: 'trips through it',
    color: 'var(--pop-resident)',
  },
  {
    name: 'Businesses',
    value: '40',
    note: 'on the corridor',
    color: 'var(--pop-business)',
  },
];

const READOUT = [
  { label: 'Scenario', value: 'Rose Bowl / LA28' },
  { label: 'Origin', value: '0, 0' },
  { label: 'Extent', value: '3.9 × 2.4 km' },
];

export default function Home() {
  return (
    <main className="night flex min-h-dvh flex-col">
      {/* ---- instrument chrome ---- */}
      <header className="relative z-20 border-b border-[var(--night-hairline)]">
        <div className={`${GUTTER} flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5`}>
          <p className="text-sm font-semibold tracking-[0.26em] uppercase">Arroyo</p>
          <dl className="ml-auto flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] tracking-[0.14em] text-[var(--night-dim)] uppercase tabular-nums">
            {READOUT.map((r) => (
              <div key={r.label} className="flex gap-1.5">
                <dt>{r.label}</dt>
                <dd className="font-medium text-[var(--bone)]">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {/* ---- hero ---- */}
      <section className="relative grid flex-1 items-center overflow-hidden">
        {/* the field: grid backdrop + corridor drawing */}
        <div
          aria-hidden
          className="relative aspect-[4/3] max-w-full border-t border-[var(--night-hairline)] bg-[length:68px_68px] bg-center lg:absolute lg:inset-0 lg:aspect-auto lg:border-t-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--night-grid) 1px, transparent 1px),' +
              'linear-gradient(to bottom, var(--night-grid) 1px, transparent 1px)',
          }}
        >
          <CorridorField />
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
          className={`${GUTTER} relative z-10 order-first flex max-w-2xl flex-col gap-7 py-10 lg:order-none lg:py-16`}
        >
          <p className="flex items-center gap-2.5 font-mono text-[10px] tracking-[0.22em] text-[var(--night-dim)] uppercase">
            <span aria-hidden className="h-px w-6 bg-[var(--night-hairline)]" />
            Last-mile planning sandbox
          </p>

          <h1 className="text-[clamp(2.1rem,5.4vw,4.2rem)] leading-[0.99] font-medium tracking-[-0.035em] text-balance">
            Cities plan the stadium.{' '}
            <span className="text-[var(--night-dim)]">Nobody plans the mile around it.</span>
          </h1>

          <p className="max-w-[34rem] text-[0.975rem] leading-relaxed font-light text-[var(--night-dim)]">
            Ninety thousand people arrive over three hours and leave in one, through a corridor
            that is somebody&rsquo;s neighbourhood. Place the shuttle hubs, park-and-rides, vendor
            villages and closures &mdash; the network regenerates, and{' '}
            <strong className="font-normal text-[var(--bone)]">
              you see what your plan costs each of them.
            </strong>
          </p>

          <div className="flex flex-wrap items-center gap-5">
            <Link
              href="/plan"
              className="inline-flex items-center gap-3 rounded-[2px] border border-[var(--bone)] px-5 py-3 font-mono text-xs tracking-[0.16em] uppercase transition-colors hover:bg-[var(--bone)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--pop-spectator)]"
            >
              Open the planner
              <svg viewBox="0 0 13 9" fill="none" aria-hidden className="h-[9px] w-[13px]">
                <path d="M0 4.5h11M8 1l3.5 3.5L8 8" stroke="currentColor" strokeWidth={1.2} />
              </svg>
            </Link>
            <span className="font-mono text-[10px] tracking-[0.13em] text-[var(--night-dim)] uppercase">
              No optimal plan &mdash; only whose plan it is
            </span>
          </div>
        </div>
      </section>

      {/* ---- the three populations ---- */}
      <section className="relative z-20 border-t border-[var(--night-hairline)]">
        <dl
          className={`${GUTTER} grid gap-x-7 gap-y-4 py-4.5`}
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
        >
          {POPULATIONS.map((p) => (
            <div key={p.name} className="flex min-w-0 items-baseline gap-2.5">
              <span
                aria-hidden
                className="size-[7px] shrink-0 -translate-y-px rounded-full"
                style={{ background: p.color }}
              />
              <dt className="font-mono text-[10px] tracking-[0.16em] text-[var(--night-dim)] uppercase">
                {p.name}
              </dt>
              <dd className="ml-auto text-sm tabular-nums">
                {p.value}{' '}
                <span className="font-mono text-[10px] text-[var(--night-dim)]">{p.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
