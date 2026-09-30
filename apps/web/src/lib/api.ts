export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }

export const api = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  };
  if (isForm) {
    delete headers['Content-Type'];
  } else if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error?.code ?? 'ERROR',
      data.error?.message ?? response.statusText,
    );
  }
  return data as T;
};