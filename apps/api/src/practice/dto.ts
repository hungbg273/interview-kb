import type { AiLang, CorrectChoice } from '@kb/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

function asIdList({ value }: { value: unknown }): string[] | undefined {
  if (value == null || value === '') return undefined;
  return (Array.isArray(value) ? value : [value]).map(String);
}

export class PracticeQuestionsQuery {
  @IsOptional()
  @Transform(asIdList)
  @IsUUID(undefined, { each: true })
  noteId?: string | string[];

  @IsOptional()
  @Transform(asIdList)
  @IsUUID(undefined, { each: true })
  topicId?: string | string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsIn(['en', 'vi'])
  lang!: AiLang;
}

export class GradeAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsEnum(['A', 'B', 'C', 'D'])
  choice!: CorrectChoice;
}

export class GradePracticeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GradeAnswerDto)
  answers!: GradeAnswerDto[];
}

export class StartImportDto {
  @IsIn(['cv', 'jd'])
  source!: 'cv' | 'jd';

  @IsIn(['en', 'vi'])
  lang!: AiLang;

  @IsIn(['fresher', 'junior', 'middle', 'senior', 'expert'])
  level!: 'fresher' | 'junior' | 'middle' | 'senior' | 'expert';
}

export class KeepImportItemDto {
  @IsString()
  questionId!: string;

  @IsString()
  noteId!: string;

  @IsArray()
  @IsString({ each: true })
  topicNames!: string[];
}

export class KeepImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeepImportItemDto)
  keeps!: KeepImportItemDto[];
}

export class ImportGradeAnswerDto {
  @IsString()
  questionId!: string;

  @IsEnum(['A', 'B', 'C', 'D'])
  choice!: CorrectChoice;
}

export class ImportGradeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportGradeAnswerDto)
  answers!: ImportGradeAnswerDto[];
}

