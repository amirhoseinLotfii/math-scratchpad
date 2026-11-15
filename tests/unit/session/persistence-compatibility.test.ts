import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { validateSession } from '../../../src/persistence';

function validate(input: unknown): unknown {
  try {
    return { accepted: true, data: validateSession(input) };
  } catch {
    return { accepted: false };
  }
}

it('preserves validation and normalization over 400 generated v1 and v2 sessions', () => {
  // Expected outcomes were captured from the pre-Stage-A validator using seed 15_111_026.
  const path = 'tests/fixtures/persistence/stage-a-validation.json.gz';
  const fixtures = JSON.parse(gunzipSync(readFileSync(path)).toString()) as Array<{ sample: unknown; expected: unknown }>;
  expect(fixtures).toHaveLength(400);
  for (const { sample, expected } of fixtures) {
    expect(validate(sample)).toEqual(expected);
  }
});
