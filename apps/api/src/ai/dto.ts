import type { AiAction, AiDifficulty, AiLang, AiProvider } from '@kb/shared';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RunAiDto {
  @IsIn([
    'summarize',
    'expand',
    'generate-questions',
    'generate-content',
    'translate-note',
  ])
  action!: AiAction;

  @IsIn(['openai', 'deepseek'])
  provider!: AiProvider;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  count?: number;

  @IsOptional()
  @IsIn(['en', 'vi'])
  targetLang?: AiLang;

  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: AiDifficulty;
}
