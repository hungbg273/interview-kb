import 'reflect-metadata';
import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from './configure-app';
import { InterviewTranscriptDto } from './interviews/dto';

@Controller()
class ParserProbeController {
  @Post('interviews/probe')
  interview(@Body() body: InterviewTranscriptDto) {
    return {
      turns: body.turns.length,
      characters: body.turns.reduce((n, turn) => n + turn.text.length, 0),
    };
  }
  @Post('ordinary-probe')
  ordinary(@Body() body: { text: string }) {
    return { characters: body.text.length };
  }
}

describe('configureApp interview body limits', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ParserProbeController],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('accepts bounded multilingual transcript snapshots larger than the ordinary 100 KB parser limit', async () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      id: `turn-${i}`,
      role: i % 2 ? 'user' : 'assistant',
      text: 'Tiếng Việt '.repeat(800),
    }));
    expect(Buffer.byteLength(JSON.stringify({ turns }))).toBeGreaterThan(
      100 * 1024,
    );
    const response = await request(app.getHttpServer())
      .post('/interviews/probe')
      .send({ turns })
      .expect(201);
    expect(response.body).toEqual({ turns: 10, characters: 88000 });
  });
  it('rejects interview request bodies beyond 1 MB with a bounded error response', async () => {
    const response = await request(app.getHttpServer())
      .post('/interviews/probe')
      .send({ text: 'x'.repeat(1024 * 1024) })
      .expect(413);
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });
  it('keeps the default small body limit outside the interview route', async () => {
    const response = await request(app.getHttpServer())
      .post('/ordinary-probe')
      .send({ text: 'x'.repeat(150 * 1024) });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
