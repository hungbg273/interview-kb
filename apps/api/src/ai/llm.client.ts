import { Injectable } from '@nestjs/common';
import type { AiProvider } from '@kb/shared';
import { AppError } from '../common/app-error';

export type ProviderEnv = Record<string, string | undefined>;

export function providerConfig(provider: AiProvider, env: ProviderEnv) {
  if (provider === 'openai') {
    return {
      apiKey: env.OPENAI_API_KEY ?? '',
      baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
    };
  }
  return {
    apiKey: env.DEEPSEEK_API_KEY ?? '',
    baseUrl: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
  };
}

@Injectable()
export class LlmClient {
  async complete(opts: {
    provider: AiProvider;
    env: ProviderEnv;
    system: string;
    user: string;
  }): Promise<string> {
    const cfg = providerConfig(opts.provider, opts.env);
    if (!cfg.apiKey) {
      throw AppError.aiNotConfigured();
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);

    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
          ],
          temperature: 0.3,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        throw AppError.aiUpstream();
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return json.choices?.[0]?.message?.content ?? '';
    } catch (e) {
      if (e instanceof AppError) throw e;
      if ((e as { name?: string }).name === 'AbortError') {
        throw AppError.aiTimeout();
      }
      throw AppError.aiUpstream();
    } finally {
      clearTimeout(timer);
    }
  }
}
