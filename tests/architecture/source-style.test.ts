// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const roots = ['src', 'shared', 'worker/src', 'worker/tests', 'tests', 'e2e', 'scripts'];
const sourceExtension = /\.(?:ts|tsx|css|mjs)$/;
const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function sourcePaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (path === 'tests/fixtures' || entry.name.endsWith('-snapshots')) return [];
      return sourcePaths(path);
    }
    return sourceExtension.test(entry.name) ? [path] : [];
  });
}

function assertionPath(file: string): string {
  return file.replaceAll('\\', '/');
}

function lexicalSyntax(path: string) {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
}

function hasJsx(node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true;
  return !!ts.forEachChild(node, (child) => hasJsx(child) || undefined);
}

describe('ARCH: naming and size limits', () => {
  it('caps handwritten sources and tests at 300 lines and 140 characters per line', () => {
    const violations = roots.flatMap(sourcePaths).flatMap((file) => {
      const lines = readFileSync(file, 'utf8')
        .replace(/\r?\n$/, '')
        .split(/\r?\n/);
      return [
        ...(lines.length > 300 ? [`${file}: ${lines.length} lines`] : []),
        ...lines.flatMap((line, index) => (line.length > 140 ? [`${file}:${index + 1}: ${line.length} characters`] : [])),
      ];
    });
    expect(violations).toEqual([]);
  });

  it('uses kebab-case paths and PascalCase exported React components', () => {
    const paths = roots.flatMap(sourcePaths);
    const invalid = paths.filter(
      (file) =>
        !assertionPath(file)
          .split('/')
          .every((part) => kebabCase.test(part.split('.')[0])),
    );
    expect(invalid).toEqual([]);
    const badExports = paths
      .filter((file) => assertionPath(file).startsWith('src/') && assertionPath(file).endsWith('.tsx'))
      .flatMap((file) => {
        const source = lexicalSyntax(file);
        return source.statements.flatMap((statement) => {
          if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword))
            return [];
          const components = ts.isFunctionDeclaration(statement)
            ? [statement]
            : ts.isVariableStatement(statement)
              ? [...statement.declarationList.declarations]
              : [];
          return components.flatMap((component) => {
            const name = component.name?.getText(source);
            return name && !/^use[A-Z]/.test(name) && hasJsx(component) && !/^[A-Z][A-Za-z0-9]*$/.test(name)
              ? [`${assertionPath(file)}: ${name}`]
              : [];
          });
        });
      });
    expect(badExports).toEqual([]);
  });

  it('keeps the root model and store entry points as one-line re-exports', () => {
    for (const file of ['src/store.ts', 'src/model.ts']) {
      const source = lexicalSyntax(file);
      expect(source.statements, file).toHaveLength(1);
      const [statement] = source.statements;
      expect(ts.isExportDeclaration(statement) && !!statement.moduleSpecifier, file).toBe(true);
      expect(source.text.trim().split('\n'), file).toHaveLength(1);
    }
  });
});
