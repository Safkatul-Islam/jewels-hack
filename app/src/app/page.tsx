"use client";

import { useMemo, useState } from "react";
import { HeatmapPanel } from "@/components/dashboard/HeatmapPanel";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PersonaPanel } from "@/components/dashboard/PersonaPanel";
import { ScoreDial } from "@/components/dashboard/ScoreDial";
import { WeightSliders } from "@/components/dashboard/WeightSliders";
import { mockResult } from "@/lib/mock-result";

const personas = [
	{
		name: "Marta L.",
		role: "Resident near the corridor",
		quote: "We need a plan that keeps our streets usable at night, not just the event hours.",
		sentiment: "mixed",
	},
	{
		name: "Rafael C.",
		role: "Owner of a neighborhood market",
		quote: "The better the flow, the better my customers can reach the storefront without being pushed off the sidewalk.",
		sentiment: "positive",
	},
	{
		name: "Diana K.",
		role: "Commuter returning home",
		quote: "If the street closes, I lose 30 minutes and my groceries are the least of it.",
		sentiment: "negative",
	},
] as const;

const formatCurrency = (value: number) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits: 0,
	}).format(value);

export default function Home() {
	const [weights, setWeights] = useState({ games: 1, livability: 1, economy: 1 });

	const metrics = mockResult.metrics;
	const score = mockResult.score;

	const timeline = useMemo(
		() =>
			mockResult.timeline.map((point) => ({
				...point,
				total: point.inside + point.onFoot + point.onShuttle + point.inCar,
			})),
		[],
	);

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_20%),linear-gradient(135deg,#0f172a_0%,#111827_35%,#020617_100%)] text-slate-50">
			<div className="mx-auto max-w-7xl px-6 py-8">
				<header className="flex items-center justify-between rounded-full border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
					<div className="flex items-center gap-3">
						<div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/20 text-sm font-semibold text-emerald-300">
							A
						</div>
						<div>
							<div className="text-xs uppercase tracking-[0.26em] text-slate-300">Arroyo</div>
						</div>
					</div>

					<nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
						<a href="#overview" className="transition hover:text-white">Overview</a>
						<a href="#window" className="transition hover:text-white">Window</a>
						<a href="#voices" className="transition hover:text-white">Voices</a>
					</nav>

					<button className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20">
						Open plan
					</button>
				</header>

				<section className="mt-10 grid items-center gap-10 lg:grid-cols-[1.05fr_1.2fr]">
					<div className="max-w-xl">
						<div className="mb-4 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.28em] text-emerald-200">
							Venue planning cockpit
						</div>

						<h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
							Design the last mile before the crowd arrives.
						</h1>

						<p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
							Balance spectators, residents, and local businesses in one live planning window.
							Move the network, test the tradeoff, and explain the impact in real time.
						</p>

						<div className="mt-8 flex flex-wrap gap-3">
							<button className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">
								Launch planning window
							</button>
							<button className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
								Explore baseline
							</button>
						</div>

						<div className="mt-10 flex flex-wrap gap-3 text-sm text-slate-300">
							<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">90k spectators</span>
							<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">3 populations</span>
							<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Any venue</span>
						</div>
					</div>

					<div className="relative flex min-h-[480px] items-center justify-center">
						<div className="absolute inset-0 rounded-[32px] border border-white/10 bg-white/5 shadow-[0_30px_120px_rgba(16,185,129,0.12)] backdrop-blur-sm" />
						<div className="absolute inset-8 rounded-[28px] border border-emerald-300/20 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.18),_transparent_55%)]" />

						<div className="absolute h-72 w-72 rounded-full border border-emerald-300/40 bg-emerald-400/5" />
						<div className="absolute h-56 w-56 rounded-full border border-emerald-300/20" />
						<div className="absolute h-80 w-80 rounded-[36%] rotate-12 border border-white/10 bg-slate-900/40 shadow-[inset_0_0_40px_rgba(255,255,255,0.04)]" />

						<div className="relative z-10 w-[92%] max-w-[760px] rounded-[28px] border border-slate-200/20 bg-slate-950/75 p-4 shadow-[0_20px_80px_rgba(2,6,23,0.8)] backdrop-blur-xl">
							<div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-300">
								<span>Planning window</span>
								<span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-200">Live</span>
							</div>

							<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
								<MetricCard label="Egress P90" value={`${metrics.egressP90Min} min`} delta="-7 min" tone="good" />
								<MetricCard label="Transit share" value={`${metrics.transitModeSharePct}%`} delta="+8 pts" tone="good" />
								<MetricCard label="Resident delay" value={`${metrics.residentDelayMin} min`} delta="+3 min" tone="warning" />
								<MetricCard label="Local capture" value={`${metrics.localCapturePct}%`} delta="+12 pts" tone="good" />
							</div>

							<div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
								<ScoreDial value={score.total} label="Plan score" />
								<div className="space-y-4">
									<WeightSliders weights={weights} onChange={setWeights} />
									<div className="rounded-2xl border border-slate-200/10 bg-white/5 p-4">
										<div className="mb-3 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-300">
											Score mix
										</div>
										<div className="space-y-3 text-sm text-slate-200">
											<div className="flex items-center justify-between">
												<span>Games</span>
												<span>{score.games}</span>
											</div>
											<div className="flex items-center justify-between">
												<span>Livability</span>
												<span>{score.livability}</span>
											</div>
											<div className="flex items-center justify-between">
												<span>Economy</span>
												<span>{score.economy}</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>

				<section id="overview" className="mt-10 rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
					<div className="mb-5 text-xs font-medium uppercase tracking-[0.24em] text-slate-300">
						Scenario insight
					</div>

					<div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
						<div className="rounded-2xl border border-slate-200/10 bg-slate-950/40 p-5">
							<div className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
								Egress timeline
							</div>
							<div className="grid grid-cols-6 gap-3">
								{timeline.map((point) => (
									<div key={point.minute} className="rounded-xl bg-slate-900/70 p-2 text-center">
										<div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
											{point.minute}
										</div>
										<div className="mt-2 text-sm font-medium text-slate-100">
											{point.total.toLocaleString()}
										</div>
									</div>
								))}
							</div>
						</div>

						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
							<MetricCard label="Median egress" value={`${metrics.egressMedianMin} min`} tone="neutral" />
							<MetricCard label="Resident blocked" value={`${metrics.residentsBlockedPct}%`} tone="warning" />
							<MetricCard label="Local revenue" value={formatCurrency(metrics.localRevenueUsd)} tone="good" />
							<MetricCard label="Vendor revenue" value={formatCurrency(metrics.vendorRevenueUsd)} tone="neutral" />
						</div>
					</div>
				</section>

				<section id="window" className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
					<HeatmapPanel
						title="Pedestrian density"
						values={mockResult.heatmaps.pedestrian.values}
						cols={mockResult.heatmaps.pedestrian.cols}
						rows={mockResult.heatmaps.pedestrian.rows}
					/>

					<HeatmapPanel
						title="Congestion"
						values={mockResult.heatmaps.congestion.values}
						cols={mockResult.heatmaps.congestion.cols}
						rows={mockResult.heatmaps.congestion.rows}
					/>
				</section>

				<section id="voices" className="mt-10">
					<PersonaPanel personas={personas} />
				</section>
			</div>
		</main>
	);
}
