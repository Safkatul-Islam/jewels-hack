// scripts/generate-forecourt-scenario.mjs — P1
//
//   node scripts/generate-forecourt-scenario.mjs > fixtures/scenario-forecourt.json
//
// The default scenario: ONE STREET in front of the venue.
//
// This replaces a 4.5 km district, and the reason is scale. A district puts
// 0.17 px on a metre, which makes a 2.6 m parking stall half a pixel and a
// bus bay six tenths of one — so the facilities, which are drawn at true
// dimensions, could never be seen. More importantly it answered the wrong
// question: the thing being planned is the venue's operational APRON, the
// temporary kit that goes up for an event and comes down after, which is
// exactly the seven piece kinds the palette hands you. The landing page's
// model already says this (components/home/corridorModel.ts); this makes
// /plan agree with it.
//
// So: the bowl at one end, a forecourt street running out of it, a transit
// interchange at the far end and a park-and-ride off to the side. The street
// opens with a plausible arrangement already on it, and the whole job is
// dragging that arrangement into a better one.
//
// There is no city. Residential blocks stay in the DATA — the engine samples
// resident trips from them and livability is scored off them, so deleting
// them would make a third of the plan score meaningless — but nothing draws
// them until a plan actually hurts one. Blank until it costs somebody.

const SNAP = 0.5;
const q = (v) => Math.round(v / SNAP) * SNAP;
const pt = (x, y) => ({ x: q(x), y: q(y) });
const nodeId = (p) => `n_${q(p.x)}_${q(p.y)}`;

// ---------------------------------------------------------------- the street
//
// Metres, venue at the origin, +y away from the bowl. The bowl is 250 m
// across, so the street starts clear of it at y = 150.

const STREET_X = 0;
const STREET_START = 150;
const STREET_END = 880;
/** Cross streets, which are what make the frontage into addressable parcels. */
const CROSS_Y = [300, 520, 740];
/** Service roads running parallel, behind the frontage on each side. */
const SERVICE_X = [-270, 270];

const roads = [];
let seq = 0;
const addRoad = (path, cls) => roads.push({ id: `r${seq++}`, path, class: cls });

// the spine: venue apron out to the interchange, broken at each junction so
// every crossing shares an exact coordinate with the street it crosses
// Starts at the apron kerb's own midpoint, not at STREET_START. buildNetwork
// snaps the venue to its NEAREST road node, which is on the kerb — so if the
// kerb and the spine only come close without sharing a coordinate, the venue
// lands in a disconnected component and nothing can leave it. Every metric
// comes back zero and the page looks broken rather than wrong.
const APRON_NODE = pt(0, 108);
const spine = [APRON_NODE, pt(STREET_X, STREET_START)];
for (const y of CROSS_Y) spine.push(pt(STREET_X, y));
spine.push(pt(STREET_X, STREET_END));
addRoad(spine, 'arterial');

// the apron kerb: a loop around the front of the bowl, so pedestrians leaving
// the venue have somewhere to be before they are on the street
addRoad(
  [pt(-150, STREET_START), pt(-80, 120), APRON_NODE, pt(80, 120), pt(150, STREET_START)],
  'collector',
);

for (const y of CROSS_Y) {
  addRoad([pt(SERVICE_X[0], y), pt(STREET_X, y), pt(SERVICE_X[1], y)], 'collector');
}
for (const x of SERVICE_X) {
  addRoad(
    [pt(x, CROSS_Y[0]), ...CROSS_Y.slice(1).map((y) => pt(x, y))],
    'local',
  );
}

// the two destinations the street exists to reach
const interchange = pt(STREET_X, STREET_END);
const lot = pt(470, 560);
addRoad([pt(STREET_X, CROSS_Y[2]), pt(240, 700), pt(470, 640), lot], 'arterial');

// ------------------------------------------------------------- the frontage
//
// Shopfronts line both sides of the street. They are the economy half of the
// argument and, at this scale, they are legible — which they never were when
// forty of them were scattered over four square kilometres.

const CATS = ['food', 'food', 'food', 'retail', 'retail', 'service'];
const BASE = { food: 540, retail: 780, service: 650 };
let bSeq = 0;
const businesses = [];
for (const side of [-1, 1]) {
  for (let y = 215; y < STREET_END - 40; y += 58) {
    // leave the junctions clear
    if (CROSS_Y.some((cy) => Math.abs(y - cy) < 34)) continue;
    const cat = CATS[bSeq % CATS.length];
    businesses.push({
      id: `business-${++bSeq}`,
      name: `${cat === 'food' ? 'Cafe' : cat === 'retail' ? 'Shop' : 'Service'} ${bSeq}`,
      pos: pt(side * 62, y),
      category: cat,
      baselineDailyRevenue: Math.round(BASE[cat] * (0.7 + ((bSeq * 37) % 70) / 100)),
      catchmentM: 80,
    });
  }
}

// ---------------------------------------------------------------- the blocks
//
// The people who live behind the shops. Kept so the engine can charge the plan
// for what it does to them; never drawn unless it does.

const blocks = [];
let blSeq = 0;
for (const side of [-1, 1]) {
  for (let i = 0; i < CROSS_Y.length - 1; i++) {
    const y0 = CROSS_Y[i];
    const y1 = CROSS_Y[i + 1];
    const xa = side * 110;
    const xb = side * 270;
    blocks.push({
      id: `block-${++blSeq}`,
      polygon: [pt(xa, y0 + 14), pt(xb, y0 + 14), pt(xb, y1 - 14), pt(xa, y1 - 14)],
      population: 180 + ((blSeq * 97) % 240),
      // Real junctions on the service road and the cross streets.
      accessNodeIds: [
        nodeId(pt(side * 270, y0)),
        nodeId(pt(side * 270, y1)),
        nodeId(pt(STREET_X, y0)),
        nodeId(pt(STREET_X, y1)),
      ],
    });
  }
}

// ------------------------------------------------- the arrangement it starts with
//
// A plausible plan, not a good one — the whole exercise is improving it. The
// gate throttles the bowl, the corridor carries people up the street, the
// village sits where the footfall is, the hub is too far up and the lot is
// across the junction from it.

const pieces = [
  { id: 'gate-1', kind: 'security_gate', pos: pt(0, 178), rotation: 0, capacity: 9000 },
  { id: 'corridor-1', kind: 'ped_corridor', pos: pt(0, 420), rotation: 0, capacity: 1800 },
  { id: 'vendors-1', kind: 'vendor_village', pos: pt(-150, 370), rotation: 0, capacity: 40 },
  { id: 'bike-1', kind: 'bike_valet', pos: pt(160, 250), rotation: 0, capacity: 800 },
  { id: 'hub-1', kind: 'shuttle_hub', pos: pt(150, 640), rotation: 0, capacity: 6000 },
  { id: 'lot-1', kind: 'park_and_ride', pos: pt(470, 480), rotation: 0, capacity: 1200 },
];

// ------------------------------------------------------------------ the world

const xs = [...roads.flatMap((r) => r.path.map((p) => p.x)), lot.x];
const ys = [...roads.flatMap((r) => r.path.map((p) => p.y)), lot.y, -170];
// Tight. The street IS the subject, so margin is wasted canvas.
const pad = 70;
const bbox = {
  minX: q(Math.min(...xs) - pad),
  minY: q(Math.min(...ys) - pad),
  maxX: q(Math.max(...xs) + pad),
  maxY: q(Math.max(...ys) + pad),
};

process.stdout.write(
  JSON.stringify(
    {
      version: 1,
      scenario: {
        id: 'forecourt',
        name: 'Venue forecourt — illustrative',
        event: 'Major stadium event — planning sandbox',
        blurb:
          'One street in front of the venue, with the event kit already on it. ' +
          'Demand, revenue and geography are invented for demonstration and ' +
          'describe no real place.',
      },
      bbox,
      basemap: { kind: 'grid', spacingM: 100 },
      venue: { pos: pt(0, 0), name: 'Forecourt Stadium — illustrative', capacity: 88000, locked: true },
      anchors: [
        {
          id: 'primary',
          name: 'Transit interchange',
          pos: interchange,
          mode: 'rail',
          capacityPerHour: 42000,
          arrivalShare: 0.64,
          locked: true,
        },
        {
          id: 'lot',
          name: 'Taxi & park-and-ride',
          pos: lot,
          mode: 'parking',
          capacityPerHour: 24000,
          arrivalShare: 0.36,
          locked: true,
        },
      ],
      baseRoads: roads,
      pieces,
      businesses,
      blocks,
      personas: [
        { id: 'resident-1', name: 'Maya', role: 'Lives on the street behind the shops', kind: 'resident', pos: pt(-190, 410) },
        { id: 'resident-2', name: 'Theo', role: 'Driveway opens onto the corridor', kind: 'resident', pos: pt(190, 630) },
        { id: 'spectator-1', name: 'Priya', role: 'Arrives by rail', kind: 'spectator', pos: interchange },
        { id: 'spectator-2', name: 'Dan', role: 'Drove and parked', kind: 'spectator', pos: lot },
        { id: 'business-1', name: 'Rosa', role: 'Runs a cafe on the street', kind: 'business', pos: businesses[2].pos },
        { id: 'business-2', name: 'Ken', role: 'Runs a shop by the junction', kind: 'business', pos: businesses[9].pos },
      ],
      params: {
        spectators: 88000,
        sampleAgents: 2000,
        residentTrips: 4200,
        arrivalWindowMin: 180,
        egressWindowMin: 60,
        seed: 42,
        ticksPerMin: 1,
        conversionRate: 0.08,
        avgTicket: { food: 14, retail: 22, service: 18 },
        exclusionRadiusM: 150,
      },
    },
    null,
    1,
  ) + '\n',
);
