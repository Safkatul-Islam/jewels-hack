// app/page.tsx — P1, landing page.
//
// A server component on purpose: no hooks, no store, nothing to hydrate. It
// exists to say what the thing is in fifteen seconds and then get out of the way.

import Link from 'next/link';
import { Button } from '@/components/ui/button';

const POPULATIONS = [
  {
    name: 'Spectators',
    want: 'In before kickoff, out fast afterwards.',
    metric: 'Egress p90, transit mode share',
  },
  {
    name: 'Residents',
    want: 'To get home down their own street.',
    metric: 'Added delay, blocked blocks',
  },
  {
    name: 'Local business',
    want: 'The crowd to walk past the door, not around it.',
    metric: 'Local revenue, local capture',
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col gap-5">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Arroyo
        </p>
        <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          Cities plan the stadium. Nobody plans the mile around it.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          A stadium holds 60–90,000 people. They arrive over three hours and leave in one, through a
          corridor of a mile or two that is somebody&rsquo;s neighbourhood — and where the small
          businesses are. ARROYO is a sandbox for that corridor: place the shuttle hubs,
          park-and-rides, vendor villages and road closures, and watch the network regenerate and
          the numbers move.
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        {POPULATIONS.map((p) => (
          <div key={p.name} className="flex flex-col gap-1.5 rounded-xl border p-4">
            <dt className="text-sm font-medium">{p.name}</dt>
            <dd className="text-xs leading-relaxed text-muted-foreground">{p.want}</dd>
            <dd className="mt-auto pt-2 text-[11px] text-muted-foreground tabular-nums">
              {p.metric}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed">
          There is no optimal plan. There&rsquo;s only whose plan it is — so the score has weights,
          and you move them.
        </p>
        <div className="flex items-center gap-3">
          {/* nativeButton={false}: Base UI warns unless it is told the rendered
              element is not a real <button>. Here it is an anchor. */}
          <Button nativeButton={false} render={<Link href="/plan" />}>
            Open the planner
          </Button>
          <span className="text-xs text-muted-foreground">
            A scenario is one JSON file. Any venue, any event.
          </span>
        </div>
      </div>
    </main>
  );
}
