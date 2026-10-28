import { IsIn, IsString, IsUrl, MaxLength } from 'class-validator';

export class VideoJobDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  videoUrl!: string;

  @IsIn(['en', 'vi'])
  lang!: 'en' | 'vi';

  @IsIn(['openai', 'deepseek'])
  provider!: 'openai' | 'deepseek';
}
