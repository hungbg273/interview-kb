import { Injectable } from '@nestjs/common';
import type { VideoPlatform } from '@kb/shared';
import { AppError } from '../common/app-error';

export const MAX_TRANSCRIPT_CHARS = 30000;
const SUPADATA_DEFAULT_URL = 'https://api.supadata.ai/v1';
// Supadata may return an async job id for long/AI-generated transcripts. Poll
// bounded; we run inside the BullMQ worker so no user HTTP request is blocked.
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_MS = 120_000;
const REQUEST_TIMEOUT_MS = 60_000;

export type TranscriptResult = {
  platform: VideoPlatform;
  text: string;
};

type SupadataTranscript = {
  content?: string | Array<{ text?: string }>;
  jobId?: string;
  status?: 'queued' | 'active' | 'completed' | 'failed';
  error?: unknown;
};

/** Map a video URL to a supported platform, or reject unsupported hosts. */
export function detectPlatform(url: string): VideoPlatform {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    throw AppError.validation('Đường dẫn video không hợp lệ.');
  }
  if (/(^|\.)youtube\.com$/.test(host) || host === 'youtu.be')
    return 'youtube';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  if (/(^|\.)facebook\.com$/.test(host) || host === 'fb.watch')
    return 'facebook';
  throw AppError.validation(
    'Chỉ hỗ trợ liên kết YouTube, TikTok hoặc Facebook.',
  );
}

function plainText(content: SupadataTranscript['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content.map((chunk) => chunk?.text ?? '').join(' ');
  return '';
}

@Injectable()
export class TranscriptClient {
  private get baseUrl() {
    return (process.env.TRANSCRIPT_API_URL || SUPADATA_DEFAULT_URL).replace(
      /\/$/,
      '',
    );
  }

  private get apiKey() {
    return process.env.TRANSCRIPT_API_KEY ?? '';
  }

  /** Fetch the spoken transcript for a supported video URL. */
  async fetch(videoUrl: string): Promise<TranscriptResult> {
    const platform = detectPlatform(videoUrl);
    if (!this.apiKey.trim()) throw AppError.aiNotConfigured();

    const query = new URLSearchParams({
      url: videoUrl,
      text: 'true',
      mode: 'auto',
    });
    const first = await this.request(`/transcript?${query.toString()}`);

    let payload = first;
    if (first.jobId) payload = await this.poll(first.jobId);

    const text = plainText(payload.content).replace(/\u0000/g, '').trim();
    if (!text)
      throw new AppError(
        'VIDEO_NO_TRANSCRIPT',
        'Video này không có lời thoại để trích xuất.',
        422,
      );
    return { platform, text: text.slice(0, MAX_TRANSCRIPT_CHARS) };
  }

  private async poll(jobId: string): Promise<SupadataTranscript> {
    const deadline = Date.now() + MAX_POLL_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const result = await this.request(
        `/transcript/${encodeURIComponent(jobId)}`,
      );
      if (result.status === 'completed') return result;
      if (result.status === 'failed')
        throw AppError.aiUpstream('Dịch vụ không trích xuất được video này.');
    }
    throw AppError.aiUpstream('Trích xuất video quá lâu. Vui lòng thử lại.');
  }

  private async request(path: string): Promise<SupadataTranscript> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { 'x-api-key': this.apiKey },
        signal: ctrl.signal,
      });
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError')
        throw AppError.aiTimeout('Trích xuất video quá thời gian chờ.');
      throw AppError.aiUpstream('Không kết nối được dịch vụ trích xuất video.');
    } finally {
      clearTimeout(timer);
    }

    // Permanent: inaccessible video or no transcript available.
    if (res.status === 403 || res.status === 404)
      throw new AppError(
        'VIDEO_UNAVAILABLE',
        'Video ở chế độ riêng tư hoặc không tồn tại.',
        422,
      );
    if (res.status === 206)
      throw new AppError(
        'VIDEO_NO_TRANSCRIPT',
        'Video này không có lời thoại để trích xuất.',
        422,
      );
    // Transient: let the job retry.
    if (!res.ok)
      throw AppError.aiUpstream('Dịch vụ trích xuất video gặp lỗi.');

    try {
      return (await res.json()) as SupadataTranscript;
    } catch {
      throw AppError.aiUpstream('Phản hồi trích xuất video không hợp lệ.');
    }
  }
}
