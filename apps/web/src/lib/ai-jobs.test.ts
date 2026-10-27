import { expect, test } from "vitest";
import type { AiJobView } from "@kb/shared";
import { mergeJobs, activeJob } from "./ai-jobs";
test("duplicate or reordered events never roll completed jobs back to running", () => {
  const completed = {
    id: "a",
    revision: 3,
    status: "succeeded",
    createdAt: "2026-10-27",
  } as AiJobView;
  const running = { ...completed, revision: 2, status: "running" } as AiJobView;
  const result = mergeJobs([completed], [running, completed]);
  expect(result).toEqual([completed]);
  expect(activeJob(result[0])).toBe(false);
});
