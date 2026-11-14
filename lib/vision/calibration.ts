import type { PixelMarker, Vec2, VisionWorld } from './contracts';

type Matrix3 = [number, number, number, number, number, number, number, number, number];
export interface Calibration {
  mode: 'overhead' | 'planar';
  toWorld(point: Vec2): Vec2;
  toPixel(point: Vec2): Vec2;
}
export const centre = (marker: PixelMarker): Vec2 => ({
  x: marker.corners.reduce((sum, corner) => sum + corner.x, 0) / 4,
  y: marker.corners.reduce((sum, corner) => sum + corner.y, 0) / 4,
});
const finite = (p: Vec2) => Number.isFinite(p.x) && Number.isFinite(p.y);

function project(matrix: Matrix3, point: Vec2): Vec2 {
  const divisor = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  if (Math.abs(divisor) < 1e-10) throw new Error('Point is outside the calibrated plane.');
  return { x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / divisor,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / divisor };
}
function inverse(m: Matrix3): Matrix3 {
  const [a,b,c,d,e,f,g,h,i] = m;
  const result: Matrix3 = [e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  const determinant = a*result[0]+b*result[3]+c*result[6];
  if (Math.abs(determinant) < 1e-12) throw new Error('Calibration points are degenerate.');
  return result.map(value => value / determinant) as Matrix3;
}
function calibration(matrix: Matrix3, mode: Calibration['mode']): Calibration {
  const inv = inverse(matrix);
  return { mode, toWorld: point => project(matrix, point), toPixel: point => project(inv, point) };
}

/** Similarity transform only. Image y points down; world y points north/up.
 * Requires an approximately overhead, unmirrored camera. */
export function calibrateOverhead(markers: PixelMarker[], world: VisionWorld): Calibration | null {
  const venue = markers.find(marker => marker.id === 0);
  const anchor = markers.find(marker => marker.id === 1);
  if (!venue || !anchor || !world.anchors.length) return null;
  const a = centre(venue), b = centre(anchor), origin = world.venue.pos, target = world.anchors[0].pos;
  const px = b.x - a.x, py = -(b.y - a.y);
  const wx = target.x - origin.x, wy = target.y - origin.y;
  const pixelLength = Math.hypot(px, py), worldLength = Math.hypot(wx, wy);
  if (pixelLength < 20 || worldLength < 1e-6 || ![a,b,origin,target].every(finite)) return null;
  const angle = Math.atan2(wy, wx) - Math.atan2(py, px);
  const scale = worldLength / pixelLength, c = Math.cos(angle) * scale, s = Math.sin(angle) * scale;
  return calibration([c, s, origin.x-c*a.x-s*a.y, s, -c, origin.y-s*a.x+c*a.y, 0, 0, 1], 'overhead');
}

/** Four non-collinear table points, paired with world positions. Camera stays fixed.
 * Rectifies perspective on the table plane; does not estimate 3D pose/lens distortion. */
export function calibratePlanar(pixels: Vec2[], world: Vec2[]): Calibration {
  if (pixels.length !== 4 || world.length !== 4 || ![...pixels,...world].every(finite)) {
    throw new Error('Calibration needs four finite pixel/world point pairs.');
  }
  for (const points of [pixels, world]) {
    let sign = 0;
    for (let j=0;j<4;j++) {
      const a=points[j], b=points[(j+1)%4], c=points[(j+2)%4];
      const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
      if (Math.abs(cross)<1e-6 || (sign && Math.sign(cross)!==sign)) throw new Error('Select four corners in perimeter order, not a crossed or flat shape.');
      sign=Math.sign(cross);
    }
  }
  const rows: number[][] = [];
  pixels.forEach(({x,y}, index) => {
    const {x:u,y:v}=world[index];
    rows.push([x,y,1,0,0,0,-u*x,-u*y,u], [0,0,0,x,y,1,-v*x,-v*y,v]);
  });
  for (let col=0;col<8;col++) {
    let pivot=col;
    for(let row=col+1;row<8;row++) if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col])) pivot=row;
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const divisor=rows[col][col];
    if(Math.abs(divisor)<1e-10) throw new Error('Calibration points are too close together.');
    for(let k=col;k<9;k++) rows[col][k]/=divisor;
    for(let row=0;row<8;row++) if(row!==col) {
      const factor=rows[row][col];
      for(let k=col;k<9;k++) rows[row][k]-=factor*rows[col][k];
    }
  }
  return calibration([...rows.map(row=>row[8]),1] as Matrix3, 'planar');
}

export function bboxCorners(world: VisionWorld): Vec2[] {
  const b=world.bbox;
  return [{x:b.minX,y:b.maxY},{x:b.maxX,y:b.maxY},{x:b.maxX,y:b.minY},{x:b.minX,y:b.minY}];
}
