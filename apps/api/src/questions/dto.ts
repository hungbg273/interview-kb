import type { AiLang, CorrectChoice } from '@kb/shared';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceA!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceB!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceC!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceD!: string;

  @IsEnum(['A', 'B', 'C', 'D'])
  correctChoice!: CorrectChoice;

  @IsOptional()
  @IsString()
  explanationMarkdown?: string;

  @IsIn(['en', 'vi'])
  lang!: AiLang;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceA?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceB?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceC?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceD?: string;

  @IsOptional()
  @IsEnum(['A', 'B', 'C', 'D'])
  correctChoice?: CorrectChoice;

  @IsOptional()
  @IsString()
  explanationMarkdown?: string | null;

  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: AiLang;
}
