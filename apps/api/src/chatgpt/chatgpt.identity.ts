import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import { AppError } from '../common/app-error';
export const ISSUER = 'https://auth.openai.com';
export const RESOURCE = 'https://api.openai.com/v1';
export const TOKEN_ENDPOINT = ISSUER + '/api/accounts/oauth/token';
export const SCOPES =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
export function connectionError(
  message = 'Cần kết nối lại tài khoản ChatGPT.',
) {
  return new AppError('CHATGPT_RECONNECT_REQUIRED', message, 409);
}
export async function validateIdentity(
  token: string,
  clientId: string,
  nonce?: string,
) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (header.alg !== 'RS256' || typeof header.kid !== 'string')
      throw new Error();
    const res = await fetch(ISSUER + '/.well-known/jwks.json', {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error();
    const jwks = (await res.json()) as {
      keys: Array<JsonWebKey & { kid: string; alg?: string; use?: string }>;
    };
    const jwk = jwks.keys.find(
      (key) =>
        key.kid === header.kid &&
        key.kty === 'RSA' &&
        (!key.alg || key.alg === 'RS256') &&
        (!key.use || key.use === 'sig'),
    );
    if (
      !jwk ||
      !verify(
        'RSA-SHA256',
        Buffer.from(parts[0] + '.' + parts[1]),
        createPublicKey({ key: jwk, format: 'jwk' }),
        Buffer.from(parts[2], 'base64url'),
      )
    )
      throw new Error();
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      claims.iss !== ISSUER ||
      !audience.includes(clientId) ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Date.now() / 1000 ||
      typeof claims.sub !== 'string' ||
      !claims.sub
    )
      throw new Error();
    if (
      (audience.length > 1 && claims.azp !== clientId) ||
      (claims.azp !== undefined && claims.azp !== clientId)
    )
      throw new Error();
    if (claims.nbf && claims.nbf > Date.now() / 1000 + 30) throw new Error();
    if (nonce && claims.nonce !== nonce) throw new Error();
    return {
      subject: claims.sub as string,
      email: typeof claims.email === 'string' ? claims.email : '',
    };
  } catch {
    throw connectionError(
      'Không xác minh được danh tính ChatGPT. Vui lòng kết nối lại.',
    );
  }
}
