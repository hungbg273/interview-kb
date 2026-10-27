import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AppError } from '../common/app-error';
import {
  GradePracticeDto,
  ImportGradeDto,
  KeepImportDto,
  PracticeQuestionsQuery,
  StartImportDto,
} from './dto';
import { PracticeImportService } from './practice-import.service';
import { PracticeService } from './practice.service';

@ApiTags('practice')
@ApiCookieAuth('kb_access_token')
@Controller('practice')
export class PracticeController {
  constructor(
    private readonly practice: PracticeService,
    private readonly imports: PracticeImportService,
  ) {}

  @Get('questions')
  list(@Query() query: PracticeQuestionsQuery) {
    return this.practice.listQuestions(query);
  }

  @Post('grade')
  @HttpCode(200)
  grade(@Body() dto: GradePracticeDto) {
    return this.practice.grade(dto);
  }

  @Post('imports')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  startImport(@UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer } | undefined, @Body() body: StartImportDto, @Req() req: {user:{email:string}}) {
    if (!file) throw AppError.validation('Upload a PDF or DOCX file');
    return this.imports.start({
      owner: req.user.email,
      source: body.source,
      lang: body.lang,
      level: body.level,
      filename: file.originalname,
      mime: file.mimetype,
      buffer: file.buffer,
    });
  }

  @Patch('imports/:draftId')
  keepImport(@Param('draftId') draftId: string, @Body() dto: KeepImportDto) {
    return this.imports.keep(draftId, dto);
  }

  @Post('imports/:draftId/grade')
  @HttpCode(200)
  gradeImport(@Param('draftId') draftId: string, @Body() dto: ImportGradeDto) {
    return this.imports.grade(draftId, dto);
  }
}
