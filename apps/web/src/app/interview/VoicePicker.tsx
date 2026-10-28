"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { OPENAI_INTERVIEW_VOICES } from "@kb/shared";
import { api } from "@/lib/api";
import {
  observeInterviewVoices,
  speakInterviewText,
  stopInterviewSpeech,
  type BrowserInterviewVoice,
} from "@/lib/interview-voice";
import styles from "./interview.module.css";

const samples = {
  en: "Hello. Welcome to your mock interview. Take your time, and walk me through your reasoning.",
  vi: "Xin chào. Chào mừng bạn đến với buổi phỏng vấn thử. Hãy bình tĩnh và chia sẻ cách bạn giải quyết vấn đề.",
};

export function VoicePicker({
  provider,
  lang,
  value,
  onChange,
}: {
  provider: "openai" | "deepseek";
  lang: "en" | "vi";
  value: string;
  onChange: (id: string, label: string) => void;
}) {
  const [voices, setVoices] = useState<BrowserInterviewVoice[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const stop = useCallback(() => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.src = "";
      audio.current = null;
    }
    stopInterviewSpeech();
    if (alive.current) {
      setPlaying(false);
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
    };
  }, [stop]);
  useEffect(() => {
    stop();
    setError("");
  }, [provider, lang, value, stop]);
  useEffect(() => {
    if (provider === "openai") {
      setVoices([]);
      return;
    }
    return observeInterviewVoices(lang, (voices) =>
      setVoices(voices.slice(0, 10)),
    );
  }, [provider, lang]);
  const selected = provider === "openai" ? value || "marin" : value;
  const selectedMissing =
    provider === "deepseek" &&
    Boolean(value) &&
    !voices.some((voice) => voice.id === value);
  const label = (voice: BrowserInterviewVoice) =>
    `${voice.name} (${voice.lang})`;
  function choose(id: string) {
    const name =
      provider === "openai"
        ? id[0].toUpperCase() + id.slice(1)
        : voices.find((voice) => voice.id === id);
    onChange(
      id,
      typeof name === "string" ? name : name ? label(name) : "Automatic",
    );
  }
  async function preview() {
    if (playing || loading) {
      stop();
      return;
    }
    setError("");
    const revision = ++generation.current;
    const done = () => {
      if (alive.current && revision === generation.current) {
        setPlaying(false);
        setLoading(false);
      }
    };
    const fail = (message: string) => {
      if (alive.current && revision === generation.current) {
        setError(message);
        done();
      }
    };
    if (provider === "deepseek") {
      setPlaying(true);
      speakInterviewText(
        samples[lang],
        lang,
        (message) => {
          if (alive.current && revision === generation.current)
            setError(message);
        },
        value || undefined,
        done,
      );
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const result = await api<{ audio: string; mime: string }>(
        "/interviews/voice-preview",
        {
          method: "POST",
          body: JSON.stringify({ voice: selected, lang }),
          signal: controller.signal,
        },
      );
      if (
        controller.signal.aborted ||
        !alive.current ||
        revision !== generation.current
      )
        return;
      if (
        result.mime !== "audio/mpeg" ||
        typeof result.audio !== "string" ||
        !result.audio ||
        result.audio.length > 1_500_000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(result.audio)
      )
        throw new Error(
          "The voice preview returned invalid audio. Please retry.",
        );
      const player = new Audio(`data:audio/mpeg;base64,${result.audio}`);
      audio.current = player;
      player.onended = done;
      player.onerror = () =>
        fail(
          "Preview playback failed. Allow browser audio or try another voice.",
        );
      await player.play();
      if (revision === generation.current && alive.current) {
        setLoading(false);
        setPlaying(true);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        fail(
          error instanceof Error
            ? error.message
            : "Voice preview failed. Please retry.",
        );
    }
  }
  return (
    <div className={styles.voicePicker}>
      <label htmlFor="interview-voice">Interviewer voice</label>
      <div className={styles.voiceControls}>
        <select
          id="interview-voice"
          value={selectedMissing ? "" : selected}
          onChange={(event) => choose(event.target.value)}
        >
          {provider === "openai" ? (
            OPENAI_INTERVIEW_VOICES.map((voice) => (
              <option key={voice} value={voice}>
                {voice[0].toUpperCase() + voice.slice(1)}
                {["marin", "cedar"].includes(voice) ? " · recommended" : ""}
              </option>
            ))
          ) : (
            <>
              <option value="">
                Automatic
                {voices.length
                  ? ` · ${voices[0].name}`
                  : " · no high-quality voice available"}
              </option>
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {label(voice)}
                </option>
              ))}
            </>
          )}
        </select>
        <button
          type="button"
          className="ghost"
          onClick={() => void preview()}
          disabled={provider === "deepseek" && !voices.length}
        >
          {loading
            ? "Cancel preview"
            : playing
              ? "Stop preview"
              : "Preview voice"}
        </button>
      </div>
      <p className={styles.hint}>
        {provider === "openai"
          ? "Preview uses OpenAI API credits. Voice is fixed when the interview starts."
          : "Up to 10 quality-filtered voices. Basic and novelty voices are excluded. Preview uses the installed voice; quality still depends on the speech engine."}
      </p>
      {provider === "deepseek" && !voices.length && (
        <p className={styles.hint}>
          No high-quality {lang === "vi" ? "Vietnamese" : "English"} voice is
          available on this device. Install an Enhanced or Premium voice, or use
          a configured neural speech provider. Basic voices will not be used as
          a fallback. Typed interviews remain available.
        </p>
      )}
      {selectedMissing && (
        <p className={styles.hint}>
          Your selected voice is unavailable or excluded by the quality filter.
          Only a quality-filtered voice in the same language can replace it.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
