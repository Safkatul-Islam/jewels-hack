export type Metrics = {
  egressMedianMin: number;
  egressP90Min: number;
  transitModeSharePct: number;
  residentDelayMin: number;
  residentsBlockedPct: number;
  localRevenueUsd: number;
  vendorRevenueUsd: number;
  localCapturePct: number;
  businessesNetPositive: number;
  crowdPeakPerM2: number;
};

export type Score = {
  total: number;
  games: number;
  livability: number;
  economy: number;
};

export type SimResult = {
  metrics: Metrics;
  score: Score;
  heatmaps: {
    pedestrian: {
      cellM: number;
      cols: number;
      rows: number;
      origin: { x: number; y: number };
      values: number[];
    };
    congestion: {
      cellM: number;
      cols: number;
      rows: number;
      origin: { x: number; y: number };
      values: number[];
    };
  };
  timeline: Array<{
    minute: number;
    inside: number;
    onFoot: number;
    onShuttle: number;
    inCar: number;
  }>;
  perBusiness: Array<{ id: string; revenueUsd: number; deltaPct: number }>;
  perAnchor: Array<{ id: string; departures: number; peakLoadPct: number }>;
  warnings: string[];
  runtimeMs: number;
};

export const mockResult: SimResult = {
  metrics: {
    egressMedianMin: 26,
    egressP90Min: 58,
    transitModeSharePct: 42,
    residentDelayMin: 18,
    residentsBlockedPct: 12,
    localRevenueUsd: 142000,
    vendorRevenueUsd: 86000,
    localCapturePct: 62,
    businessesNetPositive: 31,
    crowdPeakPerM2: 2.4,
  },
  score: {
    total: 74,
    games: 71,
    livability: 68,
    economy: 81,
  },
  heatmaps: {
    pedestrian: {
      cellM: 25,
      cols: 20,
      rows: 16,
      origin: { x: -250, y: -200 },
      values: Array.from({ length: 320 }, (_, index) => {
        const row = Math.floor(index / 20);
        const col = index % 20;
        return Math.max(0.1, ((row + col) / 25) * 2.8 + 0.35);
      }),
    },
    congestion: {
      cellM: 25,
      cols: 20,
      rows: 16,
      origin: { x: -250, y: -200 },
      values: Array.from({ length: 320 }, (_, index) => {
        const row = Math.floor(index / 20);
        const col = index % 20;
        return Math.max(0.05, ((row * 0.8 + col * 0.6) / 24) + 0.2);
      }),
    },
  },
  timeline: [
    { minute: 0, inside: 8200, onFoot: 2700, onShuttle: 1400, inCar: 900 },
    { minute: 5, inside: 18500, onFoot: 6200, onShuttle: 3100, inCar: 1800 },
    { minute: 10, inside: 34200, onFoot: 12000, onShuttle: 5600, inCar: 2900 },
    { minute: 15, inside: 47000, onFoot: 15400, onShuttle: 8100, inCar: 3500 },
    { minute: 20, inside: 57200, onFoot: 17800, onShuttle: 9650, inCar: 4300 },
    { minute: 25, inside: 61100, onFoot: 18700, onShuttle: 10100, inCar: 4500 },
    { minute: 30, inside: 48200, onFoot: 14300, onShuttle: 7900, inCar: 3900 },
    { minute: 35, inside: 35100, onFoot: 10200, onShuttle: 5600, inCar: 3100 },
    { minute: 40, inside: 21100, onFoot: 6300, onShuttle: 3400, inCar: 2200 },
    { minute: 45, inside: 9400, onFoot: 2600, onShuttle: 1500, inCar: 1100 },
  ],
  perBusiness: [
    { id: 'biz-1', revenueUsd: 38100, deltaPct: 18 },
    { id: 'biz-2', revenueUsd: 26200, deltaPct: 8 },
    { id: 'biz-3', revenueUsd: 41900, deltaPct: 24 },
    { id: 'biz-4', revenueUsd: 30500, deltaPct: 11 },
    { id: 'biz-5', revenueUsd: 28900, deltaPct: 6 },
  ],
  perAnchor: [
    { id: 'anchor-rail', departures: 28100, peakLoadPct: 71 },
    { id: 'anchor-parking', departures: 19600, peakLoadPct: 58 },
    { id: 'anchor-bus', departures: 16300, peakLoadPct: 48 },
  ],
  warnings: [
    'Shuttle hub is slightly over capacity during the 20-minute peak.',
    'Two residential blocks have elevated delay under current settings.',
  ],
  runtimeMs: 286,
};
