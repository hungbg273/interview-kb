import type { AiJobView } from "@kb/shared";
export const activeJob = (job: AiJobView) =>
  ["queued", "running", "retrying"].includes(job.status);
export function mergeJobs(current: AiJobView[], incoming: AiJobView[]) {
  const map = new Map(current.map((job) => [job.id, job]));
  for (const job of incoming) {
    const old = map.get(job.id);
    if (!old || job.revision > old.revision) map.set(job.id, job);
  }
  return [...map.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}
export const jobStatusLabel = {
  queued: "Đang chờ xử lý",
  running: "AI đang xử lý",
  retrying: "Đang chờ thử lại",
  succeeded: "Đã hoàn tất",
  failed: "Không hoàn tất",
};
