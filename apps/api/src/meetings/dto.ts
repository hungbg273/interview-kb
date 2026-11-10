import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  MinLength,
  IsObject,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { MeetingContext, MeetingSetup } from '@kb/shared';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class MeetingContextDto implements MeetingContext {
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  personal?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  project?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  participants?: string;
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  meeting?: string;
}
export class MeetingSetupDto implements MeetingSetup {
  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['audio', 'captions'])
  inputMode?: 'audio' | 'captions';
  @IsIn(['openai', 'deepseek']) provider!: 'openai' | 'deepseek';
  @IsIn(['en', 'vi']) sourceLang!: 'en' | 'vi';
  @IsIn(['en', 'vi']) targetLang!: 'en' | 'vi';
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => MeetingContextDto)
  context!: MeetingContextDto;
}
export class MeetingAudioDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(1599) sequence!: number;
}
export class MeetingSuggestionDto {
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  draft?: string;
}

export class MeetingCaptionDto extends MeetingAudioDto {
  @IsString() @MinLength(1) @MaxLength(100) utteranceId!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(4000) text!: string;
  @ValidateIf((_o, v) => v !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  speaker?: string;
}
