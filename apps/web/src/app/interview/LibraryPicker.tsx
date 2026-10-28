"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import styles from "./interview.module.css";

export type LibraryChoice = {
  id: string;
  label: string;
  kind: "subject" | "note";
};
export function LibraryPicker({
  selected,
  onChange,
}: {
  selected: LibraryChoice[];
  onChange: (items: LibraryChoice[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LibraryChoice[]>([]);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    setHits([]);
    setError("");
    if (!query.trim()) {
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void api<{
        topics: { id: string; name: string }[];
        notes: { id: string; title: string }[];
      }>(`/search?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted)
            setHits([
              ...result.topics.map((item) => ({
                id: item.id,
                label: item.name,
                kind: "subject" as const,
              })),
              ...result.notes.map((item) => ({
                id: item.id,
                label: item.title,
                kind: "note" as const,
              })),
            ]);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError("Could not search your library. Try again.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const visible = hits.filter(
    (hit) =>
      !selected.some((item) => item.kind === hit.kind && item.id === hit.id),
  );
  return (
    <div className={styles.picker}>
      <label htmlFor="interview-library">Search subjects or notes</label>
      <input
        id="interview-library"
        placeholder="e.g. System design, databases…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />
      {error && <p role="alert">{error}</p>}
      {searching && (
        <p className={styles.hint} role="status">
          Searching your library…
        </p>
      )}
      {visible.length > 0 && (
        <div className={styles.hits} aria-label="Library search results">
          {visible.map((hit) => (
            <button
              key={`${hit.kind}-${hit.id}`}
              type="button"
              aria-label={`Add ${hit.kind} ${hit.label}`}
              onClick={() => onChange([...selected, hit])}
            >
              <span>{hit.label}</span>
              <small>{hit.kind}</small>
              <span aria-hidden="true">＋</span>
            </button>
          ))}
        </div>
      )}
      {query.trim() && !searching && !error && hits.length === 0 && (
        <p className={styles.hint}>No matching subjects or notes.</p>
      )}
      {selected.length > 0 && (
        <ul className={styles.chips} aria-label="Selected practice materials">
          {selected.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <span>
                <small>{item.kind}</small> {item.label}
              </span>
              <button
                type="button"
                className="ghost"
                aria-label={`Remove ${item.label}`}
                onClick={() =>
                  onChange(selected.filter((value) => value !== item))
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.hint}>
        Subjects include their linked notes. Duplicate notes are included once.
      </p>
    </div>
  );
}
