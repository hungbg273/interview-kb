import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRealtimeVoice,
  speakInterviewText,
  startDictation,
  stopInterviewSpeech,
  supportsSpeechRecognition,
  getInterviewVoices,
  observeInterviewVoices,
} from "./interview-voice";

class FakeChannel extends EventTarget {
  readyState = "connecting";
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = "closed";
  });
  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }
  message(data: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }
}
class FakePeer extends EventTarget {
  static latest: FakePeer;
  channel = new FakeChannel();
  connectionState = "new";
  ontrack: ((event: { streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn();
  addTransceiver = vi.fn();
  createDataChannel = vi.fn(() => this.channel);
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {
    this.channel.open();
  });
  close = vi.fn();
  constructor() {
    super();
    FakePeer.latest = this;
  }
}

const stopTrack = vi.fn();
const track = { stop: stopTrack, enabled: true };
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
let microphone: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  track.enabled = true;
  stopTrack.mockReset();
  vi.stubGlobal("RTCPeerConnection", FakePeer);
  microphone = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: microphone },
  });
  fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, text: async () => "answer-sdp" });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenAI realtime voice", () => {
  it("connects with ephemeral credentials, greets, and sends a stable typed item", async () => {
    const voice = await createRealtimeVoice({
      token: "ephemeral",
      lang: "en",
      onTurn: vi.fn(),
      onError: vi.fn(),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        method: "POST",
        body: "offer-sdp",
        headers: {
          Authorization: "Bearer ephemeral",
          "Content-Type": "application/sdp",
        },
      }),
    );
    expect(FakePeer.latest.channel.send).toHaveBeenCalledWith(
      expect.stringContaining("response.create"),
    );
    voice.sendText("My answer", "candidate-1");
    const calls = FakePeer.latest.channel.send.mock.calls.map(([value]) =>
      JSON.parse(value),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        type: "conversation.item.create",
        item: expect.objectContaining({
          id: "candidate-1",
          role: "user",
          content: [{ type: "input_text", text: "My answer" }],
        }),
      }),
    );
    voice.setMuted(true);
    expect(track.enabled).toBe(false);
    voice.close();
    voice.close();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(FakePeer.latest.close).toHaveBeenCalledOnce();
  });

  it("supports text input when microphone access is unavailable", async () => {
    microphone.mockRejectedValue(new Error("denied"));
    const voice = await createRealtimeVoice({
      token: "ephemeral",
      lang: "vi",
      textOnly: true,
      onTurn: vi.fn(),
      onError: vi.fn(),
    });
    expect(microphone).not.toHaveBeenCalled();
    expect(FakePeer.latest.addTransceiver).toHaveBeenCalledWith("audio", {
      direction: "recvonly",
    });
    voice.close();
  });

  it("reports unsupported browsers and permission failures without leaving a peer open", async () => {
    vi.stubGlobal("RTCPeerConnection", undefined);
    await expect(
      createRealtimeVoice({
        token: "x",
        lang: "en",
        onTurn: vi.fn(),
        onError: vi.fn(),
      }),
    ).rejects.toThrow(/WebRTC/);
    vi.stubGlobal("RTCPeerConnection", FakePeer);
    microphone.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    await expect(
      createRealtimeVoice({
        token: "x",
        lang: "en",
        onTurn: vi.fn(),
        onError: vi.fn(),
      }),
    ).rejects.toThrow(/microphone|Microphone/);
    expect(FakePeer.latest.close).toHaveBeenCalledOnce();
  });

  it("deduplicates transcript events, preserves typed input and ignores events after close", async () => {
    const onTurn = vi.fn();
    const voice = await createRealtimeVoice({
      token: "x",
      lang: "en",
      onTurn,
      onError: vi.fn(),
    });
    const dc = FakePeer.latest.channel;
    const user = {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "user-1",
      transcript: "My experience",
    };
    dc.message(user);
    dc.message(user);
    dc.message({
      type: "response.output_audio_transcript.done",
      item_id: "bot-1",
      transcript: "Tell me more.",
    });
    dc.message({
      type: "response.output_text.done",
      item_id: "bot-1",
      text: "Tell me more.",
    });
    expect(onTurn.mock.calls.map(([value]) => value)).toEqual([
      { id: "user-1", role: "user", text: "My experience" },
      { id: "bot-1", role: "assistant", text: "Tell me more." },
    ]);
    voice.sendText("Typed answer", "typed-1");
    expect(onTurn).toHaveBeenLastCalledWith({
      id: "typed-1",
      role: "user",
      text: "Typed answer",
    });
    voice.close();
    dc.message({ ...user, item_id: "late" });
    expect(onTurn).toHaveBeenCalledTimes(3);
  });

  it("cleans up failed negotiations, unexpected disconnects and failed model responses", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    await expect(
      createRealtimeVoice({
        token: "x",
        lang: "en",
        onTurn: vi.fn(),
        onError: vi.fn(),
      }),
    ).rejects.toThrow(/connect/i);
    expect(stopTrack).toHaveBeenCalledOnce();
    const onError = vi.fn();
    const voice = await createRealtimeVoice({
      token: "x",
      lang: "en",
      onTurn: vi.fn(),
      onError,
    });
    FakePeer.latest.channel.message({
      type: "response.done",
      response: { status: "failed" },
    });
    expect(onError).toHaveBeenCalledWith(
      expect.stringMatching(/response|respond/i),
    );
    FakePeer.latest.connectionState = "failed";
    FakePeer.latest.onconnectionstatechange?.();
    expect(FakePeer.latest.close).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenLastCalledWith(
      expect.stringMatching(/disconnect/i),
    );
    expect(() => voice.sendText("late", "late")).toThrow(/closed|connected/i);
  });

  it("keeps a delayed candidate transcription ahead of its interviewer follow-up", async () => {
    const onTurn = vi.fn();
    const voice = await createRealtimeVoice({
      token: "x",
      lang: "en",
      onTurn,
      onError: vi.fn(),
    });
    const dc = FakePeer.latest.channel;
    dc.message({
      type: "conversation.item.added",
      previous_item_id: null,
      item: { id: "user-1", type: "message", role: "user" },
    });
    dc.message({
      type: "conversation.item.added",
      previous_item_id: "user-1",
      item: { id: "bot-1", type: "message", role: "assistant" },
    });
    dc.message({
      type: "response.output_audio_transcript.done",
      item_id: "bot-1",
      transcript: "Why?",
    });
    expect(onTurn).not.toHaveBeenCalled();
    dc.message({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "user-1",
      transcript: "I used queues.",
    });
    expect(onTurn.mock.calls.map(([turn]) => turn.id)).toEqual([
      "user-1",
      "bot-1",
    ]);
    voice.close();
  });

  it("stops a microphone that resolves after cancellation", async () => {
    let resolve!: (value: unknown) => void;
    microphone.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const abort = new AbortController();
    const pending = createRealtimeVoice({
      token: "x",
      lang: "en",
      signal: abort.signal,
      onTurn: vi.fn(),
      onError: vi.fn(),
    });
    const assertion = expect(pending).rejects.toThrow(/cancel/i);
    abort.abort();
    await assertion;
    resolve(stream);
    await Promise.resolve();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("times out stalled connections and releases the microphone", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = createRealtimeVoice({
      token: "x",
      lang: "en",
      onTurn: vi.fn(),
      onError: vi.fn(),
    });
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("seeds prior turns before resuming and preserves contextual session instructions", async () => {
    const onTurn = vi.fn();
    const voice = await createRealtimeVoice({
      token: "x",
      lang: "en",
      history: [
        {
          id: "question-long-original-id",
          role: "assistant",
          text: "How did you design it?",
        },
        { id: "user-long-original-id", role: "user", text: "I used a queue." },
      ],
      onTurn,
      onError: vi.fn(),
    });
    const messages = FakePeer.latest.channel.send.mock.calls.map(([value]) =>
      JSON.parse(value),
    );
    expect(messages[0]).toMatchObject({
      type: "conversation.item.create",
      item: {
        role: "assistant",
        content: [{ type: "output_text", text: "How did you design it?" }],
      },
    });
    expect(messages[1]).toMatchObject({
      type: "conversation.item.create",
      item: {
        role: "user",
        content: [{ type: "input_text", text: "I used a queue." }],
      },
    });
    expect(messages.at(-2)).toMatchObject({
      type: "conversation.item.create",
      item: {
        role: "system",
        content: [
          { type: "input_text", text: expect.stringMatching(/resume/i) },
        ],
      },
    });
    expect(messages.at(-1)).toEqual({ type: "response.create" });
    expect(onTurn).not.toHaveBeenCalled();
    voice.close();
  });

  it("stops audio immediately but drains delayed input and output transcript before closing", async () => {
    vi.useFakeTimers();
    const onTurn = vi.fn();
    const voice = await createRealtimeVoice({
      token: "x",
      lang: "en",
      onTurn,
      onError: vi.fn(),
    });
    const dc = FakePeer.latest.channel;
    dc.message({ type: "input_audio_buffer.speech_started", item_id: "u1" });
    dc.message({ type: "input_audio_buffer.speech_stopped", item_id: "u1" });
    dc.message({ type: "input_audio_buffer.committed", item_id: "u1" });
    dc.message({ type: "response.created" });
    const finishing = voice.finish!();
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(FakePeer.latest.close).not.toHaveBeenCalled();
    expect(dc.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "response.cancel" }),
    );
    dc.message({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "u1",
      transcript: "My final answer.",
    });
    dc.message({
      type: "response.output_audio_transcript.done",
      item_id: "a1",
      transcript: "Thank you.",
    });
    dc.message({ type: "response.done", response: { status: "cancelled" } });
    await vi.advanceTimersByTimeAsync(250);
    await expect(finishing).resolves.toEqual({ drained: true });
    expect(onTurn.mock.calls.map(([turn]) => turn.text)).toEqual([
      "My final answer.",
      "Thank you.",
    ]);
    expect(FakePeer.latest.close).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("bounds transcript drain and retains known assistant text when final speech is missing", async () => {
    vi.useFakeTimers();
    const onTurn = vi.fn();
    const voice = await createRealtimeVoice({
      token: "x",
      lang: "en",
      onTurn,
      onError: vi.fn(),
    });
    const dc = FakePeer.latest.channel;
    dc.message({ type: "input_audio_buffer.speech_started", item_id: "u1" });
    dc.message({
      type: "conversation.item.added",
      item: { id: "u1", type: "message", role: "user" },
    });
    dc.message({
      type: "conversation.item.added",
      previous_item_id: "u1",
      item: { id: "a1", type: "message", role: "assistant" },
    });
    dc.message({
      type: "response.output_audio_transcript.done",
      item_id: "a1",
      transcript: "Known follow-up.",
    });
    const finishing = voice.finish!();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(finishing).resolves.toEqual({ drained: false });
    expect(onTurn).toHaveBeenCalledWith({
      id: "a1",
      role: "assistant",
      text: "Known follow-up.",
    });
    expect(FakePeer.latest.close).toHaveBeenCalledOnce();
  });

  it("settles a drain when navigation aborts without closing resources twice", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const voice = await createRealtimeVoice({
      token: "x",
      lang: "en",
      signal: controller.signal,
      onTurn: vi.fn(),
      onError: vi.fn(),
    });
    const finishing = voice.finish!();
    controller.abort();
    await expect(finishing).resolves.toEqual({ drained: false });
    expect(FakePeer.latest.close).toHaveBeenCalledOnce();
  });

  it("cancels an automatic response that begins while the final transcript is draining", async () => {
    vi.useFakeTimers();
    const voice = await createRealtimeVoice({
      token: "x",
      lang: "en",
      onTurn: vi.fn(),
      onError: vi.fn(),
    });
    const finishing = voice.finish!();
    FakePeer.latest.channel.message({ type: "response.created" });
    expect(FakePeer.latest.channel.send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: "response.cancel" }),
    );
    FakePeer.latest.channel.message({
      type: "response.done",
      response: { status: "cancelled" },
    });
    await vi.advanceTimersByTimeAsync(250);
    await expect(finishing).resolves.toEqual({ drained: true });
  });
});

describe("browser speech", () => {
  class Recognition {
    static latest: Recognition;
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
    constructor() {
      Recognition.latest = this;
    }
  }

  it("detects missing speech support and configures dictation language", () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", undefined);
    expect(supportsSpeechRecognition()).toBe(false);
    expect(() => startDictation("en", vi.fn(), vi.fn())).toThrow(/support/i);
    vi.stubGlobal("SpeechRecognition", Recognition);
    expect(supportsSpeechRecognition()).toBe(true);
    const onText = vi.fn();
    const onError = vi.fn();
    const onEnd = vi.fn();
    const dictation = startDictation("vi", onText, onError, onEnd);
    expect(Recognition.latest.lang).toBe("vi-VN");
    Recognition.latest.onresult?.({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "Xin chào" }], { isFinal: true }),
        Object.assign([{ transcript: "partial" }], { isFinal: false }),
      ],
    });
    expect(onText).toHaveBeenCalledExactlyOnceWith("Xin chào");
    Recognition.latest.onerror?.({ error: "not-allowed" });
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/permission/i));
    Recognition.latest.onend?.();
    expect(onEnd).toHaveBeenCalledOnce();
    dictation.abort();
    Recognition.latest.onresult?.({
      resultIndex: 0,
      results: [Object.assign([{ transcript: "late" }], { isFinal: true })],
    });
    expect(onText).toHaveBeenCalledOnce();
  });

  it("cancels earlier playback and uses the selected language", () => {
    const synth = {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: () => [
        {
          voiceURI: "en-default",
          name: "English Enhanced",
          lang: "en-US",
          localService: true,
          default: true,
        },
      ],
    };
    vi.stubGlobal("speechSynthesis", synth);
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        constructor(public text: string) {}
      },
    );
    speakInterviewText("Hello", "en");
    expect(synth.cancel).toHaveBeenCalledOnce();
    expect(synth.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello", lang: "en-US" }),
    );
    stopInterviewSpeech();
    expect(synth.cancel).toHaveBeenCalledTimes(2);
  });
});

describe("browser interview voice selection", () => {
  const voice = (
    id: string,
    name: string,
    lang: string,
    isDefault = false,
  ) => ({ voiceURI: id, name, lang, localService: true, default: isDefault });
  function setup(voices: ReturnType<typeof voice>[]) {
    const synth = Object.assign(new EventTarget(), {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn(() => voices),
    });
    vi.stubGlobal("speechSynthesis", synth);
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        lang = "";
        voice: unknown;
        onend: (() => void) | null = null;
        onerror: ((event: { error: string }) => void) | null = null;
        constructor(public text: string) {}
      },
    );
    return synth;
  }

  it("filters languages and prioritizes enhanced labels, preferred locale, then default", () => {
    setup([
      voice("gb", "Z British", "en-GB", true),
      voice("vn", "Vietnamese Premium", "vi-VN"),
      voice("us", "US standard", "en-US"),
      voice("natural-gb", "British Natural", "en-GB"),
      voice("natural-us", "US Neural", "en-US"),
      voice("english-word", "Invalid language", "english"),
      voice("us-default", "Default standard", "en-US", true),
    ]);
    // Quality (neural/natural) ranks first, then preferred locale (en-US > en-GB),
    // then the OS default. Plain native voices still appear, just lower down.
    expect(getInterviewVoices("en").map((item) => item.id)).toEqual([
      "natural-us",
      "natural-gb",
      "us-default",
      "us",
      "gb",
    ]);
    expect(getInterviewVoices("vi")).toEqual([
      {
        id: "vn",
        name: "Vietnamese Premium",
        lang: "vi-VN",
        local: true,
        isDefault: false,
        quality: 2,
      },
    ]);
  });

  it("provides stable fallback IDs and avoids duplicate dropdown choices", () => {
    const missingURI = voice("", "Vietnamese Enhanced", "vi-VN");
    setup([missingURI, missingURI]);
    const choices = getInterviewVoices("vi");
    expect(choices).toHaveLength(1);
    expect(choices[0].id).not.toBe("");
    expect(getInterviewVoices("vi")[0].id).toBe(choices[0].id);
  });

  it("loads voices immediately, reacts to voiceschanged and unsubscribes cleanly", () => {
    const synth = setup([]);
    const onVoices = vi.fn();
    const stop = observeInterviewVoices("vi", onVoices);
    expect(onVoices).toHaveBeenCalledExactlyOnceWith([]);
    synth.getVoices.mockReturnValue([
      voice("vn", "An Enhanced", "vi-VN"),
      voice("us", "Alex Enhanced", "en-US"),
    ]);
    synth.dispatchEvent(new Event("voiceschanged"));
    expect(onVoices).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "vn" }),
    ]);
    stop();
    synth.dispatchEvent(new Event("voiceschanged"));
    expect(onVoices).toHaveBeenCalledTimes(2);
  });

  it("uses the selected compatible voice and preserves its regional locale", () => {
    const british = voice("gb", "British Enhanced", "en-GB");
    const synth = setup([voice("us", "American Enhanced", "en-US"), british]);
    const error = vi.fn();
    const end = vi.fn();
    speakInterviewText("Hello", "en", error, "gb", end);
    expect(synth.speak).toHaveBeenCalledWith(
      expect.objectContaining({ voice: british, lang: "en-GB" }),
    );
    const utterance = synth.speak.mock.calls[0][0];
    utterance.onend();
    utterance.onend();
    expect(end).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
  });

  it("falls back only within the chosen language when a selected voice vanished or mismatches", () => {
    const vietnamese = voice("vn", "An Enhanced", "vi-VN");
    const synth = setup([
      vietnamese,
      voice("us", "American Enhanced", "en-US"),
    ]);
    const error = vi.fn();
    speakInterviewText("Xin chào", "vi", error, "us");
    expect(synth.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({ voice: vietnamese, lang: "vi-VN" }),
    );
    expect(error).toHaveBeenLastCalledWith(
      expect.stringMatching(/selected voice.*unavailable/i),
    );
    speakInterviewText("Xin chào", "vi", error, "removed");
    expect(synth.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({ voice: vietnamese }),
    );
    expect(error).toHaveBeenCalledTimes(2);
  });

  it("does not speak in an unrelated language when no compatible voices are installed", () => {
    const synth = setup([voice("us", "American Enhanced", "en-US")]);
    const error = vi.fn();
    const end = vi.fn();
    speakInterviewText("Xin chào", "vi", error, undefined, end);
    expect(synth.speak).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/Vietnamese.*voice|voice.*Vietnamese/i),
    );
    expect(end).toHaveBeenCalledOnce();
  });

  it("handles unavailable browser speech APIs and notifies preview completion", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    expect(getInterviewVoices("en")).toEqual([]);
    const choices = vi.fn();
    const stop = observeInterviewVoices("en", choices);
    expect(choices).toHaveBeenCalledExactlyOnceWith([]);
    expect(stop).toBeTypeOf("function");
    stop();
    const error = vi.fn();
    const end = vi.fn();
    speakInterviewText("Hi", "en", error, undefined, end);
    expect(error).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
  });

  it("finishes cancelled previews without reporting a playback error", () => {
    const synth = setup([voice("us", "American Enhanced", "en-US")]);
    const error = vi.fn();
    const end = vi.fn();
    speakInterviewText("Hi", "en", error, "us", end);
    const utterance = synth.speak.mock.calls[0][0];
    utterance.onerror({ error: "interrupted" });
    utterance.onend();
    expect(error).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledOnce();
  });

  it("completes an explicitly stopped preview even if the browser emits no cancellation event", () => {
    const synth = setup([voice("us", "American Enhanced", "en-US")]);
    const end = vi.fn();
    speakInterviewText("Hi", "en", vi.fn(), "us", end);
    stopInterviewSpeech();
    stopInterviewSpeech();
    const utterance = synth.speak.mock.calls[0][0];
    utterance.onend();
    expect(end).toHaveBeenCalledOnce();
  });

  it("reports synchronous speech failures and completes the preview", () => {
    const synth = setup([voice("us", "American Enhanced", "en-US")]);
    synth.speak.mockImplementation(() => {
      throw new Error("Speech service is down");
    });
    const error = vi.fn();
    const end = vi.fn();
    speakInterviewText("Hi", "en", error, "us", end);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/playback failed/i),
    );
    expect(end).toHaveBeenCalledOnce();
  });

  it("excludes standard, compact and novelty voices even when they claim quality", () => {
    const names = [
      "Albert",
      "Bad News",
      "Bahh",
      "Bells",
      "Boing",
      "Bubbles",
      "Cellos",
      "Deranged",
      "Good News",
      "Hysterical",
      "Pipe Organ",
      "Trinoids",
      "Whisper",
      "Zarvox",
      "Wobble",
      "Junior",
      "Jester",
      "Organ",
      "Superstar",
      "Robot",
      "Robotic",
    ];
    setup([
      ...names.map((name) =>
        voice(
          `com.apple.speech.${name.replaceAll(" ", "")}`,
          `${name} (Natural)`,
          "en-US",
        ),
      ),
      voice(
        "com.apple.voice.compact.en-US.Samantha",
        "Samantha Enhanced",
        "en-US",
      ),
      voice("com.apple.voice.novelty.en-US.Effect", "Effect Premium", "en-US"),
      voice("standard-alex", "Alex", "en-US"),
      voice("standard-samantha", "Samantha", "en-US"),
      voice("standard-linh", "Linh", "vi-VN"),
      voice("genuine", "Ava (Enhanced)", "en-US"),
    ]);
    expect(getInterviewVoices("en").map((item) => item.id)).toEqual([
      "genuine",
      "standard-alex",
      "standard-samantha",
    ]);
    expect(getInterviewVoices("vi").map((item) => item.id)).toEqual([
      "standard-linh",
    ]);
  });

  it("recognizes explicit quality in voice URIs and native neural identifiers", () => {
    setup([
      voice("com.apple.voice.enhanced.en-US.Samantha", "Samantha", "en-US"),
      voice("vi-VN-HoaiMyNeural", "Hoài My", "vi-VN"),
      voice("vi-VN-NamMinhNeural", "Nam Minh", "vi-VN"),
      voice("not-quality", "Unnaturally named", "en-US"),
    ]);
    expect(getInterviewVoices("en").map((item) => item.name)).toEqual([
      "Samantha",
      "Unnaturally named",
    ]);
    expect(getInterviewVoices("vi").map((item) => item.id)).toEqual([
      "vi-VN-HoaiMyNeural",
      "vi-VN-NamMinhNeural",
    ]);
  });

  it("ranks quality tiers and locales, removes lower quality variants and caps choices at ten", () => {
    setup([
      voice("samantha-enhanced", "Samantha (Enhanced)", "en-US"),
      voice("samantha-premium", "Samantha (Premium)", "en-US"),
      voice("samantha-natural", "Samantha (Natural)", "en-US"),
      voice("gb", "British Natural", "en-GB"),
      voice("au", "Australian Natural", "en-AU"),
      voice("vn", "Vietnamese Neural", "vi-VN"),
      ...Array.from({ length: 15 }, (_, index) =>
        voice(
          `voice-${index}`,
          `Quality ${String(index).padStart(2, "0")} Enhanced`,
          "en-US",
        ),
      ),
    ]);
    const choices = getInterviewVoices("en");
    expect(choices).toHaveLength(10);
    expect(choices.slice(0, 3).map((item) => item.id)).toEqual([
      "samantha-natural",
      "gb",
      "au",
    ]);
    expect(
      choices.filter((item) => item.name.startsWith("Samantha")),
    ).toHaveLength(1);
    expect(choices.every((item) => item.lang.startsWith("en"))).toBe(true);
  });

  it("keeps the best candidate when duplicate URIs have different quality metadata", () => {
    setup([
      voice("same-uri", "Samantha Natural", "en-US"),
      voice("same-uri", "Samantha Enhanced", "en-US"),
    ]);
    expect(getInterviewVoices("en")).toHaveLength(1);
    expect(getInterviewVoices("en")[0].name).toBe("Samantha Natural");
  });

  it("plays a saved plain native voice and errors only when no voice exists for the language", () => {
    const plain = voice("legacy", "Samantha", "en-US");
    const natural = voice("new", "Ava Natural", "en-US");
    const synth = setup([plain, natural]);
    const error = vi.fn();
    const end = vi.fn();
    // A saved plain native voice is now valid and plays without an error.
    speakInterviewText("Hello", "en", error, "legacy", end);
    expect(synth.speak).toHaveBeenCalledWith(
      expect.objectContaining({ voice: plain }),
    );
    expect(error).not.toHaveBeenCalled();
    stopInterviewSpeech();
    synth.speak.mockClear();
    // Only error when the language has no installed voice at all.
    synth.getVoices.mockReturnValue([]);
    speakInterviewText("Hello", "en", error, "legacy", end);
    expect(synth.speak).not.toHaveBeenCalled();
    expect(error).toHaveBeenLastCalledWith(
      expect.stringMatching(/No English voice is installed/i),
    );
  });
});
