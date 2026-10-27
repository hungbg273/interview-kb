import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError } from '../common/app-error';
export type Account = { id: string; email: string; displayName: string };
const accounts = new AsyncLocalStorage<Account>();
export function currentAccount(): Account {
  const account = accounts.getStore();
  if (!account)
    throw AppError.unauthenticated('Thiếu tài khoản cho thư viện cá nhân.');
  return account;
}
export function withAccount<T>(account: Account, work: () => T): T {
  return accounts.run(account, work);
}
