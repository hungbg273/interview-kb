import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Interview Knowledge Base API')
    .setDescription(
      'REST API for interview-prep notes, topics, tags, and ABCD questions. Auth is an httpOnly cookie `kb_access_token`.',
    )
    .setVersion('0.1.0')
    .addCookieAuth('kb_access_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    yamlDocumentUrl: 'docs-yaml',
  });
}
