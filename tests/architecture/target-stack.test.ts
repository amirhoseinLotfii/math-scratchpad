// @vitest-environment node
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
const root = process.cwd();
function files(relative: string): string[] {
 const path = join(root, relative); if (!existsSync(path)) return [];
 return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(relative, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [join(relative, entry.name)] : []);
}
function imports(path: string) {
 const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
 return source.statements.filter(ts.isImportDeclaration).map(node => ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '');
}
describe('ARCH: requested target stack and feature boundaries', () => {
 it('declares the requested production libraries and removes dual Redux/Zustand ownership', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  expect(Object.keys(pkg.dependencies)).toEqual(expect.arrayContaining(['react','react-dom','zustand','react-hook-form','@hookform/resolvers','zod']));
  expect(pkg.dependencies['react-redux']).toBeUndefined(); expect(pkg.dependencies['@reduxjs/toolkit']).toBeUndefined();
  expect({ ...pkg.dependencies, ...pkg.devDependencies }).toHaveProperty('tailwindcss');
 });
 it('configures source-owned shadcn components and semantic-token styling at the agreed aliases', () => {
  const configPath = join(root, 'components.json'); expect(existsSync(configPath), 'shadcn source configuration is required').toBe(true);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  expect(config.tailwind.cssVariables).toBe(true); expect(config.aliases.ui).toBe('@/shared/ui');
  expect(existsSync(join(root, config.tailwind.css))).toBe(true);
 });
 it('keeps shared UI independent from feature/session state libraries', () => {
  const uiFiles = files('src/shared/ui'); expect(uiFiles.length, 'shared primitives have not been implemented').toBeGreaterThan(0);
  const leaks = uiFiles.flatMap(file => imports(file).filter(name => /(^|\/)features\/|zustand|react-redux|@reduxjs/.test(name)).map(name => ({ file, name })));
  expect(leaks).toEqual([]);
 });
 it('keeps mathematical domain models independent from React, form and UI libraries', () => {
  const modelFiles = files('src/features/math-editor/model'); expect(modelFiles.length, 'domain boundary has not been implemented').toBeGreaterThan(0);
  const leaks = modelFiles.flatMap(file => imports(file).filter(name => /^(react|zustand|react-hook-form)|shared\/ui|components\//.test(name)).map(name => ({ file, name })));
  expect(leaks).toEqual([]);
 });
 it('uses stable kebab-case names in the new feature/shared tree and strict TypeScript', () => {
  const targetFiles = [...files('src/features'), ...files('src/shared')]; expect(targetFiles.length).toBeGreaterThan(0);
  expect(targetFiles.filter(file => !/^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:ts|tsx)$/.test(basename(file)))).toEqual([]);
  const config = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8')); expect(config.compilerOptions.strict).toBe(true);
 });
});
