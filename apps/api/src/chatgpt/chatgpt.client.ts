import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { ChatgptConnection } from './chatgpt.connection';
import { RESOURCE, connectionError } from './chatgpt.identity';

function providerError(code?: string): AppError {
  if (code === 'subscription_sharing_usage_limit_exceeded')
    return new AppError(
      'CHATGPT_USAGE_LIMIT',
      'Bạn đã hết hạn mức ChatGPT. Vui lòng thử lại khi hạn mức được đặt lại.',
      429,
    );
  if (code === 'subscription_sharing_usage_unavailable')
    return new AppError(
      'CHATGPT_USAGE_UNAVAILABLE',
      'Hạn mức ChatGPT hiện chưa khả dụng. Vui lòng thử lại sau.',
      503,
    );
  return AppError.aiUpstream(
    'ChatGPT không hoàn tất yêu cầu. Vui lòng thử lại.',
  );
}
@Injectable()
export class ChatgptClient {
  constructor(private readonly connection: ChatgptConnection) {}
  async complete(opts: {
    owner?: string;
    system: string;
    user: string;
    json?: boolean;
  }): Promise<string> {
    try {
      const credential = await this.connection.credential(opts.owner);
      const models = await this.connection.models(opts.owner!);
      const model =
        models.find((item) => item.id === credential.model)?.id ||
        models[0]?.id;
      if (!model)
        throw AppError.aiUpstream(
          'Tài khoản ChatGPT chưa có mô hình khả dụng.',
        );
      const response = await fetch(RESOURCE + '/responses', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + credential.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          store: false,
          stream: true,
          instructions:
            opts.system +
            (opts.json
              ? '\nChỉ trả về một đối tượng JSON hợp lệ, không dùng hàng rào Markdown.'
              : ''),
          input: [{ role: 'user', content: opts.user }],
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (response.status === 401) throw connectionError();
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { code?: string };
        };
        throw providerError(body.error?.code);
      }
      if (!response.body) throw providerError();
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '',
        output = '',
        completed = false;
      const event = (block: string) => {
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data || data === '[DONE]') return;
        const value = JSON.parse(data) as {
          type: string;
          code?: string;
          delta?: string;
          error?: { code?: string };
          response?: {
            error?: { code?: string };
            output?: Array<{
              content?: Array<{ type: string; text?: string }>;
            }>;
          };
        };
        if (value.type === 'response.output_text.delta')
          output += value.delta ?? '';
        if (
          value.type === 'error' ||
          value.type === 'response.failed' ||
          value.type === 'response.incomplete'
        )
          throw providerError(
            value.code || value.error?.code || value.response?.error?.code,
          );
        if (value.type === 'response.completed') {
          completed = true;
          const final = value.response?.output
            ?.flatMap((item) => item.content ?? [])
            .filter((item) => item.type === 'output_text')
            .map((item) => item.text ?? '')
            .join('');
          if (final) output = final;
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer = (
            buffer +
            (done ? decoder.decode() : decoder.decode(value, { stream: true }))
          ).replace(/\r\n/g, '\n');
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            event(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
          }
          if (completed) {
            await reader.cancel();
            break;
          }
          if (done) {
            if (buffer.trim()) event(buffer);
            break;
          }
          if (buffer.length > 2_000_000 || output.length > 2_000_000)
            throw providerError();
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (!completed || !output.trim()) throw providerError();
      return output;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (['AbortError', 'TimeoutError'].includes((error as Error).name))
        throw AppError.aiTimeout('ChatGPT phản hồi quá lâu. Vui lòng thử lại.');
      throw providerError();
    }
  }
}
