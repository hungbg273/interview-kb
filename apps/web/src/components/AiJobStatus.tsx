"use client";
import { useState } from "react";
import type { AiJobView } from "@kb/shared";
import { jobStatusLabel, activeJob } from "@/lib/ai-jobs";
import { useAiJobs } from "./AiJobsProvider";
export function AiJobStatus({
  job,
  onResult,
}: {
  job: AiJobView;
  onResult: () => Promise<void>;
}) {
  const { retry } = useAiJobs();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ai-job-status" role="status">
      <strong>{jobStatusLabel[job.status]}</strong>
      {activeJob(job) && (
        <p>
          {job.status === "queued"
            ? "Bạn có thể tiếp tục chỉnh sửa hoặc chuyển trang. Kết quả sẽ được thông báo khi hoàn tất."
            : job.stage === "saving"
              ? "Đang lưu kết quả…"
              : "Yêu cầu đang chạy nền, bạn không cần đợi ở trang này."}
        </p>
      )}
      {job.error && <p className="error">{job.error.message}</p>}
      {job.status === "succeeded" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(onResult)}
        >
          {busy ? "Đang tải…" : "Xem kết quả"}
        </button>
      )}
      {job.status === "failed" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(() => retry(job.id))}
        >
          Tạo yêu cầu mới
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
