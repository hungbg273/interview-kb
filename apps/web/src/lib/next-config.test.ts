import { expect, it } from 'vitest';
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants';
import config from '../../next.config';

it('isolates development manifests while production build and start use the same output', async () => {
  const resolve = async (phase: string) => typeof config === 'function'
    ? config(phase)
    : config;
  const dev = await resolve(PHASE_DEVELOPMENT_SERVER);
  const build = await resolve(PHASE_PRODUCTION_BUILD);
  const start = await resolve(PHASE_PRODUCTION_SERVER);
  expect(dev.distDir ?? '.next').not.toBe(build.distDir ?? '.next');
  expect(start.distDir ?? '.next').toBe(build.distDir ?? '.next');
});
