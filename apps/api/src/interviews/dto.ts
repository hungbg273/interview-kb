import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateBy,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  InterviewSetup,
  InterviewLevel,
  InterviewProvider,
  InterviewTurn,
  InterviewDocument,
} from '@kb/shared';
import { OPENAI_INTERVIEW_VOICES } from '@kb/shared';
const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class InterviewDocumentDto implements InterviewDocument {
  @IsIn(['jd', 'cv']) source!: 'jd' | 'cv';
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(30000)
  text!: string;
}
export class InterviewSetupDto implements InterviewSetup {
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['jd', 'cv'])
  source?: 'jd' | 'cv';
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(30000)
  documentText?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename?: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => InterviewDocumentDto)
  documents?: InterviewDocumentDto[];
  @IsIn(['fresher', 'junior', 'middle', 'senior', 'expert'])
  level!: InterviewLevel;
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  topicIds: string[] = [];
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID(undefined, { each: true })
  noteIds: string[] = [];
  @IsIn(['en', 'vi']) lang!: 'en' | 'vi';
  @IsIn(['openai', 'deepseek']) provider!: InterviewProvider;
  @IsInt() @Min(5) @Max(60) durationMinutes!: number;
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @ValidateBy({
    name: 'supportedInterviewVoice',
    validator: {
      validate: (value, args) =>
        (args?.object as InterviewSetupDto | undefined)?.provider !==
          'openai' ||
        (OPENAI_INTERVIEW_VOICES as readonly unknown[]).includes(value),
      defaultMessage: () => 'Choose a supported OpenAI interview voice.',
    },
  })
  voice?: string;
}
export class InterviewVoicePreviewDto {
  @IsIn(OPENAI_INTERVIEW_VOICES) voice!: string;
  @IsIn(['en', 'vi']) lang!: 'en' | 'vi';
}
export class InterviewTurnDto {
  @IsString() @MinLength(1) @MaxLength(160) id!: string;
  @IsString() @MinLength(1) @MaxLength(12000) text!: string;
  @IsString() @MinLength(1) @MaxLength(160) afterTurnId!: string;
}
export class TranscriptTurnDto implements InterviewTurn {
  @IsString() @MinLength(1) @MaxLength(160) id!: string;
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MinLength(1) @MaxLength(12000) text!: string;
}
export class InterviewTranscriptDto {
  @IsArray()
  @ArrayMaxSize(240)
  @ValidateNested({ each: true })
  @Type(() => TranscriptTurnDto)
  turns!: TranscriptTurnDto[];
}
