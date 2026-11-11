"use client";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
const MANAGED_IMAGE =
  /^\/note-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Private bytes use the same authenticated fetch policy as the rest of the API.
 * Only canonical local asset paths receive credentials; ordinary URLs stay ordinary. */
export function MarkdownImage({
  src,
  alt = "",
  title,
}: {
  src?: string;
  alt?: string;
  title?: string;
}) {
  const [state, setState] = useState<{
    src?: string;
    url?: string;
    error?: boolean;
  }>({});
  const [retry, setRetry] = useState(0);
  const managed = !!src && MANAGED_IMAGE.test(src);
  useEffect(() => {
    if (!src || !managed) return;
    const abort = new AbortController();
    let objectUrl: string | undefined;
    setState({ src });
    void fetch(`${API_URL}${src}`, {
      credentials: "include",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Image unavailable");
        const blob = await response.blob();
        if (abort.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ src, url: objectUrl });
      })
      .catch(() => {
        if (!abort.signal.aborted) setState({ src, error: true });
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, managed, retry]);
  if (!src) return null;
  if (!managed)
    return (
      <img
        className="markdown-image"
        src={src}
        alt={alt}
        title={title}
        loading="lazy"
        decoding="async"
      />
    );
  const current = state.src === src ? state : {};
  if (current.url)
    return (
      <img
        className="markdown-image"
        src={current.url}
        alt={alt}
        title={title}
        decoding="async"
      />
    );
  return (
    <span
      className="markdown-image-state"
      role={current.error ? "alert" : "status"}
    >
      {current.error ? (
        <>
          Không tải được ảnh{alt ? `: ${alt}` : ""}.{" "}
          <button
            type="button"
            className="ghost"
            onClick={() => setRetry((v) => v + 1)}
          >
            Tải lại ảnh
          </button>
        </>
      ) : (
        "Đang tải ảnh…"
      )}
    </span>
  );
}
