// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { isLearningStorageKey, isScopedResetSharedStateKey } from '../../shared/contracts/storage-keys';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}

function modules(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
  return ts.preProcessFile(source.text, true, true).importedFiles.map((entry) => entry.fileName);
}

function within(root: string, target: string): boolean {
  const fromRoot = relative(resolve(root), target);
  return fromRoot !== '..' && !fromRoot.startsWith('..' + sep);
}

it('keeps shared contracts independent of browser and worker implementations', () => {
  const violations = sourceFiles('shared/contracts').flatMap((file) =>
    modules(file).filter((module) =>
      module.startsWith('.') ? !within('shared', resolve(dirname(file), module)) : !/^zod(?:\/|$)/.test(module),
    ),
  );
  expect(violations).toEqual([]);
});

it('keeps production worker modules independent of browser source', () => {
  const violations = sourceFiles('worker/src').flatMap((file) =>
    modules(file).filter((module) => module.startsWith('@/') || (module.startsWith('.') && within('src', resolve(dirname(file), module)))),
  );
  expect(violations).toEqual([]);
});

it('preserves the scoped reset allowlist and browser-only storage keys', () => {
  const browserAndReset = [
    'math-scratchpad-session-v3',
    'math-scratchpad-redux-v2',
    'math-scratchpad-flow-v1',
    'math-scratchpad-drive-session-archive-v1',
    'math-scratchpad-reading-position-v1',
    'math-scratchpad-lesson-progress-v1:bank:v21',
    'math-scratchpad-last-open-lesson-v1:bank:v21',
  ];
  const browserOnly = ['math-scratchpad-inline-fractions-round1-v1', 'math-scratchpad-reading-position-v1:bank'];
  const candidates = [...browserAndReset, ...browserOnly, 'math-scratchpad-drive-bank-cache-v1:bank', 'unrelated'];
  expect(candidates.filter(isScopedResetSharedStateKey)).toEqual(browserAndReset);
  expect(candidates.filter(isLearningStorageKey)).toEqual([...browserAndReset, ...browserOnly]);
});
