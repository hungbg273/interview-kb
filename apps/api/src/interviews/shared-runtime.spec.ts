import { execFileSync } from 'node:child_process';

it('loads the shared package in the same plain Node runtime used by the API container', () => {
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      "const shared = require('@kb/shared'); console.log(shared.ERROR_CODES.VALIDATION);",
    ],
    { encoding: 'utf8' },
  );
  expect(output.trim()).toBe('VALIDATION');
});
