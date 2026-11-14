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
		<main className="min-h-screen bg-[#050b14] text-slate-100">
			<div className="mx-auto max-w-[1500px] px-4 py-4 md:px-5">
				<header className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.8)] backdrop-blur-md">
					<div className="flex items-center gap-3">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-300">
							A
						</div>
						<div>
							<div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">Arroyo</div>
							<div className="text-sm font-medium text-slate-100">Plan review</div>
						</div>
					</div>

					<div className="hidden items-center gap-6 text-[10px] uppercase tracking-[0.18em] text-slate-400 md:flex">
						<span>Rose Bowl</span>
						<span>Baseline</span>
						<span>Scenario</span>
					</div>

					<div className="flex items-center gap-2">
						<button className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10">
							Compare
						</button>
						<button className="rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300">
							Run sim
						</button>
					</div>
				</header>

				<div className="mt-4 grid gap-4 xl:grid-cols-[1.75fr_1.05fr]">
					<section className="relative min-h-[610px] overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(135deg,#111827_0%,#0f172a_45%,#020617_100%)] shadow-[0_30px_80px_rgba(2,6,23,0.9)]">
						<div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:28px_28px] opacity-40" />
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.38)_60%,rgba(2,6,23,0.7)_100%)]" />

						<div className="absolute inset-x-8 top-7 flex items-center justify-between text-[9px] uppercase tracking-[0.28em] text-slate-400">
							<span>Venue</span>
							<span>Arrival anchors</span>
							<span>Corridor</span>
						</div>

						<div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-[32%] border border-emerald-400/25 bg-emerald-500/5 shadow-[0_0_70px_rgba(16,185,129,0.15)]" />
						<div className="absolute left-[18%] top-[32%] h-20 w-20 rounded-full border border-emerald-300/30 bg-emerald-500/5" />
						<div className="absolute right-[18%] top-[42%] h-16 w-16 rounded-full border border-emerald-300/25 bg-emerald-500/5" />
						<div className="absolute left-[54%] top-[18%] h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" />
						<div className="absolute left-[57%] top-[66%] h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.9)]" />

						<div className="absolute inset-x-0 bottom-4 mx-auto w-[90%] max-w-[820px] rounded-[20px] border border-slate-200/10 bg-slate-950/70 p-2.5 shadow-[0_25px_60px_rgba(2,6,23,0.9)] backdrop-blur-xl">
							<div className="mb-2 flex items-center justify-between">
								<div className="text-[9px] uppercase tracking-[0.22em] text-slate-400">Live plan</div>
								<div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-emerald-200">
									Current
								</div>
							</div>

							<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
								<MetricCard label="Egress P90" value={`${metrics.egressP90Min} min`} delta="-7 min" tone="good" />
								<MetricCard label="Transit share" value={`${metrics.transitModeSharePct}%`} delta="+8 pts" tone="good" />
								<MetricCard label="Resident delay" value={`${metrics.residentDelayMin} min`} delta="+3 min" tone="warning" />
								<MetricCard label="Local capture" value={`${metrics.localCapturePct}%`} delta="+12 pts" tone="good" />
							</div>
						</div>
					</section>

					<aside className="space-y-2.5">
						<div className="grid gap-2.5 xl:grid-cols-2">
							<div className="rounded-[18px] border border-slate-200/10 bg-slate-900/80 p-2.5 shadow-[0_20px_50px_rgba(2,6,23,0.7)] backdrop-blur-md">
								<div className="mb-2 flex items-center justify-between">
									<div className="text-[9px] uppercase tracking-[0.24em] text-slate-400">Window</div>
									<div className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-slate-300">
										Model
									</div>
								</div>
								<div className="rounded-xl border border-slate-200/10 bg-slate-950/60 p-2">
									<ScoreDial value={score.total} label="Plan score" />
								</div>
							</div>

							<div className="rounded-[18px] border border-slate-200/10 bg-slate-900/80 p-2.5 shadow-[0_20px_50px_rgba(2,6,23,0.7)] backdrop-blur-md">
								<WeightSliders weights={weights} onChange={setWeights} />
							</div>
						</div>

						<div className="rounded-[18px] border border-slate-200/10 bg-slate-900/80 p-2.5 shadow-[0_20px_50px_rgba(2,6,23,0.7)] backdrop-blur-md">
							<div className="mb-2 text-[9px] uppercase tracking-[0.22em] text-slate-400">Summary</div>
							<div className="grid gap-2 sm:grid-cols-2">
								<MetricCard label="Median egress" value={`${metrics.egressMedianMin} min`} tone="neutral" />
								<MetricCard label="Resident blocked" value={`${metrics.residentsBlockedPct}%`} tone="warning" />
								<MetricCard label="Local revenue" value={formatCurrency(metrics.localRevenueUsd)} tone="good" />
								<MetricCard label="Vendor revenue" value={formatCurrency(metrics.vendorRevenueUsd)} tone="neutral" />
							</div>
						</div>

						<div className="rounded-[18px] border border-slate-200/10 bg-slate-900/80 p-2.5 shadow-[0_20px_50px_rgba(2,6,23,0.7)] backdrop-blur-md">
							<div className="mb-2 text-[9px] uppercase tracking-[0.22em] text-slate-400">Egress timeline</div>
							<div className="grid grid-cols-6 gap-2">
								{timeline.map((point) => (
									<div key={point.minute} className="rounded-xl bg-slate-800/80 p-1.5 text-center">
										<div className="text-[9px] uppercase tracking-[0.18em] text-slate-400">{point.minute}</div>
										<div className="mt-1 text-[11px] font-medium text-slate-100">{point.total.toLocaleString()}</div>
									</div>
								))}
							</div>
						</div>

						<div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-2">
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
						</div>

						<div className="rounded-[18px] border border-slate-200/10 bg-slate-900/80 p-2.5 shadow-[0_20px_50px_rgba(2,6,23,0.7)] backdrop-blur-md">
							<PersonaPanel personas={personas} />
						</div>
					</aside>
				</div>
			</div>
		</main>
	);
}
