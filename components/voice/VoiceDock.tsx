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

import { useEffect, useRef, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Mic, MicOff, Send, X } from 'lucide-react';
import { Waveform } from '@/components/voice/Waveform';
import { useAdvisorTools } from '@/components/voice/useAdvisorTools';
import { Button } from '@/components/ui/button';

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

interface Line {
  text: string;
  who: 'user' | 'agent';
}

export function VoiceDock() {
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
  // provider. They stay registered while this component is mounted.
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

  return (
    <div className="pointer-events-none absolute right-4 bottom-[86px] z-20 w-[min(26rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto overflow-hidden rounded-2xl border bg-card/95 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 px-3 pt-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {connected ? (isSpeaking ? 'Advisor' : 'Listening') : status === 'connecting' ? 'Connecting' : 'Advisor'}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {connected && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  onClick={() => setMuted(!isMuted)}
                >
                  {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  aria-label="End conversation"
                  onClick={() => endSession()}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="px-3">
          <Waveform
            getFrequencyData={conversation.getOutputByteFrequencyData}
            getLevel={conversation.getOutputVolume}
            speaking={isSpeaking}
            active={connected}
          />
        </div>

        {/* The subtitle. One line, current only — never a transcript. */}
        <div className="min-h-[3.25rem] px-4 pb-1">
          {failure ? (
            <p className="text-xs leading-relaxed text-destructive">{failure}</p>
          ) : line ? (
            <p
              className={
                line.who === 'user'
                  ? 'text-sm leading-relaxed text-muted-foreground'
                  : 'text-sm leading-relaxed'
              }
            >
              {line.text}
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {connected
                ? 'Say something — try “business 12 isn’t getting any foot traffic, where should it go?”'
                : 'Ask the advisor to move a shop into the crowd, and it will re-run the plan.'}
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
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <Button size="sm" type="submit" className="h-8 px-2" disabled={!typed.trim()} aria-label="Send">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          ) : (
            <Button
              size="sm"
              className="h-8 w-full text-xs"
              disabled={status === 'connecting'}
              onClick={connect}
            >
              <Mic className="mr-1.5 h-3.5 w-3.5" />
              {status === 'connecting' ? 'Connecting…' : 'Talk to the advisor'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
