import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(100000)
  bodyMarkdown!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  topicIds?: string[];
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  bodyMarkdown?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  topicIds?: string[];
}

export class ListNotesQuery {
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  uncategorized?: boolean;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;
}

export class ReplaceTopicsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  topicIds!: string[];
}
