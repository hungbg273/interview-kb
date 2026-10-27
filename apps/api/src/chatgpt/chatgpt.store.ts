import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { AppError } from '../common/app-error';

export type ChatgptCredential = {
  clientId: string;
  subject: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
  scopes: string[];
  model?: string;
};
@Injectable()
export class ChatgptStore {
  private directory() {
    return resolve(process.env.CHATGPT_CREDENTIALS_DIR || '.chatgpt');
  }
  pathFor(owner: string) {
    return join(
      this.directory(),
      createHash('sha256').update(owner.toLowerCase()).digest('hex') + '.json',
    );
  }
  private key() {
    const secret = process.env.CHATGPT_TOKEN_SECRET || process.env.JWT_SECRET;
    if (!secret)
      throw AppError.aiNotConfigured(
        'Chưa cấu hình khóa bảo vệ kết nối ChatGPT.',
      );
    return createHash('sha256')
      .update('kb-chatgpt-v1:' + secret)
      .digest();
  }
  async hostId() {
    await mkdir(this.directory(), { recursive: true, mode: 0o700 });
    const path = join(this.directory(), 'host-id');
    try {
      await writeFile(path, 'urn:uuid:' + randomUUID(), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    return (await readFile(path, 'utf8')).trim();
  }
  async read(owner: string): Promise<ChatgptCredential | null> {
    let raw: string;
    try {
      raw = await readFile(this.pathFor(owner), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    const data = JSON.parse(raw) as {
      iv: string;
      tag: string;
      ciphertext: string;
    };
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(data.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(data.ciphertext, 'base64')),
        decipher.final(),
      ]).toString(),
    );
  }
  async save(owner: string, value: ChatgptCredential) {
    await mkdir(this.directory(), { recursive: true, mode: 0o700 });
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    const path = this.pathFor(owner),
      temp = path + '.' + randomUUID() + '.tmp';
    await writeFile(
      temp,
      JSON.stringify({
        v: 1,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      }),
      { mode: 0o600 },
    );
    await rename(temp, path);
  }
}
