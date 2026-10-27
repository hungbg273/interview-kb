import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import type { Account } from './account-context';
export async function accountForEmail(
  db: DataSource,
  email: string,
): Promise<Account> {
  const [row] = await db.query(
    'SELECT id,email,display_name AS "displayName" FROM app_user WHERE email=$1',
    [email.trim().toLowerCase()],
  );
  if (!row) throw AppError.unauthenticated('Không tìm thấy tài khoản.');
  return row;
}
@Injectable()
export class AccountsService {
  constructor(private readonly db: DataSource) {}
  async ensure(email: string, displayName?: string): Promise<Account> {
    const normalized = email.trim().toLowerCase();
    const [user] = await this.db.query(
      `INSERT INTO app_user(email,display_name) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET display_name=CASE WHEN $3 THEN EXCLUDED.display_name ELSE app_user.display_name END RETURNING id,email,display_name AS "displayName"`,
      [
        normalized,
        displayName?.trim().slice(0, 80) || 'Thành viên',
        !!displayName?.trim(),
      ],
    );
    return user;
  }
}
