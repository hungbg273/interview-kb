import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { api, observe, speak, stop, pause, play } = vi.hoisted(() => ({
  api: vi.fn(),
  observe: vi.fn(),
  speak: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  play: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api }));
vi.mock("@/lib/interview-voice", () => ({
  observeInterviewVoices: observe,
  speakInterviewText: speak,
  stopInterviewSpeech: stop,
}));
import { VoicePicker } from "./VoicePicker";

const voices = [
  {
    id: "voice-uk",
    name: "English UK Natural",
    lang: "en-GB",
    local: true,
    isDefault: false,
  },
  {
    id: "voice-vi",
    name: "Vietnamese Natural",
    lang: "vi-VN",
    local: true,
    isDefault: false,
  },
];
let audio: {
  src: string;
  onended?: () => void;
  onerror?: () => void;
  pause: typeof pause;
  play: typeof play;
};
beforeEach(() => {
  observe.mockImplementation((lang, callback) => {
    callback(voices.filter((v) => v.lang.startsWith(lang)));
    return vi.fn();
  });
  play.mockResolvedValue(undefined);
  vi.stubGlobal(
    "Audio",
    vi.fn(function (src: string) {
      audio = { src, pause, play };
      return audio;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("keeps only the two provider-recommended OpenAI voices", () => {
  render(
    <VoicePicker
      provider="openai"
      lang="en"
      value="marin"
      onChange={vi.fn()}
    />,
  );
  expect(
    screen
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value),
  ).toEqual(["marin", "cedar"]);
});

it("caps selectable browser voices at ten and explains when quality voices are absent", () => {
  observe.mockImplementation((_lang, callback) => {
    callback(
      Array.from({ length: 15 }, (_, i) => ({
        ...voices[0],
        id: `quality-${i}`,
        name: `Natural voice ${i}`,
      })),
    );
    return vi.fn();
  });
  const { unmount } = render(
    <VoicePicker provider="deepseek" lang="en" value="" onChange={vi.fn()} />,
  );
  expect(
    screen
      .getAllByRole("option")
      .filter((option) => (option as HTMLOptionElement).value),
  ).toHaveLength(10);
  unmount();
  observe.mockImplementation((_lang, callback) => {
    callback([]);
    return vi.fn();
  });
  render(
    <VoicePicker provider="deepseek" lang="vi" value="" onChange={vi.fn()} />,
  );
  expect(
    screen.getByText(/No high-quality Vietnamese voice is available/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Preview voice" })).toBeDisabled();
});

it("lets the user choose and preview a language-matching browser voice", () => {
  const choose = vi.fn();
  const { rerender } = render(
    <VoicePicker provider="deepseek" lang="en" value="" onChange={choose} />,
  );
  fireEvent.change(screen.getByLabelText("Interviewer voice"), {
    target: { value: "voice-uk" },
  });
  expect(choose).toHaveBeenCalledWith("voice-uk", "English UK Natural (en-GB)");
  rerender(
    <VoicePicker
      provider="deepseek"
      lang="en"
      value="voice-uk"
      onChange={choose}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview voice" }));
  expect(speak).toHaveBeenCalledWith(
    expect.any(String),
    "en",
    expect.any(Function),
    "voice-uk",
    expect.any(Function),
  );
  fireEvent.click(screen.getByRole("button", { name: "Stop preview" }));
  expect(stop).toHaveBeenCalled();
});

it("updates after voices load and shows only Vietnamese for Vietnamese interviews", async () => {
  let changed: (items: typeof voices) => void = () => {};
  const unsubscribe = vi.fn();
  observe.mockImplementation((_lang, callback) => {
    changed = callback;
    callback([]);
    return unsubscribe;
  });
  const { unmount } = render(
    <VoicePicker provider="deepseek" lang="vi" value="" onChange={vi.fn()} />,
  );
  expect(screen.getByRole("button", { name: "Preview voice" })).toBeDisabled();
  await act(async () => changed([voices[1]]));
  expect(
    screen.getByRole("option", { name: "Vietnamese Natural (vi-VN)" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: /English UK/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Preview voice" })).toBeEnabled();
  unmount();
  expect(unsubscribe).toHaveBeenCalled();
});

it("previews the selected OpenAI voice in Vietnamese with a clear credit label", async () => {
  api.mockResolvedValue({ audio: "YWJj", mime: "audio/mpeg" });
  render(
    <VoicePicker
      provider="openai"
      lang="vi"
      value="cedar"
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByText(/uses OpenAI API credits/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Preview voice" }));
  await waitFor(() => expect(play).toHaveBeenCalledOnce());
  expect(api).toHaveBeenCalledWith(
    "/interviews/voice-preview",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ voice: "cedar", lang: "vi" }),
    }),
  );
  expect(audio.src).toBe("data:audio/mpeg;base64,YWJj");
  await act(async () => audio.onended?.());
  expect(screen.getByRole("button", { name: "Preview voice" })).toBeEnabled();
});

it("shows billing errors without playing a fake browser replacement", async () => {
  api.mockRejectedValue(
    new Error("Add OpenAI API credits to preview this voice."),
  );
  render(
    <VoicePicker
      provider="openai"
      lang="en"
      value="marin"
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview voice" }));
  expect(
    await screen.findByText("Add OpenAI API credits to preview this voice."),
  ).toBeInTheDocument();
  expect(play).not.toHaveBeenCalled();
  expect(speak).not.toHaveBeenCalled();
});

it("cancels pending preview when language changes and ignores its late response", async () => {
  let resolve!: (value: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { rerender } = render(
    <VoicePicker
      provider="openai"
      lang="en"
      value="marin"
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview voice" }));
  const signal = api.mock.calls[0][1].signal;
  rerender(
    <VoicePicker
      provider="openai"
      lang="vi"
      value="marin"
      onChange={vi.fn()}
    />,
  );
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ audio: "YWJj", mime: "audio/mpeg" }));
  expect(play).not.toHaveBeenCalled();
});

it("keeps the Stop control when an unavailable browser voice falls back with a warning", () => {
  speak.mockImplementationOnce((_text, _lang, onError) =>
    onError("Selected voice unavailable; using a matching voice."),
  );
  render(
    <VoicePicker
      provider="deepseek"
      lang="en"
      value="removed-voice"
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Preview voice" }));
  expect(screen.getByRole("button", { name: "Stop preview" })).toBeEnabled();
  expect(
    screen.getByText("Selected voice unavailable; using a matching voice."),
  ).toBeInTheDocument();
});
