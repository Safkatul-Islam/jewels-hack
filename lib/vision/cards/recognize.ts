import { assertFeature, describeCard, prepareFrame, rotateFeature180, similarity } from './appearance';
import { detectCardQuads, type QuadOptions } from './quads';
import type { CardCorners, CardReading, CvApi, EnrolledCard, Frame } from './types';

export interface MatchOptions extends QuadOptions {
  /** Lowest similarity accepted as an enrolled card. */
  minScore?: number;
  /** Required lead of the best enrolled card over the second best. */
  minIdentityMargin?: number;
  /** Required lead of one 180-degree orientation over the other to report a heading. */
  minHeadingMargin?: number;
}

/**
 * Heuristic starting points chosen on synthetic scenes (see docs/08-PLAYING-CARDS.md).
 * They are not calibrated against real cards, lighting or cameras.
 */
export const MATCH_DEFAULTS = {
  minScore: 0.8,
  minIdentityMargin: 0.06,
  minHeadingMargin: 0.05,
} as const;

/**
 * Captures one card's reference appearance. The frame must show exactly one
 * card, lying the way "upright" should mean for that card.
 */
export function enrollCard(
  cv: CvApi,
  frame: Frame,
  id: string,
  options: QuadOptions & { pointSymmetric?: boolean } = {},
): EnrolledCard {
  if (!id.trim()) throw new Error('Enrollment needs a non-empty card id.');
  const quads = detectCardQuads(cv, frame, options);
  if (quads.length !== 1) {
    throw new Error(`Enrollment needs exactly one card in view; found ${quads.length}. Remove other cards and bright rectangles.`);
  }
  const feature = describeCard(prepareFrame(cv, frame), quads[0]!.corners);
  if (!feature.some((value) => value !== 0)) {
    throw new Error('Enrollment found a card outline with no printed pattern. Place the card face up.');
  }
  return options.pointSymmetric ? { id, feature, pointSymmetric: true } : { id, feature };
}

function turned(corners: CardCorners): CardCorners {
  return [corners[2], corners[3], corners[0], corners[1]];
}

/**
 * Detects card quads and matches each against the enrolled appearances.
 * Every detected quad is returned; an uncertain one has `identity: null` and a
 * `rejection` reason rather than the nearest enrolled card.
 */
export function recognizeCards(
  cv: CvApi,
  frame: Frame,
  enrolled: readonly EnrolledCard[],
  options: MatchOptions = {},
): CardReading[] {
  const settings = { ...MATCH_DEFAULTS, ...options };
  const ids = new Set<string>();
  for (const card of enrolled) {
    assertFeature(card.feature);
    if (ids.has(card.id)) throw new Error(`Card id "${card.id}" is enrolled twice. Enrolled ids must be unique.`);
    ids.add(card.id);
  }

  const quads = detectCardQuads(cv, frame, options);
  if (!quads.length) return [];
  const prepared = prepareFrame(cv, frame);

  const readings = quads.map(({ corners }): CardReading => {
    const upright = describeCard(prepared, corners);
    const flipped = rotateFeature180(upright);
    let best: { card: EnrolledCard; upright: number; flipped: number; score: number } | null = null;
    let runnerUpScore = 0;
    for (const card of enrolled) {
      const uprightScore = similarity(upright, card.feature);
      const flippedScore = similarity(flipped, card.feature);
      const score = Math.max(uprightScore, flippedScore);
      if (!best || score > best.score) {
        if (best) runnerUpScore = Math.max(runnerUpScore, best.score);
        best = { card, upright: uprightScore, flipped: flippedScore, score };
      } else {
        runnerUpScore = Math.max(runnerUpScore, score);
      }
    }
    if (!best || best.score < settings.minScore) {
      return { corners, identity: null, score: best?.score ?? 0, runnerUpScore, headingAmbiguous: true, rejection: 'low_score' };
    }
    if (best.score - runnerUpScore < settings.minIdentityMargin) {
      return { corners, identity: null, score: best.score, runnerUpScore, headingAmbiguous: true, rejection: 'ambiguous_identity' };
    }
    return {
      corners: best.flipped > best.upright ? turned(corners) : corners,
      identity: best.card.id,
      score: best.score,
      runnerUpScore,
      headingAmbiguous: best.card.pointSymmetric === true || Math.abs(best.upright - best.flipped) < settings.minHeadingMargin,
      rejection: null,
    };
  });

  // A deck has one of each card: keep the strongest claim, reject the rest.
  const strongest = new Map<string, CardReading>();
  for (const reading of readings) {
    if (!reading.identity) continue;
    const current = strongest.get(reading.identity);
    if (!current || reading.score > current.score) strongest.set(reading.identity, reading);
  }
  return readings.map((reading) =>
    reading.identity && strongest.get(reading.identity) !== reading
      ? { ...reading, identity: null, headingAmbiguous: true, rejection: 'duplicate_identity' as const }
      : reading,
  );
}
