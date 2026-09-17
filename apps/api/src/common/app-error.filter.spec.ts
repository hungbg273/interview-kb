import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppErrorFilter } from './app-error.filter';

function mockHost(json: jest.Mock) {
  const status = jest.fn().mockReturnValue({ json });
  return {
    status,
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost,
  };
}

describe('AppErrorFilter', () => {
  const filter = new AppErrorFilter();

  it.each([
    [new UnauthorizedException(), 'UNAUTHENTICATED', HttpStatus.UNAUTHORIZED],
    [new ForbiddenException(), 'FORBIDDEN', HttpStatus.FORBIDDEN],
    [new NotFoundException(), 'NOT_FOUND', HttpStatus.NOT_FOUND],
    [new ConflictException(), 'CONFLICT', HttpStatus.CONFLICT],
    [new BadRequestException('bad'), 'VALIDATION', HttpStatus.BAD_REQUEST],
  ])('maps %s to { error: { code, message } }', (exception, code, statusCode) => {
    const json = jest.fn();
    const { status, host } = mockHost(json);
    filter.catch(exception, host);
    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith({
      error: { code, message: expect.any(String) },
    });
    expect(json.mock.calls[0][0].error.message.length).toBeGreaterThan(0);
  });

  it('does not leak stack for unknown errors', () => {
    const json = jest.fn();
    const { status, host } = mockHost(json);
    filter.catch(new Error('secret-key-abc'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
  });
});
