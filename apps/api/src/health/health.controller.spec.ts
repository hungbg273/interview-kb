import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok', async () => {
    const mod = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    const ctrl = mod.get(HealthController);
    expect(ctrl.getHealth()).toEqual({ ok: true });
  });
});
