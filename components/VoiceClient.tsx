"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import type { Directive } from "@/lib/types";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  response_id?: string;
  item_id?: string;
  content_index?: number;
  error?: { message?: string };
};

type SessionSnapshot = {
  directives?: Directive[];
};

const SERVER_VAD = {
  type: "server_vad",
  threshold: 0.5,
  prefix_padding_ms: 300,
  silence_duration_ms: 900,
  create_response: true,
  interrupt_response: true,
} as const;

function directiveInstructions(directive: Directive): string {
  if (directive.kind === "teachback") {
    return `[DIRECTIVE] Deliver the following teach-back faithfully in Curio's own voice. Natural phrasing is allowed, but add no facts, fill no gaps, and make no corrections. Script: ${directive.utteranceInstruction}`;
  }
  return `[DIRECTIVE] ${directive.utteranceInstruction}`;
}

export default function VoiceClient({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [pushToTalk, setPushToTalk] = useState(true);
  const [muted, setMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [noviceSpeaking, setNoviceSpeaking] = useState(false);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [hasMicrophone, setHasMicrophone] = useState(false);
  const [microphoneUnavailable, setMicrophoneUnavailable] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const connectedAtRef = useRef<number | null>(null);
  const pendingDirectivesRef = useRef<Directive[]>([]);
  const spokenDirectiveIdsRef = useRef(new Set<string>());
  const transcriptEventsRef = useRef(new Set<string>());
  const recordingRef = useRef(false);
  const pushToTalkRef = useRef(true);
  const mutedRef = useRef(false);
  const pttButtonRef = useRef<HTMLButtonElement | null>(null);
  const deliberateDisconnectRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectingRef = useRef(false);
  const connectRef = useRef<(() => Promise<void>) | null>(null);

  const tMs = useCallback(() => Math.max(0, Date.now() - (connectedAtRef.current ?? Date.now())), []);

  const sendRealtimeEvent = useCallback((event: object): boolean => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return false;
    channel.send(JSON.stringify(event));
    return true;
  }, []);

  const postTranscript = useCallback(async (speaker: "user" | "novice", value: string) => {
    const clean = value.trim();
    if (!clean) return;
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speaker, text: clean, tMs: tMs() }),
    });
    if (!response.ok) throw new Error("The transcript could not be saved.");
  }, [sessionId, tMs]);

  const sendDirective = useCallback((directive: Directive) => {
    if (spokenDirectiveIdsRef.current.has(directive.id)) return;
    const sent = sendRealtimeEvent({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions: directiveInstructions(directive),
      },
    });
    if (sent) {
      spokenDirectiveIdsRef.current.add(directive.id);
    } else if (!pendingDirectivesRef.current.some((pending) => pending.id === directive.id)) {
      pendingDirectivesRef.current.push(directive);
    }
  }, [sendRealtimeEvent]);

  const closeResources = useCallback(() => {
    recordingRef.current = false;
    setRecording(false);
    setNoviceSpeaking(false);
    pendingDirectivesRef.current = [];
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    micTrackRef.current = null;
    setHasMicrophone(false);
    if (audioRef.current) audioRef.current.srcObject = null;
  }, []);

  const handleRealtimeMessage = useCallback((message: MessageEvent<string>) => {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(message.data) as RealtimeEvent;
    } catch {
      return;
    }

    const isUserTranscript = event.type === "conversation.item.input_audio_transcription.completed";
    const isNoviceTranscript =
      event.type === "response.output_audio_transcript.done" ||
      event.type === "response.audio_transcript.done";

    if ((isUserTranscript || isNoviceTranscript) && event.transcript?.trim()) {
      const key = `${isUserTranscript ? "user" : "novice"}:${event.response_id ?? event.item_id ?? ""}:${event.content_index ?? 0}:${event.transcript}`;
      if (!transcriptEventsRef.current.has(key)) {
        transcriptEventsRef.current.add(key);
        const speaker = isUserTranscript ? "user" : "novice";
        const transcript = event.transcript;
        void (async () => {
          try {
            await postTranscript(speaker, transcript);
          } catch {
            transcriptEventsRef.current.delete(key);
            await new Promise((resolve) => window.setTimeout(resolve, 1_500));
            if (transcriptEventsRef.current.has(key)) return;
            transcriptEventsRef.current.add(key);
            try {
              await postTranscript(speaker, transcript);
            } catch (error) {
              transcriptEventsRef.current.delete(key);
              setNotice(error instanceof Error ? `${error.message} You can keep teaching; this segment may be missing.` : "A transcript segment could not be saved. You can keep teaching.");
            }
          }
        })();
      }
    }

    if (
      event.type === "output_audio_buffer.started" ||
      event.type === "response.output_audio.delta"
    ) {
      setNoviceSpeaking(true);
    }
    if (
      event.type === "output_audio_buffer.stopped" ||
      event.type === "response.output_audio_transcript.done" ||
      event.type === "response.done"
    ) {
      setNoviceSpeaking(false);
    }
    if (event.type === "error") {
      setNotice(event.error?.message ?? "The voice session reported an error.");
    }
  }, [postTranscript]);

  const scheduleReconnect = useCallback(() => {
    if (deliberateDisconnectRef.current || reconnectTimerRef.current !== null) return;
    if (reconnectAttemptsRef.current >= 3) {
      setStatus("error");
      setReconnectAttempt(0);
      setNotice("Voice reconnection failed after 3 attempts. Use Connect Curio to try again.");
      return;
    }
    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;
    setReconnectAttempt(attempt);
    setStatus("connecting");
    setNotice(`Voice connection lost. Reconnecting in 2 seconds (${attempt}/3)…`);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectRef.current?.();
    }, 2_000);
  }, []);

  const connect = useCallback(async () => {
    if (connectingRef.current || deliberateDisconnectRef.current) return;
    connectingRef.current = true;
    setStatus("connecting");
    closeResources();

    try {
      const tokenResponse = await fetch("/api/realtime/token", { method: "POST" });
      const tokenPayload = await tokenResponse.json() as { value?: string; error?: string };
      if (!tokenResponse.ok || !tokenPayload.value) {
        throw new Error(tokenPayload.error ?? "Curio could not start a voice session.");
      }

      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      peer.onconnectionstatechange = () => {
        if (peerRef.current !== peer) return;
        if (peer.connectionState === "connected") {
          reconnectAttemptsRef.current = 0;
          setReconnectAttempt(0);
          setStatus("connected");
        }
        if (["failed", "disconnected"].includes(peer.connectionState)) {
          setNoviceSpeaking(false);
          scheduleReconnect();
        }
      };
      peer.ontrack = ({ streams }) => {
        if (!audioRef.current) return;
        audioRef.current.srcObject = streams[0];
        void audioRef.current.play().catch(() => undefined);
      };

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("getUserMedia is not available in this context");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        streamRef.current = stream;
        const track = stream.getAudioTracks()[0];
        micTrackRef.current = track;
        track.enabled = !pushToTalkRef.current && !mutedRef.current;
        peer.addTrack(track, stream);
        setHasMicrophone(true);
        setMicrophoneUnavailable(false);
      } catch {
        peer.addTransceiver("audio", { direction: "recvonly" });
        setHasMicrophone(false);
        setMicrophoneUnavailable(true);
        setNotice("Microphone unavailable. You can still teach Curio by typing.");
      }

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.addEventListener("message", handleRealtimeMessage);
      channel.addEventListener("open", () => {
        if (peerRef.current !== peer || deliberateDisconnectRef.current) return;
        if (connectedAtRef.current === null) connectedAtRef.current = Date.now();
        reconnectAttemptsRef.current = 0;
        setReconnectAttempt(0);
        setStatus("connected");
        sendRealtimeEvent({
          type: "session.update",
          session: {
            type: "realtime",
            audio: { input: { turn_detection: pushToTalkRef.current ? null : SERVER_VAD } },
          },
        });
        const queued = pendingDirectivesRef.current.splice(0)
          .filter((directive) => !spokenDirectiveIdsRef.current.has(directive.id));
        const latest = queued.at(-1);
        const dropped = latest ? queued.slice(0, -1) : queued;
        if (dropped.length > 0) {
          console.warn("Dropping stale queued directives on voice reconnect", dropped.map((directive) => directive.id));
        }
        if (latest) sendDirective(latest);
      });
      channel.addEventListener("close", () => setNoviceSpeaking(false));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenPayload.value}`,
          "Content-Type": "application/sdp",
        },
        body: peer.localDescription?.sdp ?? offer.sdp,
      });
      if (!sdpResponse.ok) {
        throw new Error("Curio could not establish the voice connection.");
      }
      await peer.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    } catch (error) {
      closeResources();
      if (!deliberateDisconnectRef.current) {
        setNotice(error instanceof Error ? error.message : "Curio could not connect.");
        scheduleReconnect();
      }
    } finally {
      connectingRef.current = false;
    }
  }, [closeResources, handleRealtimeMessage, scheduleReconnect, sendDirective, sendRealtimeEvent]);

  connectRef.current = connect;

  useEffect(() => {
    setMicrophoneUnavailable(!navigator.mediaDevices?.getUserMedia);
  }, []);

  const startConnection = useCallback(() => {
    deliberateDisconnectRef.current = false;
    reconnectAttemptsRef.current = 0;
    setReconnectAttempt(0);
    setNotice(null);
    void connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    deliberateDisconnectRef.current = true;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    reconnectAttemptsRef.current = 0;
    setReconnectAttempt(0);
    closeResources();
    setStatus("disconnected");
    setNotice(null);
  }, [closeResources]);

  const beginRecording = useCallback(() => {
    if (!pushToTalkRef.current || mutedRef.current || !micTrackRef.current || recordingRef.current) return;
    if (!sendRealtimeEvent({ type: "input_audio_buffer.clear" })) return;
    recordingRef.current = true;
    micTrackRef.current.enabled = true;
    setRecording(true);
  }, [sendRealtimeEvent]);

  const endRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    if (micTrackRef.current) micTrackRef.current.enabled = false;
    setRecording(false);
    sendRealtimeEvent({ type: "input_audio_buffer.commit" });
    sendRealtimeEvent({ type: "response.create", response: { output_modalities: ["audio"] } });
  }, [sendRealtimeEvent]);

  const togglePushToTalk = useCallback(() => {
    const next = !pushToTalkRef.current;
    if (!next && recordingRef.current) endRecording();
    pushToTalkRef.current = next;
    setPushToTalk(next);
    if (micTrackRef.current) micTrackRef.current.enabled = !next && !mutedRef.current;
    sendRealtimeEvent({
      type: "session.update",
      session: {
        type: "realtime",
        audio: { input: { turn_detection: next ? null : SERVER_VAD } },
      },
    });
  }, [endRecording, sendRealtimeEvent]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next && recordingRef.current) endRecording();
    if (micTrackRef.current) micTrackRef.current.enabled = !next && !pushToTalkRef.current;
  }, [endRecording]);

  const submitText = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || channelRef.current?.readyState !== "open") return;
    setText("");
    setNotice(null);
    try {
      await postTranscript("user", clean);
      sendRealtimeEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: clean }],
        },
      });
      sendRealtimeEvent({ type: "response.create", response: { output_modalities: ["audio"] } });
    } catch (error) {
      setText(clean);
      setNotice(error instanceof Error ? error.message : "The message could not be sent.");
    }
  }, [postTranscript, sendRealtimeEvent, text]);

  useEffect(() => {
    const events = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
    events.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as { type?: string; data?: Directive | SessionSnapshot };
        if (event.type === "directive" && event.data && "id" in event.data) sendDirective(event.data);
        if (event.type === "snapshot" && event.data && "directives" in event.data) {
          for (const directive of event.data.directives ?? []) sendDirective(directive);
        }
      } catch {
        // Ignore malformed or unrelated session events.
      }
    };
    events.onerror = () => {
      // EventSource reconnects automatically; voice and text controls remain usable.
    };
    return () => events.close();
  }, [sendDirective, sessionId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches("input, textarea, select, [contenteditable='true']");
      const isOtherButton = target instanceof HTMLButtonElement && target !== pttButtonRef.current;
      if (isTyping || isOtherButton) return;
      event.preventDefault();
      beginRecording();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      endRecording();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [beginRecording, endRecording]);

  useEffect(() => () => {
    deliberateDisconnectRef.current = true;
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    closeResources();
  }, [closeResources]);

  const connected = status === "connected";
  const statusLabel = {
    disconnected: "Not connected",
    connecting: reconnectAttempt > 0 ? `Reconnecting ${reconnectAttempt}/3` : "Connecting",
    connected: "Connected",
    error: "Connection error",
  }[status];

  return (
    <section
      aria-label="Curio voice controls"
      className="border-2 border-[var(--border-strong)] bg-[var(--bg-panel)] p-4 text-[var(--text-primary)] sm:p-5"
    >
      <audio
        ref={audioRef}
        autoPlay
        className="hidden"
        onPlaying={() => setNoviceSpeaking(true)}
        onPause={() => setNoviceSpeaking(false)}
        onEnded={() => setNoviceSpeaking(false)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div className="flex items-center gap-3">
          <span
            role="status"
            className="inline-flex h-7 items-center gap-2 rounded-[2px] border border-[var(--border-strong)] px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em]"
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 ${connected ? "bg-[var(--claim-verified)]" : status === "error" ? "bg-[var(--claim-contradicted)]" : "bg-[var(--text-muted)]"}`}
            />
            {statusLabel}
          </span>
          <span className="font-mono text-xs text-[var(--text-muted)]">
            Mic: {muted ? "muted" : recording ? "recording" : hasMicrophone ? "ready" : microphoneUnavailable ? "unavailable" : "not connected"}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.06em] text-[var(--accent)]">
          <span>Curio</span>
          <span className="sr-only">{noviceSpeaking ? "is speaking" : "is listening"}</span>
          <span aria-hidden="true" className="flex h-4 items-end gap-0.5">
            {[8, 14, 10].map((height, index) => (
              <span
                key={height}
                className="w-0.5 origin-bottom bg-[var(--accent)] transition-transform duration-[900ms] motion-reduce:transition-none"
                style={{ height, transform: `scaleY(${noviceSpeaking ? 1 : 0.3})`, transitionDelay: `${index * 90}ms` }}
              />
            ))}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {connected ? (
          <button
            type="button"
            onClick={disconnect}
            className="h-10 rounded-[4px] border-2 border-[var(--border-strong)] bg-[var(--bg-sunken)] px-4 text-sm font-semibold transition-colors duration-150 hover:bg-[var(--bg-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={startConnection}
            disabled={status === "connecting"}
            className="h-10 rounded-[4px] border-2 border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--ink-on-accent)] transition-colors duration-150 hover:bg-[var(--accent-hover)] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            {status === "connecting" ? "Connecting…" : "Connect Curio"}
          </button>
        )}

        <button
          type="button"
          onClick={togglePushToTalk}
          aria-pressed={pushToTalk}
          disabled={!connected}
          className="h-10 rounded-[4px] border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 text-sm font-semibold transition-colors duration-150 hover:bg-[var(--bg-raised)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        >
          Push to talk: {pushToTalk ? "on" : "off"}
        </button>

        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          disabled={!connected || !hasMicrophone}
          className="h-10 rounded-[4px] border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 text-sm font-semibold transition-colors duration-150 hover:bg-[var(--bg-raised)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        >
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>

      {pushToTalk && (
        <button
          ref={pttButtonRef}
          type="button"
          disabled={!connected || !hasMicrophone || muted}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            beginRecording();
          }}
          onPointerUp={endRecording}
          onPointerCancel={endRecording}
          onKeyDown={(event) => {
            if (event.code === "Space" && !event.repeat) beginRecording();
          }}
          onKeyUp={(event) => {
            if (event.code === "Space") endRecording();
          }}
          className={`mt-3 min-h-14 w-full select-none rounded-[4px] border-[3px] px-5 text-base font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:border-[var(--border)] disabled:bg-[var(--bg-sunken)] disabled:text-[var(--text-disabled)] ${recording ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--ink-on-accent)]" : "border-[var(--border-strong)] bg-[var(--bg-raised)]"}`}
        >
          {recording ? "Release to send" : "Hold to talk · or hold space"}
        </button>
      )}

      <form onSubmit={submitText} className="mt-4 flex gap-2 border-t border-[var(--border)] pt-4">
        <label htmlFor={`curio-text-${sessionId}`} className="sr-only">Teach Curio by text</label>
        <input
          id={`curio-text-${sessionId}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={!connected}
          placeholder="Or teach Curio by text…"
          className="min-w-0 flex-1 rounded-[4px] border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 py-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        />
        <button
          type="submit"
          disabled={!connected || !text.trim()}
          className="rounded-[4px] border-2 border-[var(--border-strong)] bg-[var(--bg-raised)] px-4 text-sm font-semibold transition-colors duration-150 hover:border-[var(--accent)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        >
          Send
        </button>
      </form>

      {notice && (
        <p role="alert" className="mb-0 mt-3 border-l-[3px] border-[var(--claim-uncertain)] pl-3 text-sm text-[var(--text-secondary)]">
          {notice}
        </p>
      )}
    </section>
  );
}
