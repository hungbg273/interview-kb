"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AiJobView, AiProvider } from "@kb/shared";
import { api, API_URL, ApiError } from "@/lib/api";
import { activeJob, mergeJobs, jobStatusLabel } from "@/lib/ai-jobs";
import type { AiRunPayload } from "./AiPanel";
import { AiJobPreviewModal } from "./AiJobPreviewModal";
import { useHasUnsavedChanges } from "./WorkspaceNavigation";
import { useRefreshNotes } from "./NotesProvider";
import { WorkspaceLink } from "./WorkspaceNavigation";

type Submission = AiRunPayload & { provider: AiProvider };
type JobsContext = {
  jobs: AiJobView[];
  selectedJobId: string | null;
  selectionVersion: number;
  selectJob: (id: string) => void;
  openPreview: (job: AiJobView) => void;
  submit: (noteId: string, payload: Submission) => Promise<AiJobView>;
  retry: (jobId: string) => Promise<AiJobView>;
  submitImport: (body: FormData) => Promise<AiJobView>;
};
const unavailable = async (): Promise<AiJobView> => {
  throw new Error("Chưa khởi tạo danh sách yêu cầu AI.");
};
const Context = createContext<JobsContext>({
  jobs: [],
  selectedJobId: null,
  selectionVersion: 0,
  selectJob: () => {},
  openPreview: () => {},
  submit: unavailable,
  retry: unavailable,
  submitImport: unavailable,
});
export const useAiJobs = () => useContext(Context);
export function AiJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<AiJobView[]>([]),
    [selectedJobId, selectJob] = useState<string | null>(null),
    [notices, setNotices] = useState<AiJobView[]>([]);
  const [previewJob, setPreviewJob] = useState<AiJobView | null>(null);
  const hasUnsavedChanges = useHasUnsavedChanges();
  const refreshNotes = useRefreshNotes();
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [trackingError, setTrackingError] = useState("");
  const chooseJob = (id: string) => {
    selectJob(id);
    setSelectionVersion((value) => value + 1);
  };
  const latest = useRef<AiJobView[]>([]),
    hydrated = useRef(false),
    pendingKeys = useRef(new Map<string, string>());
  const merge = useCallback((items: AiJobView[], notify = true) => {
    if (!Array.isArray(items)) return;
    if (notify && hydrated.current) {
      const finished = items.filter((item) => {
        const old = latest.current.find((j) => j.id === item.id);
        return (
          old &&
          activeJob(old) &&
          !activeJob(item) &&
          item.revision > old.revision
        );
      });
      if (finished.length)
        setNotices((old) =>
          [
            ...old.filter(
              (item) => !finished.some((next) => next.id === item.id),
            ),
            ...finished,
          ].slice(-3),
        );
    }
    latest.current = mergeJobs(latest.current, items);
    setJobs(latest.current);
  }, []);
  useEffect(() => {
    let unauthorized = false;
    let alive = true,
      connected = false,
      delay = 3000,
      busy = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const sync = async () => {
      if (unauthorized || busy || !alive || document.hidden) return;
      busy = true;
      try {
        const items = await api<AiJobView[]>("/ai-jobs", {
          signal: abort.signal,
        });
        if (alive) {
          merge(items, hydrated.current);
          hydrated.current = true;
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          source?.close();
          unauthorized = true;
          setTrackingError(
            "Phiên đăng nhập đã hết hạn. Đăng nhập lại để theo dõi kết quả AI.",
          );
          connected = false;
        }
      } finally {
        busy = false;
      }
    };
    const source =
      typeof EventSource !== "undefined"
        ? new EventSource(API_URL + "/ai-jobs/events", {
            withCredentials: true,
          })
        : null;
    const schedule = () => {
      if (unauthorized) return;
      poll = setTimeout(
        async () => {
          await sync();
          delay = connected ? 30000 : Math.min(15000, Math.round(delay * 1.5));
          if (alive) schedule();
        },
        delay + Math.random() * 500,
      );
    };
    if (source) {
      source.onopen = () => {
        connected = true;
        delay = 30000;
        void sync();
      };
      source.onerror = () => {
        connected = false;
        delay = 3000;
        if (poll) clearTimeout(poll);
        schedule();
      };
      source.addEventListener("job.updated", (event) => {
        try {
          if (alive) merge([JSON.parse((event as MessageEvent).data)]);
        } catch {
          void sync();
        }
      });
    }
    const focus = () => void sync();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const selected = new URLSearchParams(window.location.search).get("aiJob");
    if (selected) selectJob(selected);
    void sync();
    schedule();
    return () => {
      alive = false;
      abort.abort();
      source?.close();
      if (poll) clearTimeout(poll);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [merge]);
  const send = async (path: string, payload?: Submission, form?: FormData) => {
    const identity =
      path +
      JSON.stringify(
        form
          ? [...form.entries()].map(([name, value]) => [
              name,
              typeof value === "string"
                ? value
                : [value.name, value.size, value.lastModified],
            ])
          : (payload ?? {}),
      );
    let key = pendingKeys.current.get(identity);
    if (!key) {
      key = crypto.randomUUID();
      pendingKeys.current.set(identity, key);
    }
    const job = await api<AiJobView>(path, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      ...(form
        ? { body: form }
        : payload
          ? { body: JSON.stringify(payload) }
          : {}),
    });
    pendingKeys.current.delete(identity);
    merge([job], false);
    chooseJob(job.id);
    return job;
  };
  return (
    <Context.Provider
      value={{
        jobs,
        selectedJobId,
        selectionVersion,
        selectJob: chooseJob,
        openPreview: setPreviewJob,
        submit: (id, payload) => send(`/notes/${id}/ai-jobs`, payload),
        retry: (id) => send(`/ai-jobs/${id}/retry`),
        submitImport: (form) => send("/practice/import-jobs", undefined, form),
      }}
    >
      {children}
      {previewJob && (
        <AiJobPreviewModal
          key={previewJob.id}
          job={jobs.find((job) => job.id === previewJob.id) ?? previewJob}
          onClose={() => setPreviewJob(null)}
          onApply={async () => {
            if (hasUnsavedChanges())
              throw new Error(
                "Bạn đang có thay đổi chưa lưu. Hãy lưu hoặc bỏ thay đổi trước khi áp dụng kết quả AI.",
              );
            await api(`/ai-jobs/${previewJob.id}/apply`, { method: "POST" });
            window.dispatchEvent(
              new CustomEvent("ai-note-applied", {
                detail: { noteId: previewJob.noteId },
              }),
            );
            await refreshNotes();
          }}
        />
      )}
      {trackingError && (
        <div className="ai-session-warning" role="alert">
          {trackingError}{" "}
          <WorkspaceLink href="/login">Đăng nhập lại</WorkspaceLink>
        </div>
      )}
      {jobs.length > 0 && (
        <details className="ai-job-tray">
          <summary>AI · {jobs.filter(activeJob).length} đang xử lý</summary>
          <div className="ai-job-history">
            <strong>Yêu cầu AI gần đây</strong>
            {jobs.slice(0, 10).map((job) => (
              <button
                type="button"
                className="ai-job-history-item"
                aria-label={`${job.noteTitle} · ${jobStatusLabel[job.status]}`}
                key={job.id}
                onClick={() => setPreviewJob(job)}
              >
                <span>{job.noteTitle}</span>
                <small>{jobStatusLabel[job.status]}</small>
              </button>
            ))}
          </div>
        </details>
      )}
      <div className="ai-job-notifications" aria-live="polite">
        {notices.map((job) => (
          <div key={job.id} className="ai-job-notice">
            <p>
              {job.status === "succeeded"
                ? "AI đã xử lý xong"
                : "Yêu cầu AI chưa hoàn tất"}
              : <strong>{job.noteTitle}</strong>
            </p>
            <button type="button" onClick={() => setPreviewJob(job)}>
              Mở kết quả
            </button>
            <button
              type="button"
              className="ghost ai-job-notice-close"
              aria-label={`Đóng thông báo ${job.noteTitle}`}
              onClick={() =>
                setNotices((items) =>
                  items.filter((item) => item.id !== job.id),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Context.Provider>
  );
}
