import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ArrayMaxSize,
} from 'class-validator';
import type { AiProvider, PracticeAnswer } from '@kb/shared';
export class CreateAttemptDto {
  @IsUUID() requestKey!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  noteIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  topicIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  draftIds?: string[];
  @Type(() => Number) @IsInt() @Min(0) @Max(50) mcqCount!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(50) essayCount!: number;
  @IsIn(['en', 'vi']) lang!: 'en' | 'vi';
  @IsOptional() @IsIn(['openai', 'deepseek', 'chatgpt']) provider?: AiProvider;
}
export class SavePracticeAnswerDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsObject() answer!: PracticeAnswer;
}
