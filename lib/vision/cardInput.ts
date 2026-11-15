import { MARKER_MAP, type PixelMarker, type Vec2 } from './contracts';
import { enrollCard, recognizeCards, MATCH_DEFAULTS } from './cards/recognize';
import type { CardCorners, CardReading, CvApi, EnrolledCard, Frame } from './cards/types';

export interface CardEnrollment {
  markerId: number;
  label: string;
  flipped: boolean;
}

function turned(corners: CardCorners): CardCorners {
  return [corners[2], corners[3], corners[0], corners[1]];
}

function heading(corners: readonly Vec2[]): number {
  return Math.atan2(corners[1].y - corners[0].y, corners[1].x - corners[0].x);
}

/** Session-only reference appearances. Does not write to the planning store. */
export class CardInput {
  private references = new Map<number, EnrolledCard>();
  private labels = new Map<number, string>();
  private flipped = new Set<number>();
  private headings = new Map<number, number>();

  constructor(private cv: CvApi) {}

  enroll(frame: Frame, markerId: number, label: string): void {
    if (!Number.isInteger(markerId) || !Object.hasOwn(MARKER_MAP, markerId)) {
      throw new Error('Choose a known planning role before enrolling a card.');
    }
    // Enrollment errors leave the previous reference intact.
    const reference = enrollCard(this.cv, frame, String(markerId));
    this.references.set(markerId, reference);
    this.labels.set(markerId, label.trim() || `Card ${markerId}`);
    this.headings.delete(markerId);
    this.flipped.delete(markerId);
  }

  list(): CardEnrollment[] {
    return [...this.references.keys()].sort((a, b) => a - b).map(markerId => ({
      markerId, label: this.labels.get(markerId)!, flipped: this.flipped.has(markerId),
    }));
  }

  remove(markerId: number): void {
    this.references.delete(markerId);
    this.labels.delete(markerId);
    this.headings.delete(markerId);
    this.flipped.delete(markerId);
  }

  clear(): void {
    for (const markerId of this.references.keys()) this.remove(markerId);
  }

  resetTracking(): void { this.headings.clear(); }

  flip(markerId: number): void {
    if (!this.references.has(markerId)) throw new Error('Enroll this role before correcting its heading.');
    if (this.flipped.has(markerId)) this.flipped.delete(markerId);
    else this.flipped.add(markerId);
  }

  detect(frame: Frame): { markers: PixelMarker[]; cards: CardReading[] } {
    const cards = recognizeCards(this.cv, frame, [...this.references.values()]);
    return { cards, markers: this.adapt(cards) };
  }

  /** Reject uncertain identities; a match score remains a heuristic, never a probability. */
  adapt(cards: readonly CardReading[]): PixelMarker[] {
    const markers: PixelMarker[] = [];
    for (const card of cards) {
      if (card.identity === null || card.rejection !== null || !Number.isFinite(card.score) || card.score < MATCH_DEFAULTS.minScore) continue;
      const markerId = Number(card.identity);
      if (!this.references.has(markerId) || card.corners.length !== 4 ||
          !card.corners.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) continue;
      let corners = card.corners;
      const previous = this.headings.get(markerId);
      if (card.headingAmbiguous && previous !== undefined) {
        const delta = heading(corners) - previous;
        if (Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) > Math.PI / 2) corners = turned(corners);
      }
      this.headings.set(markerId, heading(corners));
      if (this.flipped.has(markerId)) corners = turned(corners);
      markers.push({ id: markerId, corners: corners.map(point => ({ ...point })),
        confidence: Math.max(0, Math.min(1, card.score)) });
    }
    return markers;
  }
}
