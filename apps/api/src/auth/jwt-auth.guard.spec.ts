import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function httpContext(path: string): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ url: path, path }),
    }),
  } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
  const guard = new JwtAuthGuard(reflector as never);

  it('allows swagger docs without a JWT', () => {
    expect(guard.canActivate(httpContext('/docs'))).toBe(true);
    expect(guard.canActivate(httpContext('/docs-json'))).toBe(true);
    expect(guard.canActivate(httpContext('/docs/swagger-ui.css'))).toBe(true);
  });
});
