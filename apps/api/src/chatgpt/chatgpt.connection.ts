import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../common/app-error';
import { ChatgptStore, type ChatgptCredential } from './chatgpt.store';
import {
  ISSUER,
  RESOURCE,
  SCOPES,
  PLAN_SCOPE,
  TOKEN_ENDPOINT,
  connectionError,
  validateIdentity,
} from './chatgpt.identity';

type Pending = {
  owner: string;
  state: string;
  nonce: string;
  verifier: string;
  binding: string;
  expiresAt: number;
  returnPath: string;
  redirectUri: string;
  generation: number;
  registration: ChatgptCredential | null;
};
type TokenSet = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};
const opaque = () => randomBytes(32).toString('base64url');
const matches = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
@Injectable()
export class ChatgptConnection {
  private readonly pending = new Map<string, Pending>();
  private readonly tickets = new Map<string, string>();
  private readonly refreshing = new Map<string, Promise<ChatgptCredential>>();
  private readonly generations = new Map<string, number>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly disconnecting = new Set<string>();
  constructor(private readonly store: ChatgptStore) {}
  private generation(owner: string) {
    return this.generations.get(owner) ?? 0;
  }
  private async exclusive<T>(
    owner: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(owner) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    this.locks.set(owner, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(owner) === next) this.locks.delete(owner);
    }
  }
  private async revoke(clientId: string, token: string) {
    try {
      return (
        await fetch(ISSUER + '/api/accounts/oauth/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token,
            token_type_hint: 'refresh_token',
            client_id: clientId,
          }),
          signal: AbortSignal.timeout(15000),
        })
      ).ok;
    } catch {
      return false;
    }
  }
  private config() {
    const web = new URL(process.env.WEB_ORIGIN || 'http://localhost:3000');
    const redirect = new URL(
      process.env.CHATGPT_REDIRECT_URI ||
        'http://127.0.0.1:4000/chatgpt/callback',
    );
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(web.hostname) ||
      redirect.protocol !== 'http:' ||
      redirect.hostname !== '127.0.0.1' ||
      redirect.pathname !== '/chatgpt/callback' ||
      redirect.search ||
      redirect.hash ||
      redirect.username ||
      redirect.password
    )
      throw AppError.aiNotConfigured(
        'Kết nối ChatGPT hiện chỉ hỗ trợ ứng dụng cục bộ với callback 127.0.0.1.',
      );
    return {
      web: web.origin,
      redirectUri: redirect.href,
      loopback: redirect.origin,
    };
  }
  async begin(owner: string, returnPath = '/') {
    const cfg = this.config();
    if (this.disconnecting.has(owner)) throw connectionError();
    const generation = this.generation(owner);
    if (
      !returnPath.startsWith('/') ||
      returnPath.startsWith('//') ||
      returnPath.includes('\\') ||
      new URL(returnPath, cfg.web).origin !== cfg.web
    )
      returnPath = '/';
    for (const [state, attempt] of this.pending)
      if (attempt.expiresAt < Date.now()) this.pending.delete(state);
    for (const [ticket, state] of this.tickets)
      if (!this.pending.has(state)) this.tickets.delete(ticket);
    if (this.pending.size >= 100)
      throw AppError.conflict(
        'Có quá nhiều yêu cầu kết nối. Vui lòng thử lại sau.',
      );
    const state = opaque(),
      ticket = opaque();
    const attempt: Pending = {
      owner,
      generation,
      state,
      nonce: opaque(),
      verifier: opaque(),
      binding: opaque(),
      expiresAt: Date.now() + 600000,
      returnPath,
      redirectUri: cfg.redirectUri,
      registration: await this.store.read(owner),
    };
    if (this.disconnecting.has(owner) || generation !== this.generation(owner))
      throw connectionError();
    this.pending.set(state, attempt);
    this.tickets.set(ticket, state);
    return {
      url:
        cfg.loopback +
        '/chatgpt/authorize?ticket=' +
        encodeURIComponent(ticket),
    };
  }
  async authorize(ticket: string) {
    const state = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    const attempt = state ? this.pending.get(state) : null;
    if (!attempt || attempt.expiresAt < Date.now())
      throw connectionError('Yêu cầu kết nối đã hết hạn.');
    const hostId = await this.store.hostId();
    const previous = attempt.registration;
    const params = new URLSearchParams({
      client_id: previous?.clientId || 'dynamic_agent_client',
      ext_agent_host_id: hostId,
      response_type: 'code',
      redirect_uri: attempt.redirectUri,
      scope: SCOPES,
      resource: RESOURCE,
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256')
        .update(attempt.verifier)
        .digest('base64url'),
    });
    if (previous?.clientId) {
      if (previous.idToken) params.set('id_token_hint', previous.idToken);
    } else params.set('agent_name_hint', 'Interview Knowledge Base');
    return {
      url: ISSUER + '/api/accounts/authorize?' + params,
      binding: attempt.binding,
      cookie: this.cookieName(attempt.state),
    };
  }
  cookieName(state: string) {
    return 'kb_chatgpt_' + state;
  }
  async finish(
    query: {
      state?: string;
      code?: string;
      client_id?: string;
      error?: string;
    },
    binding?: string,
  ) {
    const cfg = this.config();
    const attempt = query.state ? this.pending.get(query.state) : null;
    if (
      !attempt ||
      attempt.expiresAt < Date.now() ||
      !binding ||
      !matches(binding, attempt.binding)
    )
      throw connectionError('Yêu cầu OAuth không hợp lệ hoặc đã hết hạn.');
    this.pending.delete(attempt.state);
    const result = new URL(attempt.returnPath, cfg.web);
    try {
      if (query.error || !query.code)
        throw connectionError('Bạn chưa cấp quyền sử dụng gói ChatGPT.');
      const code = query.code;
      await this.exclusive(attempt.owner, async () => {
        if (
          attempt.generation !== this.generation(attempt.owner) ||
          this.disconnecting.has(attempt.owner)
        )
          throw connectionError();
        const clientId = attempt.registration?.clientId || query.client_id;
        if (
          !clientId ||
          clientId === 'dynamic_agent_client' ||
          (attempt.registration &&
            query.client_id &&
            query.client_id !== clientId)
        )
          throw connectionError();
        const tokens = await this.exchange({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          code_verifier: attempt.verifier,
          redirect_uri: attempt.redirectUri,
          resource: RESOURCE,
        });
        if (!tokens.id_token || !tokens.refresh_token) throw connectionError();
        const identity = await validateIdentity(
          tokens.id_token,
          clientId,
          attempt.nonce,
        );
        if (
          attempt.registration &&
          attempt.registration.subject !== identity.subject
        )
          throw connectionError(
            'Tài khoản ChatGPT không khớp kết nối đã chọn.',
          );
        const scopes = (tokens.scope || '').split(/\s+/);
        if (!scopes.includes(PLAN_SCOPE) || !scopes.includes('resource.invoke'))
          throw connectionError('Chưa cấp quyền sử dụng gói ChatGPT.');
        if (
          attempt.generation !== this.generation(attempt.owner) ||
          this.disconnecting.has(attempt.owner)
        ) {
          await this.revoke(clientId, tokens.refresh_token);
          throw connectionError();
        }
        await this.store.save(attempt.owner, {
          clientId,
          subject: identity.subject,
          email: identity.email,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          idToken: tokens.id_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
          scopes,
          model: attempt.registration?.model,
        });
        this.generations.set(attempt.owner, this.generation(attempt.owner) + 1);
      });
      result.searchParams.set('chatgpt', 'connected');
    } catch {
      result.searchParams.set('chatgpt', 'error');
    }
    return result.href;
  }
  private async exchange(fields: Record<string, string>): Promise<TokenSet> {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw connectionError();
    const tokens = (await res.json()) as TokenSet;
    if (
      !tokens.access_token ||
      tokens.token_type?.toLowerCase() !== 'bearer' ||
      !Number.isFinite(tokens.expires_in) ||
      tokens.expires_in <= 0
    )
      throw connectionError();
    return tokens;
  }
  async credential(owner?: string): Promise<ChatgptCredential> {
    if (!owner)
      throw connectionError(
        'Đăng nhập app và kết nối ChatGPT trước khi sử dụng AI.',
      );
    if (this.disconnecting.has(owner)) throw connectionError();
    const pending = this.refreshing.get(owner);
    if (pending) return pending;
    const generation = this.generation(owner);
    const refresh = this.exclusive(owner, async () => {
      if (
        this.disconnecting.has(owner) ||
        generation !== this.generation(owner)
      )
        throw connectionError();
      const saved = await this.store.read(owner);
      if (!saved?.accessToken || !saved.scopes.includes(PLAN_SCOPE))
        throw connectionError(
          'Chưa kết nối ChatGPT. Vui lòng chọn Tiếp tục với ChatGPT.',
        );
      if (saved.expiresAt > Date.now() + 60000) return saved;
      if (!saved.refreshToken) throw connectionError();
      const tokens = await this.exchange({
        grant_type: 'refresh_token',
        client_id: saved.clientId,
        refresh_token: saved.refreshToken,
        resource: RESOURCE,
      });
      if (
        this.disconnecting.has(owner) ||
        generation !== this.generation(owner)
      ) {
        await this.revoke(
          saved.clientId,
          tokens.refresh_token || saved.refreshToken,
        );
        throw connectionError();
      }
      if (tokens.id_token) {
        const identity = await validateIdentity(
          tokens.id_token,
          saved.clientId,
        );
        if (identity.subject !== saved.subject) throw connectionError();
      }
      const scopes = tokens.scope ? tokens.scope.split(/\s+/) : saved.scopes;
      if (!scopes.includes(PLAN_SCOPE) || !scopes.includes('resource.invoke'))
        throw connectionError();
      if (
        this.disconnecting.has(owner) ||
        generation !== this.generation(owner)
      ) {
        await this.revoke(
          saved.clientId,
          tokens.refresh_token || saved.refreshToken,
        );
        throw connectionError();
      }
      const updated = {
        ...saved,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || saved.refreshToken,
        idToken: tokens.id_token || saved.idToken,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        scopes,
      };
      await this.store.save(owner, updated);
      return updated;
    }).finally(() => this.refreshing.delete(owner));
    this.refreshing.set(owner, refresh);
    return refresh;
  }
  async status(owner: string) {
    const saved = await this.store.read(owner);
    return {
      connected: !!saved?.accessToken,
      email: saved?.accessToken ? saved.email : undefined,
      model: saved?.accessToken ? saved.model : undefined,
    };
  }
  async models(owner: string) {
    const saved = await this.credential(owner);
    const response = await fetch(RESOURCE + '/models', {
      headers: { Authorization: 'Bearer ' + saved.accessToken },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401) throw connectionError();
    if (!response.ok)
      throw AppError.aiUpstream('Không tải được danh sách mô hình ChatGPT.');
    const data = (await response.json()) as {
      models?: Array<{
        slug: string;
        display_name: string;
        visibility: string;
      }>;
    };
    return (data.models ?? [])
      .filter(
        (model) =>
          model.visibility === 'list' && typeof model.slug === 'string',
      )
      .map((model) => ({
        id: model.slug,
        name: model.display_name || model.slug,
      }));
  }
  async selectModel(owner: string, model: string) {
    const models = await this.models(owner);
    if (!models.some((item) => item.id === model))
      throw AppError.validation(
        'Mô hình không khả dụng cho tài khoản ChatGPT này.',
      );
    await this.exclusive(owner, async () => {
      const saved = await this.store.read(owner);
      if (!saved?.accessToken || this.disconnecting.has(owner))
        throw connectionError();
      await this.store.save(owner, { ...saved, model });
    });
    return { model };
  }
  async disconnect(owner: string) {
    this.disconnecting.add(owner);
    this.generations.set(owner, this.generation(owner) + 1);
    for (const [state, attempt] of this.pending)
      if (attempt.owner === owner) this.pending.delete(state);
    for (const [ticket, state] of this.tickets)
      if (!this.pending.has(state)) this.tickets.delete(ticket);
    try {
      return await this.exclusive(owner, async () => {
        const saved = await this.store.read(owner);
        const revoked = saved?.refreshToken
          ? await this.revoke(saved.clientId, saved.refreshToken)
          : true;
        if (saved)
          await this.store.save(owner, {
            ...saved,
            accessToken: '',
            refreshToken: '',
            idToken: '',
            expiresAt: 0,
            scopes: [],
          });
        return { connected: false, revoked };
      });
    } finally {
      this.disconnecting.delete(owner);
    }
  }
}
