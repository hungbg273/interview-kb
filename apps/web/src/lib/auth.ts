import { api, ApiError } from './api';

export async function getMe(): Promise<{ email: string } | null> {
  try {
    return await api<{ email: string }>('/auth/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}