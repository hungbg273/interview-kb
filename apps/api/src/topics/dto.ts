import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTopicDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  parentIds?: string[];
}

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

export class AddParentDto {
  @IsUUID()
  parentId!: string;
}

export class ListTopicsQuery {
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
