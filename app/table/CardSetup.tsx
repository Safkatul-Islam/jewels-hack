'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MARKER_MAP, PIECE_LABELS } from '@/lib/vision/contracts';
import type { CardEnrollment } from '@/lib/vision/cardInput';
import type { CardReading } from '@/lib/vision/cards/types';

interface Props {
  enrollments: CardEnrollment[];
  readings: CardReading[];
  canEnroll: boolean;
  isDemo: boolean;
  onEnroll: (role: number, label: string) => void;
  onChange: (action: 'remove' | 'flip' | 'clear', role?: number) => void;
}

export function CardSetup({ enrollments, readings, canEnroll, isDemo, onEnroll, onChange }: Props) {
  const [role, setRole] = useState(0);
  const [label, setLabel] = useState('');
  return <section className="space-y-3 border-t bg-muted/30 p-4 text-xs" aria-label="Playing card enrollment">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-medium">{isDemo ? 'Sample card references' : 'Enroll your playing cards'}</h2>
      <span className="text-[10px] text-muted-foreground">{isDemo ? 'Separate demo session' : 'This tab only · cleared on reload'}</span>
    </div>
    <p className="leading-relaxed text-muted-foreground">Show one face-up card on a dark surface, choose its role, and enroll it. Repeat for venue (0), arrival (1), and shuttle (10), then place all three in view. Keep other cards off the table.</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="space-y-1"><span className="block">Planning role</span>
        <select aria-label="Card planning role" className="max-w-full rounded-md border bg-background px-2 py-2" value={role} onChange={event => setRole(Number(event.target.value))}>
          {Object.entries(MARKER_MAP).map(([id, kind]) => <option key={id} value={id}>{id} / {PIECE_LABELS[kind]}</option>)}
        </select>
      </label>
      <label className="space-y-1"><span className="block">Card label (optional)</span>
        <input aria-label="Card label" className="w-36 rounded-md border bg-background px-2 py-2" placeholder="e.g. Ace of spades" maxLength={60} value={label} onChange={event => setLabel(event.target.value)} />
      </label>
      <Button size="sm" variant="outline" disabled={!canEnroll} onClick={() => onEnroll(role, label || PIECE_LABELS[MARKER_MAP[role]])}>Enroll visible card</Button>
      <Button size="sm" variant="ghost" disabled={!enrollments.length} onClick={() => onChange('clear')}>Clear references</Button>
    </div>
    {enrollments.length > 0 && <ul className="divide-y rounded-md border bg-background px-3" aria-label="Enrolled cards">
      {enrollments.map(entry => <li key={entry.markerId} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span>{entry.markerId} / {entry.label}{entry.flipped ? ' · flipped 180°' : ''}</span>
        <div className="flex gap-2">
          <button className="underline underline-offset-4" aria-label={`Flip role ${entry.markerId} by 180 degrees`} onClick={() => onChange('flip', entry.markerId)}>Flip 180°</button>
          <button className="text-muted-foreground underline underline-offset-4" aria-label={`Remove role ${entry.markerId}`} onClick={() => onChange('remove', entry.markerId)}>Remove</button>
        </div>
      </li>)}
    </ul>}
    {readings.length > 0 && <div className="space-y-1 text-[11px]" aria-label="Card match results">
      {readings.map((reading, index) => <p key={index}>
        {reading.identity === null ? `Unassigned card: ${reading.rejection?.replaceAll('_', ' ')}` : `Role ${reading.identity} matched`}
        {' · score '}{reading.score.toFixed(2)}
        {reading.identity !== null && reading.headingAmbiguous ? ' · heading uncertain by 180°; use Flip if needed' : ''}
      </p>)}
    </div>}
    <p className="text-[10px] leading-relaxed text-muted-foreground">Match scores are heuristics. Uncertain identities stay unassigned. Similar-looking cards can confuse recognition; choose distinct faces and verify your real deck before the demo.</p>
  </section>;
}
