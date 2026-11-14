'use client';

// components/voice/VoiceDock.tsx — P1
//
// Bottom-right of /plan. Deliberately almost nothing: the line that is being
// said right now — whoever is saying it — and a wire that moves with the sound.
// No transcript, no history, no chat bubbles. A conversation you can read at a
// glance from across a room, which is what a demo needs.
//
// The text box is not a fallback mock. `sendUserMessage` goes to the same agent
// over the same session, so typing exercises the identical tool path as
// speaking — useful when the room is loud, and the only way to rehearse the
// demo without talking to yourself.
//
// ---- open / closed ----
//
// Closed, it is a single dot in the corner. OPEN IS WHAT TURNS THE FEATURE ON:
// opening starts the session, closing ends it. There is no state where the
// panel is shut and a microphone is still live, which is the only version of
// this a person can trust on a shared screen.
//
// The component stays mounted either way, so `useAdvisorTools` keeps the
// advisor's tools registered with the provider and `endSession` runs through
// the SDK rather than being torn off by an unmount mid-call.

import { useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Mic, MicOff, Send, X } from 'lucide-react';
import { Waveform } from '@/components/voice/Waveform';
import { useAdvisorTools } from '@/components/voice/useAdvisorTools';

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

interface Line {
  text: string;
  who: 'user' | 'agent';
}

export function VoiceDock() {
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState<Line | null>(null);
  const [typed, setTyped] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const conversation = useConversation({
    onMessage: (payload: { message: string; source?: string; role?: string }) => {
      const who = (payload.role ?? payload.source) === 'user' ? 'user' : 'agent';
      if (!payload.message?.trim()) return;
      // A message arriving means the session is working, so any notice we were
      // showing (the text-only fallback, in particular) has served its purpose
      // and must not sit on top of the subtitle for the rest of the demo.
      setFailure(null);
      setLine({ text: payload.message, who });
    },
    onError: (message: string) => setFailure(message),
    onDisconnect: () => setLine(null),
  });

  // Registers relocate_for_footfall / describe_plan / list_placements with the
  // provider. They stay registered while this component is mounted — which is
  // always, open or closed.
  useAdvisorTools();

  const { status, isSpeaking, startSession, endSession, sendUserMessage, setMuted, isMuted } =
    conversation;
  const connected = status === 'connected';

  /**
   * Voice if the microphone is available, text if it is not.
   *
   * The fallback is not a nicety. A denied or missing microphone used to kill
   * the whole dock, which meant one bad permission prompt on the demo machine
   * took the entire feature with it. A text session is the same agent over a
   * WebSocket instead of WebRTC, calling the same tools, so the plan still
   * changes and the only thing lost is the audio.
   */
  async function connect() {
    setFailure(null);
    if (!AGENT_ID) {
      setFailure('NEXT_PUBLIC_ELEVENLABS_AGENT_ID is not set — see .env.example.');
      return;
    }

    let micOk = false;
    try {
      // The SDK does not ask for the microphone; the browser will not hand it
      // over unasked.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release it again straight away — the SDK opens its own capture.
      stream.getTracks().forEach((t) => t.stop());
      micOk = true;
    } catch {
      micOk = false;
    }

    try {
      if (micOk) {
        startSession({ agentId: AGENT_ID, connectionType: 'webrtc', textOnly: false });
      } else {
        startSession({ agentId: AGENT_ID, connectionType: 'websocket', textOnly: true });
        setFailure('No microphone available — text only. Type below and the advisor still works.');
      }
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
    }
  }

  /** Opening is the act that turns the advisor on. */
  function openDock() {
    setOpen(true);
    void connect();
  }

  /**
   * Closing ends the session rather than just hiding the panel. Leaving a
   * microphone live behind a closed panel is the one behaviour this control
   * must never have.
   */
  function closeDock() {
    if (status !== 'disconnected') endSession();
    setFailure(null);
    setLine(null);
    setOpen(false);
  }

  useEffect(() => {
    if (connected) inputRef.current?.focus();
  }, [connected]);

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text || !connected) return;
    setLine({ text, who: 'user' });
    sendUserMessage(text);
    setTyped('');
  }

  if (!open) {
    return (
      <div className="pointer-events-none absolute right-4 bottom-4 z-20">
        <button
          type="button"
          onClick={openDock}
          aria-label="Open the advisor"
          title="Talk to the advisor"
          className="pointer-events-auto flex size-11 items-center justify-center rounded-full border border-[var(--night-hairline)] bg-[var(--ink-raise)] text-[var(--night-accent)] transition-colors hover:border-[var(--night-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--night-accent)]"
        >
          <Mic className="size-4" />
        </button>
      </div>
    );
  }

  const state = connected
    ? isSpeaking
      ? 'Advisor'
      : 'Listening'
    : status === 'connecting'
      ? 'Connecting'
      : 'Advisor';

  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-20 w-[min(26rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto overflow-hidden rounded-[2px] border border-[var(--night-hairline)] bg-[var(--ink)]">
        <div className="flex items-center gap-2 border-b border-[var(--night-hairline)] px-3 py-2">
          <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] text-[var(--night-accent)] uppercase">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-current"
              style={{ opacity: connected ? 1 : 0.4 }}
            />
            {state}
          </span>

          <div className="ml-auto flex items-center gap-1">
            {connected && (
              <button
                type="button"
                aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                onClick={() => setMuted(!isMuted)}
                className="flex size-6 items-center justify-center rounded-[2px] text-[var(--night-dim)] transition-colors hover:text-[var(--bone)]"
              >
                {isMuted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
              </button>
            )}
            <button
              type="button"
              aria-label="Close the advisor"
              onClick={closeDock}
              className="flex size-6 items-center justify-center rounded-[2px] text-[var(--night-dim)] transition-colors hover:text-[var(--bone)]"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="px-3 pt-2">
          <Waveform
            getFrequencyData={conversation.getOutputByteFrequencyData}
            getLevel={conversation.getOutputVolume}
            speaking={isSpeaking}
            active={connected}
          />
        </div>

        {/* The subtitle. One line, current only — never a transcript. */}
        <div className="min-h-[3.25rem] px-3.5 pb-1">
          {failure ? (
            <p className="text-xs leading-relaxed text-[var(--piece-closure)]">{failure}</p>
          ) : line ? (
            <p
              className={
                line.who === 'user'
                  ? 'text-sm leading-relaxed text-[var(--night-dim)]'
                  : 'text-sm leading-relaxed'
              }
            >
              {line.text}
            </p>
          ) : (
            <p className="font-mono text-[10px] leading-relaxed tracking-[0.06em] text-[var(--night-dim)]">
              {connected
                ? 'Say something — try “business 12 isn’t getting any foot traffic, where should it go?”'
                : 'Starting the advisor…'}
            </p>
          )}
        </div>

        <div className="px-3 pb-3">
          {connected ? (
            <form onSubmit={submitTyped} className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="…or type it"
                className="h-8 min-w-0 flex-1 rounded-[2px] border border-[var(--night-hairline)] bg-transparent px-2 font-mono text-[11px] outline-none focus-visible:border-[var(--night-accent)]"
              />
              <button
                type="submit"
                disabled={!typed.trim()}
                aria-label="Send"
                className="flex h-8 items-center rounded-[2px] border border-[var(--night-hairline)] px-2.5 transition-colors hover:border-[var(--night-accent)] hover:text-[var(--night-accent)] disabled:opacity-35"
              >
                <Send className="size-3.5" />
              </button>
            </form>
          ) : (
            // Only reachable if the session dropped or failed. The panel stays
            // open so the reason stays on screen — collapsing here would throw
            // the error away at the moment it is needed.
            <button
              type="button"
              disabled={status === 'connecting'}
              onClick={() => void connect()}
              className="h-8 w-full rounded-[2px] border border-[var(--night-hairline)] font-mono text-[10px] tracking-[0.16em] uppercase transition-colors hover:border-[var(--night-accent)] hover:text-[var(--night-accent)] disabled:opacity-40"
            >
              {status === 'connecting' ? 'Connecting…' : 'Reconnect'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
