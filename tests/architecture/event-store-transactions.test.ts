// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('preserves the twelve Durable Object concurrency boundaries', () => {
  const root = 'worker/src/event-store';
  const modules = readdirSync(root).filter((filename) => filename.endsWith('.ts'));
  const filenames = [root + '.ts', ...modules.map((filename) => root + '/' + filename)];
  let boundaries = 0;
  for (const filename of filenames) {
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.ESNext, true);
    function count(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ['transactionSync', 'blockConcurrencyWhile'].includes(node.expression.name.text)
      )
        boundaries++;
      ts.forEachChild(node, count);
    }
    count(source);
  }
  expect(boundaries).toBe(12);
});
