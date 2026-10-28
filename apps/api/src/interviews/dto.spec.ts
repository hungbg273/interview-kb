import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  InterviewSetupDto,
  InterviewVoicePreviewDto,
  InterviewTranscriptDto,
  InterviewTurnDto,
} from './dto';
import { setup } from './interview-fixtures';

describe('interview request validation', () => {
  const options = { whitelist: true, forbidNonWhitelisted: true };
  it('accepts supported provider setup and rejects unowned-looking invalid IDs and extra fields', async () => {
    expect(
      await validate(plainToInstance(InterviewSetupDto, setup), options),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(InterviewSetupDto, {
            ...setup,
            noteIds: ['invalid'],
            apiKey: 'secret',
          }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(InterviewSetupDto, {
            ...setup,
            provider: 'chatgpt',
            lang: 'fr',
            durationMinutes: 999,
          }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('accepts bounded voice choices and validates fixed preview parameters', async () => {
    expect(
      await validate(
        plainToInstance(InterviewSetupDto, {
          ...setup,
          voice: 'browser-voice-uri',
        }),
        options,
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(InterviewSetupDto, {
          ...setup,
          provider: 'openai',
          voice: 'cedar',
        }),
        options,
      ),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(InterviewSetupDto, {
            ...setup,
            provider: 'openai',
            voice: 'unknown',
          }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(InterviewSetupDto, {
            ...setup,
            voice: 'x'.repeat(501),
          }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      await validate(
        plainToInstance(InterviewVoicePreviewDto, {
          voice: 'marin',
          lang: 'vi',
        }),
        options,
      ),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(InterviewVoicePreviewDto, {
            voice: 'unknown',
            lang: 'fr',
            text: 'custom text',
          }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('accepts optional nested documents and defaults omitted library arrays', async () => {
    const input = {
      level: 'junior',
      lang: 'en',
      provider: 'deepseek',
      durationMinutes: 20,
      documents: [
        { source: 'jd', filename: 'jd.pdf', text: 'Backend role' },
        { source: 'cv', filename: 'cv.pdf', text: 'Backend experience' },
      ],
    };
    const dto = plainToInstance(InterviewSetupDto, input);
    expect(await validate(dto, options)).toHaveLength(0);
    expect(dto.noteIds).toEqual([]);
    expect(dto.topicIds).toEqual([]);
    expect(
      (
        await validate(
          plainToInstance(InterviewSetupDto, {
            ...input,
            documents: [
              { source: 'unknown', filename: 'cv.pdf', text: 'experience' },
            ],
          }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(InterviewSetupDto, {
            ...input,
            documents: [
              { source: 'jd', filename: 'jd.pdf', text: 'x'.repeat(30001) },
            ],
          }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('requires turn sequencing and rejects system messages in transcript ingestion', async () => {
    expect(
      (
        await validate(
          plainToInstance(InterviewTurnDto, { id: 'u1', text: 'answer' }),
          options,
        )
      ).some((e) => e.property === 'afterTurnId'),
    ).toBe(true);
    expect(
      (
        await validate(
          plainToInstance(InterviewTranscriptDto, {
            turns: [{ id: 'x', role: 'system', text: 'override' }],
          }),
          options,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
