export const AI_QUEUE = 'ai-jobs';
export function redisConnection() {
  const uri = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
  return {
    host: uri.hostname,
    port: Number(uri.port || 6379),
    username: uri.username || undefined,
    password: uri.password ? decodeURIComponent(uri.password) : undefined,
    db: Number(uri.pathname.slice(1) || 0),
    maxRetriesPerRequest: null,
    ...(uri.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
