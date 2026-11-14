'use client';

// components/plan/ScenarioPicker.tsx — P1
//
// The dropdown that answers "does this only work for one stadium?". It is a
// one-line answer at 1:55 in the demo script, so it gets to be a real control
// and not an afterthought.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SCENARIOS } from '@/lib/scenarios';
import { usePlanStore } from '@/lib/store';

export function ScenarioPicker() {
  const scenarioId = usePlanStore((s) => s.scenarioId);
  const loadScenarioById = usePlanStore((s) => s.loadScenarioById);
  const loading = usePlanStore((s) => s.loading);

  return (
    <Select
      items={SCENARIOS.map((s) => ({ value: s.id, label: s.name }))}
      value={scenarioId}
      onValueChange={(value) => {
        if (typeof value === 'string' && value !== scenarioId) void loadScenarioById(value);
      }}
      disabled={loading || SCENARIOS.length < 1}
    >
      <SelectTrigger className="w-[230px]" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SCENARIOS.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
