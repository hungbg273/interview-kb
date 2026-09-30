import { IsString, MinLength } from 'class-validator';

export class SearchQuery {
  @IsString()
  @MinLength(1)
  q!: string;
}
