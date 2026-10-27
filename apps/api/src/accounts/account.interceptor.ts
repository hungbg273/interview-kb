import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { isAdminEmail } from '@kb/shared';
import { AccountsService } from './accounts.service';
import { withAccount } from './account-context';
@Injectable()
export class AccountInterceptor implements NestInterceptor {
  constructor(private readonly accounts: AccountsService) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    if (
      !req.user?.email ||
      !isAdminEmail(req.user.email, process.env.ADMIN_EMAILS ?? '')
    )
      return next.handle();
    const account = await this.accounts.ensure(
      req.user.email,
      req.user.displayName,
    );
    req.user.userId = account.id;
    return new Observable((subscriber) =>
      withAccount(account, () => next.handle().subscribe(subscriber)),
    );
  }
}
