import type {
  GradeResult,
  PracticeAnswer,
  PracticeAttemptView,
  QuestionInput,
} from '@kb/shared';
import { AppError } from '../common/app-error';
import type { PracticeAttempt } from '../entities/practice-attempt.entity';
import type { PracticeAttemptQuestion } from '../entities/practice-attempt-question.entity';
export function applyAnswer(
  item: PracticeAttemptQuestion,
  answer: PracticeAnswer,
  revision: number,
) {
  if (['graded', 'grading'].includes(item.state))
    throw AppError.conflict('Câu trả lời đã khóa hoặc đang chấm.');
  if (revision !== item.revision)
    throw AppError.conflict('Câu trả lời đã thay đổi. Hãy tải lại bài.');
  const type = item.snapshot.type ?? 'mcq';
  if (!answer || answer.type !== type)
    throw AppError.validation('Sai loại câu trả lời.');
  if (answer.type === 'essay') {
    if (
      typeof answer.text !== 'string' ||
      !answer.text.trim() ||
      answer.text.length > 10000
    )
      throw AppError.validation('Câu trả lời cần 1–10.000 ký tự.');
    item.answer = { type: 'essay', text: answer.text.trim() };
  } else {
    if (!['A', 'B', 'C', 'D'].includes(answer.choice))
      throw AppError.validation('Đáp án phải là A–D.');
    item.answer = { type: 'mcq', choice: answer.choice };
  }
  item.revision++;
  item.state = 'answered';
  item.result = null;
}
export function gradeMcq(
  q: QuestionInput,
  answer: PracticeAnswer,
): GradeResult {
  if (q.type === 'essay' || answer.type !== 'mcq')
    throw AppError.validation('Expected MCQ');
  return {
    score: q.correctChoice === answer.choice ? 10 : 0,
    criteria: [],
    strengths: [],
    gaps: [],
    improvements: [],
    correctChoice: q.correctChoice,
    explanationMarkdown: q.explanationMarkdown,
  };
}
export function validateGrade(q: QuestionInput, raw: unknown): GradeResult {
  const fail = () => {
    throw AppError.aiUpstream('Kết quả chấm không hợp lệ. Vui lòng thử lại.');
  };
  if (q.type !== 'essay' || !raw || typeof raw !== 'object') return fail();
  const value = raw as Record<string, unknown>;
  if (
    !Array.isArray(value.criteria) ||
    value.criteria.length !== q.rubric.length
  )
    return fail();
  const ids = new Set<string>();
  let score = 0;
  const criteria = value.criteria.map((c) => {
    const r = q.rubric.find((r) => r.id === c?.criterionId);
    if (
      !r ||
      ids.has(r.id) ||
      typeof c.points !== 'number' ||
      !Number.isFinite(c.points) ||
      c.points < 0 ||
      c.points > r.maxPoints ||
      typeof c.explanation !== 'string' ||
      !c.explanation.trim() ||
      c.explanation.length > 3000
    )
      return fail();
    ids.add(r.id);
    score += c.points;
    return { criterionId: r.id, points: c.points, explanation: c.explanation };
  });
  const list = (key: string): string[] => {
    const v = value[key];
    if (
      !Array.isArray(v) ||
      v.length > 20 ||
      v.some((s) => typeof s !== 'string' || !s.trim() || s.length > 3000)
    )
      return fail();
    return v;
  };
  return {
    score,
    criteria,
    strengths: list('strengths'),
    gaps: list('gaps'),
    improvements: list('improvements'),
    referenceAnswer: q.referenceAnswer,
  };
}
export function settleAttempt(attempt: PracticeAttempt) {
  if (attempt.status === 'in_progress') return;
  if (attempt.items.every((i) => i.state === 'graded'))
    attempt.status = 'completed';
  else if (
    attempt.items.some((i) => i.state === 'grading' || i.state === 'answered')
  )
    attempt.status = 'submitting';
  else attempt.status = 'grading_failed';
}
export function publicAttempt(a: PracticeAttempt): PracticeAttemptView {
  return {
    id: a.id,
    status: a.status,
    provider: a.provider,
    total: a.items.length,
    correct: a.items.filter(
      (i) => i.snapshot.type !== 'essay' && i.result?.score === 10,
    ).length,
    score:
      a.status === 'completed'
        ? a.items.reduce((n, i) => n + (i.result?.score ?? 0), 0) /
          a.items.length
        : null,
    items: a.items.map((i) => ({
      id: i.id,
      type: i.snapshot.type ?? 'mcq',
      prompt: i.snapshot.prompt,
      ...(i.snapshot.type !== 'essay'
        ? {
            choiceA: i.snapshot.choiceA,
            choiceB: i.snapshot.choiceB,
            choiceC: i.snapshot.choiceC,
            choiceD: i.snapshot.choiceD,
          }
        : {}),
      answer: i.answer,
      revision: i.revision,
      state: i.state,
      result: i.state === 'graded' ? i.result : null,
    })),
  };
}
