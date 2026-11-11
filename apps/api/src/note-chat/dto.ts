import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { AiProvider } from '@kb/shared';
export class ChatRevisionDto {
  @IsInt() @Min(0) revision: number;
}
export class SendNoteChatDto extends ChatRevisionDto {
  @IsString() @MinLength(1) @MaxLength(2000) message: string;
  @IsIn(['chatgpt', 'openai', 'deepseek']) provider: AiProvider;
  @IsUUID() requestId: string;
}
