import type { InterviewTurn } from "@kb/shared";

export interface InterviewVoice {
  sendText(text: string, id: string): void;
  setMuted(muted: boolean): void;
  close(): void;
  finish?(): Promise<{ drained: boolean }>;
}

export type RealtimeVoiceOptions = {
  token: string;
  lang: "en" | "vi";
  /** Receive interviewer audio, but do not request or transmit microphone audio. */
  textOnly?: boolean;
  signal?: AbortSignal;
  history?: InterviewTurn[];
  onTurn: (turn: InterviewTurn) => void;
  onError: (message: string) => void;
  onStatus?: (status: string) => void;
};

/** Connect directly using a short-lived server-issued token, never a permanent API key. */
export async function createRealtimeVoice(
  opts: RealtimeVoiceOptions,
): Promise<InterviewVoice> {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error(
      "This browser does not support WebRTC. Use a current browser for OpenAI interviews.",
    );
  }
  if (opts.signal?.aborted) throw new Error("Voice connection cancelled.");
  const pc = new RTCPeerConnection();
  const audio = document.createElement("audio");
  audio.autoplay = true;
  const dc = pc.createDataChannel("oai-events");
  const request = new AbortController();
  const seen = new Set<string>();
  const previousItems = new Map<string, string | null>();
  const pendingTurns = new Map<string, InterviewTurn>();
  const pendingInputs = new Set<string>();
  const pendingOutputs = new Set<string>();
  let localStream: MediaStream | undefined;
  let closed = false;
  let connected = false;
  let speechActive = false;
  let responseActive = false;
  let draining = false;
  let transcriptionFailed = false;
  let finishPromise: Promise<{ drained: boolean }> | undefined;
  let settleDrain: ((drained: boolean) => void) | undefined;
  let checkDrain = () => {};
  let rejectCancelled!: (reason: Error) => void;
  const cancelled = new Promise<never>((_, reject) => {
    rejectCancelled = reject;
  });
  // Attach a handler immediately, including during pending microphone permission.
  void cancelled.catch(() => {});
  const close = () => {
    if (closed) return;
    if (settleDrain) {
      settleDrain(false);
      return;
    }
    closed = true;
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener("abort", abort);
    request.abort();
    dc.close();
    localStream?.getTracks().forEach((track) => track.stop());
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    audio.pause();
    audio.srcObject = null;
    audio.remove();
  };
  const abort = () => {
    rejectCancelled(new Error("Voice connection cancelled."));
    close();
  };
  opts.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    rejectCancelled(
      new Error("Voice connection timed out. Retry or use typed answers."),
    );
    close();
  }, 20_000);

  const failConnection = () => {
    if (closed) return;
    const message =
      "Voice connection disconnected. Reconnect or finish the interview.";
    rejectCancelled(new Error(message));
    close();
    if (connected) {
      opts.onStatus?.("Disconnected");
      opts.onError(message);
    }
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState))
      failConnection();
  };
  pc.ontrack = (event) => {
    if (closed || draining) return;
    audio.srcObject = event.streams[0];
    void audio.play().catch(() => {
      if (!closed)
        opts.onError(
          "Audio playback was blocked. Allow audio in your browser; questions remain visible.",
        );
    });
  };
  const flushTurns = () => {
    // Audio transcriptions may arrive after the assistant has already replied.
    // When the provider supplied an item chain, wait for its prior message.
    let progressed = true;
    while (!closed && progressed) {
      progressed = false;
      for (const [id, turn] of pendingTurns) {
        if (closed) return;
        const previous = previousItems.get(id);
        if (previous && previousItems.has(previous) && !seen.has(previous))
          continue;
        pendingTurns.delete(id);
        seen.add(id);
        opts.onTurn(turn);
        progressed = true;
      }
    }
  };
  const emit = (id: unknown, role: InterviewTurn["role"], text: unknown) => {
    if (typeof id === "string") {
      if (role === "user") pendingInputs.delete(id);
      else pendingOutputs.delete(id);
    }
    if (
      closed ||
      typeof id !== "string" ||
      typeof text !== "string" ||
      !text.trim() ||
      seen.has(id) ||
      pendingTurns.has(id)
    )
      return;
    pendingTurns.set(id, { id, role, text: text.trim() });
    flushTurns();
  };
  dc.addEventListener("message", (event) => {
    if (closed) return;
    let message: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(event.data);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return;
      message = parsed as Record<string, unknown>;
    } catch {
      return;
    }
    switch (message.type) {
      case "conversation.item.added": {
        const item = message.item as
          { id?: unknown; type?: unknown; role?: unknown } | undefined;
        if (
          item?.type === "message" &&
          typeof item.id === "string" &&
          (item.role === "user" || item.role === "assistant")
        ) {
          previousItems.set(
            item.id,
            typeof message.previous_item_id === "string"
              ? message.previous_item_id
              : null,
          );
          if (item.role === "assistant" && !seen.has(item.id))
            pendingOutputs.add(item.id);
        }
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        emit(message.item_id, "user", message.transcript);
        break;
      case "response.output_audio_transcript.done":
        emit(message.item_id, "assistant", message.transcript);
        break;
      case "response.output_text.done":
        emit(message.item_id, "assistant", message.text);
        break;
      case "input_audio_buffer.speech_started":
        speechActive = true;
        if (typeof message.item_id === "string")
          pendingInputs.add(message.item_id);
        if (!draining) opts.onStatus?.("Listening");
        break;
      case "input_audio_buffer.speech_stopped":
        speechActive = false;
        if (typeof message.item_id === "string" && !seen.has(message.item_id))
          pendingInputs.add(message.item_id);
        break;
      case "input_audio_buffer.committed":
        speechActive = false;
        if (typeof message.item_id === "string" && !seen.has(message.item_id))
          pendingInputs.add(message.item_id);
        break;
      case "response.created":
        responseActive = true;
        if (draining) {
          try {
            dc.send(JSON.stringify({ type: "response.cancel" }));
          } catch {
            settleDrain?.(false);
          }
        } else opts.onStatus?.("Interviewer speaking");
        break;
      case "response.done": {
        responseActive = false;
        const response = message.response as
          | {
              status?: string;
              output?: Array<{
                id?: string;
                role?: string;
                content?: Array<{ text?: string; transcript?: string }>;
              }>;
            }
          | undefined;
        // Cancelled output may finalize its text only in the response snapshot.
        for (const item of response?.output ?? []) {
          if (item.role !== "assistant" || !item.id) continue;
          const text = item.content
            ?.map((content) => content.transcript ?? content.text ?? "")
            .join("");
          if (text) emit(item.id, "assistant", text);
          else {
            pendingOutputs.delete(item.id);
            seen.add(item.id);
          }
        }
        flushTurns();
        if (
          response?.status === "failed" ||
          response?.status === "incomplete"
        ) {
          opts.onError(
            "The interviewer response failed. Try sending your answer again or reconnect.",
          );
        }
        if (!draining) opts.onStatus?.("Your turn");
        break;
      }
      case "conversation.item.input_audio_transcription.failed":
        transcriptionFailed = true;
        if (typeof message.item_id === "string") {
          pendingInputs.delete(message.item_id);
          seen.add(message.item_id);
          flushTurns();
        }
        opts.onError(
          "Your speech could not be transcribed. Please repeat or type your answer.",
        );
        break;
      case "error":
        opts.onError(
          "The voice provider reported an error. Retry your answer or reconnect.",
        );
        break;
    }
    checkDrain();
  });
  dc.addEventListener("close", () => {
    if (!closed) failConnection();
  });
  dc.addEventListener("error", () => {
    if (!closed) failConnection();
  });
  const ready = new Promise<void>((resolve, reject) => {
    dc.addEventListener(
      "open",
      () => {
        if (closed) return;
        try {
          let previous: string | undefined;
          for (const [index, turn] of (opts.history ?? []).entries()) {
            const id = `hist_${index}_${turn.id.replace(/\W/g, "").slice(0, 18)}`;
            seen.add(id);
            seen.add(turn.id);
            dc.send(
              JSON.stringify({
                type: "conversation.item.create",
                ...(previous ? { previous_item_id: previous } : {}),
                item: {
                  id,
                  type: "message",
                  role: turn.role,
                  content: [
                    {
                      type:
                        turn.role === "assistant"
                          ? "output_text"
                          : "input_text",
                      text: turn.text,
                    },
                  ],
                },
              }),
            );
            previous = id;
          }
          const instruction = opts.history?.length
            ? "Resume this mock interview from the conversation history. Do not introduce yourself or restart. If the last message is a candidate answer, ask a relevant follow-up; if it is an interviewer question, briefly repeat that outstanding question and wait."
            : "Begin the mock interview now. Briefly introduce yourself and ask the first question.";
          // Per-response instructions replace the session instructions, including
          // its source context. Add a small system cue instead and keep them intact.
          dc.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "system",
                content: [
                  {
                    type: "input_text",
                    text: `${instruction} Speak ${opts.lang === "vi" ? "Vietnamese" : "English"} and follow all session instructions.`,
                  },
                ],
              },
            }),
          );
          dc.send(JSON.stringify({ type: "response.create" }));
          resolve();
        } catch {
          reject(
            new Error("Could not start the voice interview. Please reconnect."),
          );
        }
      },
      { once: true },
    );
  });
  // A close can win the race even before the data channel opens.
  void ready.catch(() => {});

  try {
    opts.onStatus?.("Connecting");
    if (!opts.textOnly) {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Microphone access is unavailable. Use HTTPS or localhost, or choose typed answers.",
        );
      const microphone = navigator.mediaDevices
        .getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        })
        .then((stream) => {
          if (closed) stream.getTracks().forEach((track) => track.stop());
          else localStream = stream;
          return stream;
        })
        .catch(() => {
          throw new Error(
            "Microphone permission was denied or no microphone is available. Allow access or choose typed answers.",
          );
        });
      const stream = await Promise.race([microphone, cancelled]);
      if (closed) throw new Error("Voice connection cancelled.");
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
    }
    const offer = await Promise.race([pc.createOffer(), cancelled]);
    await Promise.race([pc.setLocalDescription(offer), cancelled]);
    const response = await Promise.race([
      fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${opts.token}`,
          "Content-Type": "application/sdp",
        },
        signal: request.signal,
      }),
      cancelled,
    ]);
    if (!response.ok)
      throw new Error(
        "Could not connect to OpenAI voice. Retry with a new session credential.",
      );
    const sdp = await Promise.race([response.text(), cancelled]);
    await Promise.race([
      pc.setRemoteDescription({ type: "answer", sdp }),
      cancelled,
    ]);
    await Promise.race([ready, cancelled]);
    if (closed) throw new Error("Voice connection cancelled.");
    connected = true;
    clearTimeout(timer);
    opts.onStatus?.("Connected");
    return {
      sendText(text, id) {
        if (closed || draining || dc.readyState !== "open")
          throw new Error("Voice connection is closed. Please reconnect.");
        const value = text.trim();
        if (!value || seen.has(id)) return;
        dc.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              id,
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: value }],
            },
          }),
        );
        emit(id, "user", value);
        dc.send(JSON.stringify({ type: "response.create" }));
      },
      setMuted(muted) {
        localStream?.getAudioTracks().forEach((track) => {
          track.enabled = !muted;
        });
      },
      close,
      finish() {
        if (finishPromise) return finishPromise;
        if (closed) return Promise.resolve({ drained: false });
        draining = true;
        // Stop capture and playback immediately. Keep only the event channel alive
        // while the provider finalizes audio it has already received.
        localStream?.getTracks().forEach((track) => {
          track.enabled = false;
          track.stop();
        });
        localStream = undefined;
        audio.pause();
        finishPromise = new Promise((resolve) => {
          let minimumElapsed = false;
          settleDrain = (drained) => {
            settleDrain = undefined;
            checkDrain = () => {};
            clearTimeout(minimumTimer);
            clearTimeout(deadline);
            // Preserve already-known text even if a missing predecessor timed out.
            if (!drained) {
              previousItems.clear();
              flushTurns();
            }
            close();
            resolve({ drained: drained && !transcriptionFailed });
          };
          checkDrain = () => {
            if (
              minimumElapsed &&
              !speechActive &&
              !responseActive &&
              !pendingInputs.size &&
              !pendingOutputs.size &&
              !pendingTurns.size
            )
              settleDrain?.(true);
          };
          const minimumTimer = setTimeout(() => {
            minimumElapsed = true;
            checkDrain();
          }, 250);
          const deadline = setTimeout(() => settleDrain?.(false), 2000);
          try {
            if (responseActive)
              dc.send(JSON.stringify({ type: "response.cancel" }));
            if (speechActive)
              dc.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          } catch {
            settleDrain(false);
          }
        });
        return finishPromise;
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<RecognitionResult>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
function recognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  const target = window as SpeechWindow;
  return target.SpeechRecognition ?? target.webkitSpeechRecognition;
}

export function supportsSpeechRecognition(): boolean {
  return Boolean(recognitionConstructor());
}

/** Dictation never submits an answer; the user reviews the final text first. */
export function startDictation(
  lang: "en" | "vi",
  onText: (text: string) => void,
  onError: (message: string) => void,
  onEnd?: () => void,
): { stop(): void; abort(): void } {
  const Constructor = recognitionConstructor();
  if (!Constructor)
    throw new Error(
      "Speech recognition is not supported in this browser. Type your answer instead.",
    );
  const recognition = new Constructor();
  let ended = false;
  const end = () => {
    if (!ended) {
      ended = true;
      onEnd?.();
    }
  };
  recognition.lang = lang === "vi" ? "vi-VN" : "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    if (ended) return;
    const text: string[] = [];
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal && result[0]?.transcript.trim())
        text.push(result[0].transcript.trim());
    }
    if (text.length) onText(text.join(" "));
  };
  recognition.onerror = (event) => {
    if (ended || event.error === "aborted") return;
    const message =
      event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone permission was denied. Allow permission or type your answer."
        : event.error === "no-speech"
          ? "No speech was detected. Try again or type your answer."
          : event.error === "language-not-supported"
            ? "Speech recognition does not support this language in your browser. Type your answer instead."
            : "Speech recognition is unavailable. Check your microphone and connection, or type your answer.";
    onError(message);
  };
  recognition.onend = end;
  recognition.start();
  return {
    stop() {
      if (!ended) recognition.stop();
    },
    abort() {
      if (ended) return;
      end();
      recognition.abort();
    },
  };
}

export type BrowserInterviewVoice = {
  id: string;
  name: string;
  lang: string;
  local: boolean;
  isDefault: boolean;
  /** 0 = plain native, 1 = enhanced, 2 = premium, 3 = neural/natural. Higher sorts first. */
  quality: number;
};

const normalizedLocale = (lang: string) =>
  lang.toLowerCase().replaceAll("_", "-");
const voiceId = (voice: SpeechSynthesisVoice) =>
  voice.voiceURI || `${voice.name}::${voice.lang}`;
const compatibleVoice = (voice: SpeechSynthesisVoice, lang: "en" | "vi") =>
  normalizedLocale(voice.lang).split("-")[0] === lang;

// Browser voice metadata has no standard quality field. Only explicit engine
// labels qualify; a familiar human name alone does not establish quality.
const qualityToken = (label: string, tier: string) =>
  new RegExp(`(?:^|[^a-z])(?:${tier})(?=$|[^a-z])`, "i").test(label);
function voiceQuality(voice: SpeechSynthesisVoice): number {
  const labels = [voice.name, voice.voiceURI];
  if (
    labels.some(
      (label) =>
        qualityToken(label, "neural|natural") ||
        /neural(?:$|[^a-z])/i.test(label),
    )
  )
    return 3;
  if (labels.some((label) => qualityToken(label, "premium"))) return 2;
  if (labels.some((label) => qualityToken(label, "enhanced"))) return 1;
  return 0;
}
const noveltyVoice =
  /(?:^|[^a-z])(?:albert|bad[\s_.-]*news|bahh|bells|boing|bubbles|cellos|deranged|good[\s_.-]*news|hysterical|pipe[\s_.-]*organ|trinoids|whisper|zarvox|wobble|junior|jester|organ|superstar|robot(?:ic)?|novelty|effects?)(?=(?:natural|neural|premium|enhanced)?(?:$|[^a-z]))/i;
function excludedVoice(voice: SpeechSynthesisVoice): boolean {
  return [voice.name, voice.voiceURI].some(
    (label) =>
      /compact/i.test(label) ||
      noveltyVoice.test(label.replace(/([a-z])([A-Z])/g, "$1 $2")),
  );
}
function baseVoiceName(voice: SpeechSynthesisVoice): string {
  return (
    voice.name
      .normalize("NFKC")
      .replace(/Neural(?=$|[^a-z])/g, " Neural")
      .replace(/\b(?:natural|neural|premium|enhanced|online|desktop)\b/gi, "")
      .replace(/^\s*(?:Microsoft|Google)\s+/i, "")
      .replace(/\s+-\s+(?:English|Vietnamese)\b.*$/i, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "") || voiceId(voice)
  );
}

function nativeInterviewVoices(lang: "en" | "vi"): SpeechSynthesisVoice[] {
  if (
    typeof speechSynthesis === "undefined" ||
    typeof speechSynthesis.getVoices !== "function"
  )
    return [];
  try {
    const localeRank = (voice: SpeechSynthesisVoice) => {
      const locale = normalizedLocale(voice.lang);
      if (locale === (lang === "vi" ? "vi-vn" : "en-us")) return 2;
      return lang === "en" && locale === "en-gb" ? 1 : 0;
    };
    const voices = speechSynthesis
      .getVoices()
      .filter(
        (voice) => compatibleVoice(voice, lang) && !excludedVoice(voice),
      );
    // Quality (enhanced/premium/neural/natural) only ranks voices higher; it is
    // no longer a membership gate, so plain native voices (Samantha, Daniel, …)
    // still appear. These labels remain a heuristic, not a guarantee of natural
    // pronunciation.
    voices.sort(
      (a, b) =>
        voiceQuality(b) - voiceQuality(a) ||
        localeRank(b) - localeRank(a) ||
        Number(b.default) - Number(a.default) ||
        a.name.localeCompare(b.name) ||
        voiceId(a).localeCompare(voiceId(b)),
    );
    const ids = new Set<string>();
    const variants = new Set<string>();
    return voices
      .filter((voice) => {
        const id = voiceId(voice);
        const variant = `${baseVoiceName(voice)}::${normalizedLocale(voice.lang)}`;
        if (ids.has(id) || variants.has(variant)) return false;
        ids.add(id);
        variants.add(variant);
        return true;
      })
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function getInterviewVoices(lang: "en" | "vi"): BrowserInterviewVoice[] {
  return nativeInterviewVoices(lang).map((voice) => ({
    id: voiceId(voice),
    name: voice.name,
    lang: voice.lang,
    local: voice.localService,
    isDefault: voice.default,
    quality: voiceQuality(voice),
  }));
}

/** Voice lists can load asynchronously and change when an OS voice is installed. */
export function observeInterviewVoices(
  lang: "en" | "vi",
  onVoices: (voices: BrowserInterviewVoice[]) => void,
): () => void {
  let active = true;
  const update = () => {
    if (active) onVoices(getInterviewVoices(lang));
  };
  update();
  if (typeof speechSynthesis === "undefined")
    return () => {
      active = false;
    };
  const synth = speechSynthesis;
  if (typeof synth.addEventListener === "function") {
    synth.addEventListener("voiceschanged", update);
    return () => {
      active = false;
      synth.removeEventListener("voiceschanged", update);
    };
  }
  const previous = synth.onvoiceschanged;
  const handle = (event: Event) => {
    previous?.call(synth, event);
    update();
  };
  synth.onvoiceschanged = handle;
  return () => {
    active = false;
    if (synth.onvoiceschanged === handle) synth.onvoiceschanged = previous;
  };
}

let currentSpeechEnd: (() => void) | undefined;

export function speakInterviewText(
  text: string,
  lang: "en" | "vi",
  onError?: (message: string) => void,
  selectedVoiceId?: string,
  onEnd?: () => void,
): void {
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    if (currentSpeechEnd === end) currentSpeechEnd = undefined;
    onEnd?.();
  };
  if (
    typeof speechSynthesis === "undefined" ||
    typeof SpeechSynthesisUtterance === "undefined" ||
    typeof speechSynthesis.speak !== "function" ||
    typeof speechSynthesis.cancel !== "function"
  ) {
    onError?.(
      "Speech playback is unavailable. Read the interviewer question on screen.",
    );
    end();
    return;
  }
  stopInterviewSpeech();
  if (!text.trim()) {
    end();
    return;
  }
  const voices = nativeInterviewVoices(lang);
  const voice =
    voices.find((item) => voiceId(item) === selectedVoiceId) ?? voices[0];
  if (!voice) {
    onError?.(
      `No ${lang === "vi" ? "Vietnamese" : "English"} voice is installed in your browser. Install a system voice for this language, use a cloud voice provider, or continue with typed answers.`,
    );
    end();
    return;
  }
  if (selectedVoiceId && voiceId(voice) !== selectedVoiceId) {
    onError?.(
      `The selected voice is unavailable for ${lang === "vi" ? "Vietnamese" : "English"}. Using ${voice.name} instead.`,
    );
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.lang;
  utterance.voice = voice;
  utterance.onend = end;
  utterance.onerror = (event) => {
    if (ended) return;
    if (!["canceled", "interrupted"].includes(event.error))
      onError?.(
        "Speech playback failed. Read the interviewer question on screen.",
      );
    end();
  };
  currentSpeechEnd = end;
  try {
    speechSynthesis.speak(utterance);
  } catch {
    onError?.(
      "Speech playback failed. Read the interviewer question on screen.",
    );
    end();
  }
}

export function stopInterviewSpeech(): void {
  if (
    typeof speechSynthesis !== "undefined" &&
    typeof speechSynthesis.cancel === "function"
  )
    speechSynthesis.cancel();
  currentSpeechEnd?.();
}
