"use client";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type RefObject,
} from "react";
import { api } from "@/lib/api";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);
const IMAGE_URL =
  /^\/note-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useClipboardImages(
  value: string,
  onChange: (value: string) => void,
  disabled: boolean | undefined,
  textarea: RefObject<HTMLTextAreaElement | null>,
  onBusyChange?: (busy: boolean) => void,
) {
  const [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const latest = useRef({ value, onChange, disabled, onBusyChange });
  latest.current = { value, onChange, disabled, onBusyChange };
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      latest.current.onBusyChange?.(false);
    },
    [],
  );
  function update(next: string) {
    latest.current.value = next;
    latest.current.onChange(next);
  }
  function replace(marker: string, replacement: string) {
    const current = latest.current.value,
      index = current.indexOf(marker);
    if (index < 0) return; // User deleted/edited it or switched documents; never resurrect it.
    const field = textarea.current;
    const focused = field && document.activeElement === field;
    const start = field?.selectionStart ?? 0,
      end = field?.selectionEnd ?? 0;
    const shift = (position: number) =>
      position <= index
        ? position
        : position >= index + marker.length
          ? position + replacement.length - marker.length
          : index + replacement.length;
    update(
      current.slice(0, index) +
        replacement +
        current.slice(index + marker.length),
    );
    if (focused)
      requestAnimationFrame(() => {
        if (document.activeElement === field)
          field.setSelectionRange(shift(start), shift(end));
      });
  }
  async function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (latest.current.disabled) return;
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (!files.length) return; // Keep ordinary text paste native.
    event.preventDefault();
    if (controller.current) {
      setError("Hãy chờ các ảnh hiện tại tải xong rồi dán tiếp.");
      return;
    }
    setError("");
    if (files.some((file) => !ALLOWED.has(file.type))) {
      setError("Chỉ hỗ trợ ảnh PNG, JPEG và WebP.");
      return;
    }
    if (files.some((file) => file.size > MAX_BYTES || file.size === 0)) {
      setError("Mỗi ảnh phải có dung lượng từ 1 byte đến 5 MB.");
      return;
    }
    const field = event.currentTarget,
      start = field.selectionStart,
      end = field.selectionEnd;
    const selected = latest.current.value.slice(start, end);
    const marker = `[Đang tải ảnh…](#image-upload-${crypto.randomUUID()})`;
    const block = `\n\n${marker}\n\n`;
    const abort = new AbortController();
    controller.current = abort;
    setUploading(true);
    latest.current.onBusyChange?.(true);
    update(
      latest.current.value.slice(0, start) +
        block +
        latest.current.value.slice(end),
    );
    requestAnimationFrame(() => {
      if (document.activeElement === field)
        field.setSelectionRange(start + block.length, start + block.length);
    });
    try {
      const results: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const result = await api<{ url: string }>("/note-images", {
          method: "POST",
          body: form,
          signal: abort.signal,
        });
        if (!IMAGE_URL.test(result.url))
          throw new Error("Máy chủ trả về đường dẫn ảnh không hợp lệ.");
        results.push(`![Ảnh dán](${result.url})`);
      }
      if (!abort.signal.aborted) replace(marker, results.join("\n\n"));
    } catch (cause) {
      if (!abort.signal.aborted) {
        replace(
          latest.current.value.includes(block) ? block : marker,
          selected,
        );
        setError(
          cause instanceof Error
            ? cause.message
            : "Không tải được ảnh. Hãy thử dán lại.",
        );
      }
    } finally {
      if (!abort.signal.aborted) {
        setUploading(false);
        latest.current.onBusyChange?.(false);
      }
      if (controller.current === abort) controller.current = null;
    }
  }
  return { onPaste, uploading, error };
}
