"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  InterviewSession,
  InterviewSetup,
  InterviewRealtimeToken,
  InterviewTurn,
} from "@kb/shared";
import { api } from "@/lib/api";
import { useUnsavedChanges } from "@/components/WorkspaceNavigation";
import {
  createRealtimeVoice,
  startDictation,
  stopInterviewSpeech,
  speakInterviewText,
  type InterviewVoice,
} from "@/lib/interview-voice";

const LAST_SESSION = "kb:last-interview";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed. Please retry.";

export function useInterview() {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [answer, setAnswer] = useState("");
  const [stopped, setStopped] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(null);
  const current = useRef<InterviewSession | null>(null);
  const voice = useRef<InterviewVoice | null>(null);
  const dictation = useRef<ReturnType<typeof startDictation> | null>(null);
  const connection = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const connectingRef = useRef(false);
  const pendingAnswer = useRef<{ id: string; text: string } | null>(null);
  const transcript = useRef<InterviewTurn[]>([]);
  const pendingSync = useRef<Promise<unknown>>(Promise.resolve());
  const lastSavedTranscript = useRef("");
  const ended = useRef(false);
  useUnsavedChanges(session?.status === "active" && !stopped);

  const update = useCallback((value: InterviewSession | null) => {
    current.current = value;
    if (mounted.current) setSession(value);
  }, []);
  const cleanupAudio = useCallback(() => {
    connection.current?.abort();
    connection.current = null;
    voice.current?.close();
    voice.current = null;
    dictation.current?.abort();
    dictation.current = null;
    stopInterviewSpeech();
    if (mounted.current) {
      setConnected(false);
      setListening(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    try {
      setSavedId(localStorage.getItem(LAST_SESSION));
    } catch {
      /* Storage may be disabled. */
    }
    return () => {
      mounted.current = false;
      cleanupAudio();
    };
  }, [cleanupAudio]);

  function remember(id: string) {
    try {
      localStorage.setItem(LAST_SESSION, id);
    } catch {
      /* Session is still available until navigation. */
    }
    setSavedId(id);
  }

  const syncTranscript = useCallback(async () => {
    const active = current.current;
    if (
      !active ||
      active.status === "finished" ||
      active.setup.provider !== "openai" ||
      !transcript.current.length
    )
      return;
    const turns = [...transcript.current];
    const snapshot = JSON.stringify(turns);
    if (snapshot === lastSavedTranscript.current) return;
    try {
      await api<InterviewSession>(`/interviews/${active.id}/transcript`, {
        method: "POST",
        body: JSON.stringify({ turns }),
      });
      lastSavedTranscript.current = snapshot;
    } catch (error) {
      if (mounted.current)
        setError(
          `Transcript has not saved: ${message(error)}. Finish will retry saving.`,
        );
      throw error;
    }
  }, []);

  async function connect(active: InterviewSession, textOnly = false) {
    if (connectingRef.current) return;
    cleanupAudio();
    if (!mounted.current || ended.current) return;
    connectingRef.current = true;
    setConnecting(true);
    setError("");
    setVoiceStatus("Connecting…");
    const controller = new AbortController();
    connection.current = controller;
    try {
      await pendingSync.current.catch(() => {});
      await syncTranscript();
      const token = await api<InterviewRealtimeToken>(
        `/interviews/${active.id}/realtime`,
        { method: "POST", signal: controller.signal },
      );
      if (controller.signal.aborted || !mounted.current) return;
      const transport = await createRealtimeVoice({
        token: token.value,
        lang: active.setup.lang,
        textOnly,
        signal: controller.signal,
        history: [...transcript.current],
        onTurn: (turn) => {
          if (!mounted.current || ended.current) return;
          const index = transcript.current.findIndex(
            (item) => item.id === turn.id,
          );
          if (index >= 0) transcript.current[index] = turn;
          else transcript.current.push(turn);
          if (current.current)
            update({ ...current.current, turns: [...transcript.current] });
          pendingSync.current = pendingSync.current
            .catch(() => {})
            .then(syncTranscript);
          void pendingSync.current.catch(() => {});
        },
        onError: (value) => {
          if (mounted.current) setError(value);
        },
        onStatus: (value) => {
          if (mounted.current) {
            setVoiceStatus(value);
            if (value === "Disconnected") setConnected(false);
          }
        },
      });
      if (controller.signal.aborted || !mounted.current || ended.current) {
        transport.close();
        return;
      }
      voice.current = transport;
      setConnected(true);
      setMuted(textOnly);
      setVoiceStatus(
        textOnly ? "Connected · typed answers" : "Connected · microphone on",
      );
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) {
        setError(`${message(error)} You can retry with typed answers.`);
        setVoiceStatus("Disconnected");
      }
    } finally {
      connectingRef.current = false;
      if (mounted.current) setConnecting(false);
    }
  }

  async function start(setup: InterviewSetup, textOnly: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    ended.current = false;
    setStopped(false);
    pendingAnswer.current = null;
    transcript.current = [];
    lastSavedTranscript.current = "";
    try {
      const value = await api<InterviewSession>("/interviews", {
        method: "POST",
        body: JSON.stringify(setup),
      });
      if (!mounted.current) return;
      update(value);
      remember(value.id);
      transcript.current = [...value.turns];
      if (setup.provider === "openai") await connect(value, textOnly);
      else {
        setVoiceStatus("Ready · submit each answer when you finish");
        const last = value.turns.at(-1);
        if (!textOnly && last?.role === "assistant")
          speakInterviewText(last.text, setup.lang, setError, setup.voice);
      }
    } catch (error) {
      if (mounted.current) setError(message(error));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function sendAnswer() {
    const active = current.current;
    const text = answer.trim();
    if (!active || !text || inFlight.current || ended.current) return;
    dictation.current?.abort();
    dictation.current = null;
    setListening(false);
    stopInterviewSpeech();
    if (active.setup.provider === "openai") {
      try {
        if (!voice.current || !connected)
          throw new Error("Connect before sending an answer.");
        const id = `typed_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
        voice.current.sendText(text, id);
        setAnswer("");
      } catch (error) {
        setError(message(error));
      }
      return;
    }
    if (!pendingAnswer.current || pendingAnswer.current.text !== text)
      pendingAnswer.current = { id: crypto.randomUUID(), text };
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await api<InterviewSession>(
        `/interviews/${active.id}/turn`,
        {
          method: "POST",
          body: JSON.stringify({
            ...pendingAnswer.current,
            afterTurnId: active.turns.at(-1)?.id,
          }),
        },
      );
      if (!mounted.current) return;
      update(value);
      setAnswer("");
      pendingAnswer.current = null;
      if (!muted) {
        const last = value.turns.at(-1);
        if (last?.role === "assistant")
          speakInterviewText(last.text, value.setup.lang, setError, value.setup.voice);
      }
    } catch (error) {
      if (mounted.current) setError(message(error));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const finish = useCallback(async () => {
    const active = current.current;
    if (!active || inFlight.current) return;
    setStopped(true);
    setBusy(true);
    setError("");
    inFlight.current = true;
    let drained = true;
    try {
      // Stop recording/playback immediately, but keep the data channel open briefly
      // so committed final speech reaches the transcript before evaluation.
      if (voice.current?.finish)
        drained = (await voice.current.finish()).drained;
      ended.current = true;
      cleanupAudio();
      setVoiceStatus("Audio stopped");
      await pendingSync.current.catch(() => {});
      await syncTranscript();
      const value = await api<InterviewSession>(
        `/interviews/${active.id}/finish`,
        { method: "POST" },
      );
      if (mounted.current) {
        update(value);
        if (!drained)
          setError(
            "Audio stopped before the last transcription completed. Feedback covers the saved transcript; the final spoken words may be missing.",
          );
      }
    } catch (error) {
      if (mounted.current)
        setError(
          `${message(error)} Your audio is stopped. Retry finishing to save and generate feedback.`,
        );
    } finally {
      ended.current = true;
      cleanupAudio();
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [cleanupAudio, syncTranscript, update]);

  useEffect(() => {
    if (!session || session.status !== "active" || stopped) return;
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000),
      );
      setRemaining(seconds);
      if (seconds === 0) {
        if (!inFlight.current) void finish();
        else {
          voice.current?.setMuted(true);
          dictation.current?.abort();
          stopInterviewSpeech();
        }
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session, stopped, finish, cleanupAudio]);

  function toggleMute() {
    const value = !muted;
    setMuted(value);
    voice.current?.setMuted(value);
    if (value) {
      dictation.current?.abort();
      dictation.current = null;
      setListening(false);
      stopInterviewSpeech();
    }
  }

  function dictate() {
    if (!session || busy || ended.current) return;
    if (listening) {
      dictation.current?.stop();
      setListening(false);
      return;
    }
    stopInterviewSpeech();
    setError("");
    try {
      dictation.current = startDictation(
        session.setup.lang,
        (text) => {
          if (mounted.current)
            setAnswer((old) => `${old}${old ? " " : ""}${text}`);
        },
        (value) => {
          if (mounted.current) {
            setError(value);
            setListening(false);
          }
        },
        () => {
          if (mounted.current) setListening(false);
        },
      );
      setListening(true);
    } catch (error) {
      setError(message(error));
    }
  }

  async function restore() {
    if (!savedId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await api<InterviewSession>(`/interviews/${savedId}`);
      if (!mounted.current) return;
      update(value);
      transcript.current = [...value.turns];
      lastSavedTranscript.current = JSON.stringify(value.turns);
      ended.current = value.status === "finished";
      setStopped(value.status === "finished");
      setVoiceStatus(
        "Saved session loaded. Reconnect OpenAI or continue with DeepSeek.",
      );
    } catch (error) {
      if (mounted.current) setError(message(error));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function reset() {
    cleanupAudio();
    update(null);
    setSession(null);
    setAnswer("");
    setError("");
    setStopped(false);
    ended.current = false;
    setMuted(false);
    transcript.current = [];
  }
  return {
    session,
    busy,
    error,
    setError,
    voiceStatus,
    connected,
    connecting,
    muted,
    listening,
    answer,
    setAnswer,
    stopped,
    remaining,
    savedId,
    start,
    sendAnswer,
    finish,
    toggleMute,
    dictate,
    restore,
    reset,
    reconnect: (textOnly: boolean) => session && connect(session, textOnly),
  };
}
