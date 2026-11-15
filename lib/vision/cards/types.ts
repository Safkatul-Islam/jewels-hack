import type { Vec2 } from '../../sim/types';

export type { Vec2 };

/** RGBA pixels, row-major, 4 bytes per pixel. A browser ImageData satisfies this. */
export interface Frame {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/**
 * Image-space pixel corners, clockwise as seen in the image (Y down), where
 * corners[0] -> corners[1] is a SHORT edge of the card. In a CardReading the
 * order is the card's own top-left, top-right, bottom-right, bottom-left, the
 * same convention as a PixelMarker, unless `headingAmbiguous` is true.
 */
export type CardCorners = readonly [Vec2, Vec2, Vec2, Vec2];

export interface CardQuad {
  corners: CardCorners;
}

/** One enrolled reference appearance. `feature` comes from `describeCard`. */
export interface EnrolledCard {
  id: string;
  feature: Float32Array;
  /**
   * Declares that the face is printed point-symmetric (two-headed court cards,
   * most pip cards). Its readings then always report `headingAmbiguous: true`:
   * print misregistration and lighting can make one orientation score slightly
   * higher, but that preference is not evidence of which end is which.
   */
  pointSymmetric?: boolean;
}

export type CardRejection =
  /** Best match is below the minimum score: probably not an enrolled card. */
  | 'low_score'
  /** Two enrolled cards explain this quad about equally well. */
  | 'ambiguous_identity'
  /** A stronger reading in the same frame already claimed this identity. */
  | 'duplicate_identity';

export interface CardReading {
  corners: CardCorners;
  /** Enrolled id, or null when the match was rejected. Never a nearest guess. */
  identity: string | null;
  /** Cosine similarity to the best enrolled appearance, -1..1. Not a probability. */
  score: number;
  /** Similarity to the second-best enrolled card; 0 when fewer than two are enrolled. */
  runnerUpScore: number;
  /**
   * True when the upright and 180-degree-turned comparisons are too close to tell
   * apart, when the enrolled card is declared `pointSymmetric`, or when the
   * reading was rejected.
   * The heading is then only known modulo 180 degrees.
   */
  headingAmbiguous: boolean;
  rejection: CardRejection | null;
}

// ---- the subset of js-aruco2's CV module this package uses (src/cv.js, v2.0.0) ----

export interface CvImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export type CvContour = Vec2[] & { hole?: boolean };

export interface CvApi {
  grayscale(source: Frame, destination: CvImage): CvImage;
  /** Marks pixels darker than their box-blurred neighbourhood by at least `threshold`. */
  adaptiveThreshold(source: CvImage, destination: CvImage, kernelSize: number, threshold: number): CvImage;
  findContours(source: CvImage, binaryScratch: Int32Array): CvContour[];
  approxPolyDP(contour: Vec2[], epsilon: number): Vec2[];
  isContourConvex(contour: Vec2[]): boolean;
}
