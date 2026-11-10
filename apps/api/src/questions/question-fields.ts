import { isValidQuestion, type QuestionInput } from '@kb/shared';
import { AppError } from '../common/app-error';
export function questionFields(input: QuestionInput) {
  if (!isValidQuestion(input))
    throw AppError.validation('Invalid question or rubric');
  return {
    type: input.type ?? 'mcq',
    prompt: input.prompt.trim(),
    choiceA: input.type === 'essay' ? null : input.choiceA.trim(),
    choiceB: input.type === 'essay' ? null : input.choiceB.trim(),
    choiceC: input.type === 'essay' ? null : input.choiceC.trim(),
    choiceD: input.type === 'essay' ? null : input.choiceD.trim(),
    correctChoice: input.type === 'essay' ? null : input.correctChoice,
    referenceAnswer:
      input.type === 'essay' ? input.referenceAnswer.trim() : null,
    rubric: input.type === 'essay' ? input.rubric : null,
    explanationMarkdown: input.explanationMarkdown?.trim() || null,
  };
}
export const ESSAY_FORMAT =
  'type="essay", prompt, referenceAnswer (a substantive model answer), rubric (1-10 criteria with unique id, description, positive maxPoints summing to 10). No choiceA/B/C/D or correctChoice.';
