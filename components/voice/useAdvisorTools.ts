'use client';

// components/voice/useAdvisorTools.ts — P1
//
// The agent's hands. Each hook call registers one client tool that ElevenLabs
// can invoke mid-sentence; the handler runs here in the browser, changes the
// plan, re-runs the simulation and hands back a sentence of MEASURED numbers
// for the agent to say.
//
// The agent is never asked where something should go. It is asked what the user
// meant; lib/advisor.ts finds the position by sweeping the simulation. So every
// figure the agent speaks came out of the engine, and a judge can ask "where did
// that number come from" and get a real answer.
//
// Each tool's name and parameter schema must match the tool configured on the
// agent in the ElevenLabs dashboard, and the tool must be marked as blocking
// there, or the agent will carry on talking without waiting for the result.

import { useCallback } from 'react';
import { useConversationClientTool } from '@elevenlabs/react';
import {
  describeNoBetterSpot,
  describeRelocation,
  findBetterSpot,
  resolveTarget,
} from '@/lib/advisor';
import { buildNetwork } from '@/lib/sim/network';
import { simulate } from '@/lib/sim/simulate';
import { usePlanStore } from '@/lib/store';

/** Names and shapes the dashboard agent must be configured with. */
export interface AdvisorTools extends Record<string, (p: never) => string> {
  relocate_for_footfall: (p: { target: string }) => string;
  describe_plan: (p: Record<string, never>) => string;
  list_placements: (p: Record<string, never>) => string;
}

export function useAdvisorTools() {
  /**
   * "That shop isn't getting any traffic — where should it go?"
   *
   * Resolves the phrase to something on the map, sweeps for a better spot,
   * applies it, re-simulates, and reports the before/after.
   */
  const relocate = useCallback((params: { target?: string }): string => {
    const store = usePlanStore.getState();
    const world = store.world;
    const result = store.result;

    if (!world) return 'No scenario is loaded yet, so there is nothing to move.';
    if (!result) return 'The plan has not been simulated yet, so I have no crowd flow to compare against.';

    const query = (params?.target ?? '').trim();
    if (!query) return 'Tell me which shop or piece you mean and I will find it a better spot.';

    const target = resolveTarget(world, query);
    if (!target) {
      return `I could not find anything called "${query}" on this plan, and I will not guess and move the wrong one. Try its full name.`;
    }

    const relocation = findBetterSpot(world, result, target);
    if (!relocation) return describeNoBetterSpot(target);

    // Apply it, then re-run for real so the dashboard and the sentence agree.
    if (target.kind === 'business') store.moveBusiness(target.id, relocation.to);
    else store.movePiece(target.id, relocation.to);

    const next = usePlanStore.getState().world;
    if (next) {
      const net = buildNetwork(next);
      store.setNetwork(net);
      store.setResult(simulate(next, net));
    }

    return describeRelocation(relocation, world);
  }, []);

  /** "How is the plan doing?" — read the real metrics, say nothing invented. */
  const describePlan = useCallback((): string => {
    const { world, result } = usePlanStore.getState();
    if (!world) return 'No scenario is loaded.';
    if (!result) return 'Nothing has been simulated yet.';
    const m = result.metrics;
    return (
      `${world.scenario.name}. Half the crowd is clear in ${m.egressMedianMin.toFixed(0)} minutes and ` +
      `ninety percent in ${m.egressP90Min.toFixed(0)}. Peak crowding is ` +
      `${m.crowdPeakPerM2.toFixed(1)} people per square metre. Local businesses take ` +
      `$${Math.round(m.localRevenueUsd).toLocaleString('en-US')} on the day. ` +
      `The plan scores ${result.score.total.toFixed(0)} out of 100.` +
      (result.warnings.length ? ` There are ${result.warnings.length} warnings: ${result.warnings.join('; ')}.` : '')
    );
  }, []);

  /** "What have I got out there?" — so the agent can name things the user can then refer to. */
  const listPlacements = useCallback((): string => {
    const { world } = usePlanStore.getState();
    if (!world) return 'No scenario is loaded.';
    const pieces = world.pieces.map((p) => p.kind.replace(/_/g, ' ')).join(', ') || 'nothing';
    return `There are ${world.pieces.length} pieces placed: ${pieces}. The scenario also has ${world.businesses.length} existing businesses.`;
  }, []);

  useConversationClientTool('relocate_for_footfall', relocate as never);
  useConversationClientTool('describe_plan', describePlan as never);
  useConversationClientTool('list_placements', listPlacements as never);
}
