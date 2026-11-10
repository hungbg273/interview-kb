import type { AiLang, CorrectChoice } from '@kb/shared';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  IsArray,
} from 'class-validator';

export class CreateQuestionDto {
  @IsOptional()
  @IsIn(['mcq', 'essay'])
  type?: 'mcq' | 'essay';
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  referenceAnswer?: string;
  @IsOptional()
  @IsArray()
  rubric?: import('@kb/shared').RubricCriterion[];

  @IsString()
  @MinLength(1)
  prompt!: string;

  @ValidateIf((o) => o.type !== 'essay')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceA!: string;

  @ValidateIf((o) => o.type !== 'essay')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceB!: string;

  @ValidateIf((o) => o.type !== 'essay')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceC!: string;

  @ValidateIf((o) => o.type !== 'essay')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceD!: string;

  @ValidateIf((o) => o.type !== 'essay')
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
  @IsIn(['mcq', 'essay'])
  type?: 'mcq' | 'essay';
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  referenceAnswer?: string;
  @IsOptional()
  @IsArray()
  rubric?: import('@kb/shared').RubricCriterion[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;

  @IsOptional()
  @ValidateIf((o) => o.type !== 'essay')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceA?: string;

  @IsOptional()
  @ValidateIf((o) => o.type !== 'essay')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceB?: string;

  @IsOptional()
  @ValidateIf((o) => o.type !== 'essay')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceC?: string;

  @IsOptional()
  @ValidateIf((o) => o.type !== 'essay')
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceD?: string;

  @IsOptional()
  @ValidateIf((o) => o.type !== 'essay')
  @IsEnum(['A', 'B', 'C', 'D'])
  correctChoice?: CorrectChoice;

  @IsOptional()
  @IsString()
  explanationMarkdown?: string | null;

  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: AiLang;
}
