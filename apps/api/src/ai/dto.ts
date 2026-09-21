import type { AiAction, AiProvider } from '@kb/shared';
import { IsIn } from 'class-validator';

export class RunAiDto {
  @IsIn(['summarize', 'expand', 'generate-questions'])
  action!: AiAction;

  @IsIn(['openai', 'deepseek'])
  provider!: AiProvider;
}
