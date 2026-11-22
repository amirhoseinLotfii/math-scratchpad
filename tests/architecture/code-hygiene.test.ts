// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const MAX_PHYSICAL_LINES = 300;

/**
 * Shrinking allowlist of legacy files > 300 physical lines.
 * Phases B–F systematically remove entries until this set is completely empty.
 */
const MAX_LINES_ALLOWLIST = new Set<string>([
  // Phase F: cloudflare worker
  'worker/src/event-store.ts',
  'worker/src/google-drive.ts',
  'worker/src/notion-projection.ts',
  'worker/src/notion-mirror.ts',
  'worker/src/index.ts',
]);

/** Root-level compatibility shims preserved for legacy test imports. */
const LEGACY_ROOT_NAMING_EXCEPTIONS = new Set<string>([
  'src/App.tsx',
  'src/Formula.tsx',
  'src/fractionRoundOne.ts',
  'src/Keyboard.tsx',
  'src/legacyDiagnostic.ts',
  'src/MathDisplay.tsx',
  'src/QuestionTimer.tsx',
]);

/**
 * Remaining layer boundary exceptions (cleared in Phase E).
 */
const LAYER_VIOLATION_ALLOWLIST = new Set<string>([]);

function walkFiles(relativeDir: string, pattern = /\.(ts|tsx|css)$/): string[] {
  const fullDir = join(root, relativeDir);
  if (!existsSync(fullDir)) return [];
  return readdirSync(fullDir, { withFileTypes: true }).flatMap(entry => {
    const relPath = posix.join(relativeDir.replace(/\\/g, '/'), entry.name);
    if (entry.isDirectory()) return walkFiles(relPath, pattern);
    return pattern.test(entry.name) ? [relPath] : [];
  });
}

function countPhysicalLines(relPath: string): number {
  const content = readFileSync(join(root, relPath), 'utf8');
  if (content.length === 0) return 0;
  const lines = content.split(/\r?\n/);
  // Ignore trailing empty line after final newline when counting physical lines, or count raw lines:
  // Wait: let's check both or raw split length when trailing newline is stripped.
  return content.endsWith('\n') ? lines.length - 1 : lines.length;
}

function resolveModule(fromFile: string, specifier: string): string | null {
  let candidate: string;
  if (specifier.startsWith('@/')) {
    candidate = 'src/' + specifier.slice(2);
  } else if (specifier.startsWith('.')) {
    candidate = posix.normalize(posix.join(dirname(fromFile), specifier));
  } else {
    return null;
  }

  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const full = join(root, candidate + ext);
    if (existsSync(full) && statSync(full).isFile()) {
      return candidate + ext;
    }
  }
  return null;
}

function parseEdges(relPath: string): { all: string[]; runtime: string[] } {
  const content = readFileSync(join(root, relPath), 'utf8');
  const sf = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true);
  const all: string[] = [];
  const runtime: string[] = [];

  for (const st of sf.statements) {
    if (
      (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
      st.moduleSpecifier &&
      ts.isStringLiteral(st.moduleSpecifier)
    ) {
      const resolved = resolveModule(relPath, st.moduleSpecifier.text);
      if (!resolved) continue;
      all.push(resolved);
      const isTypeOnly =
        (ts.isImportDeclaration(st) && Boolean(st.importClause?.isTypeOnly)) ||
        (ts.isExportDeclaration(st) && Boolean(st.isTypeOnly));
      if (!isTypeOnly) {
        runtime.push(resolved);
      }
    }
  }
  return { all, runtime };
}

type Layer = 'app' | 'features' | 'sync' | 'storage' | 'auth' | 'domain' | 'shared' | 'root-shim';

function getLayer(relPath: string): Layer {
  if (
    relPath === 'src/App.tsx' ||
    relPath === 'src/main.tsx' ||
    relPath === 'src/round1-main.tsx' ||
    relPath.startsWith('src/app/')
  ) {
    return 'app';
  }
  if (relPath.startsWith('src/features/')) return 'features';
  if (relPath.startsWith('src/sync/')) return 'sync';
  if (relPath.startsWith('src/storage/')) return 'storage';
  if (relPath.startsWith('src/auth/')) return 'auth';
  if (relPath.startsWith('src/domain/')) return 'domain';
  if (relPath.startsWith('src/shared/')) return 'shared';
  return 'root-shim';
}

const ALLOWED_LAYER_TARGETS: Record<Layer, ReadonlySet<Layer>> = {
  app: new Set(['app', 'features', 'sync', 'storage', 'auth', 'domain', 'shared', 'root-shim']),
  features: new Set(['features', 'sync', 'storage', 'auth', 'domain', 'shared', 'root-shim']),
  sync: new Set(['sync', 'storage', 'auth', 'domain', 'shared']),
  storage: new Set(['storage', 'domain', 'shared']),
  auth: new Set(['auth', 'storage', 'domain', 'shared']),
  domain: new Set(['domain', 'shared']),
  shared: new Set(['shared', 'storage']),
  'root-shim': new Set(['app', 'features', 'sync', 'storage', 'auth', 'domain', 'shared', 'root-shim']),
};

describe('ARCH: code hygiene, SRP line budget, kebab-case naming, and unidirectional layers', () => {
  it('removes confirmed dead files from the repository', () => {
    const deadFiles = [
      'src/styles.css.backup',
      'migrate-colors.cjs',
      'scan-components.cjs',
      'component-scan-report.json',
      'session-s001.tsx',
    ];
    for (const dead of deadFiles) {
      expect(existsSync(join(root, dead)), `${dead} must be deleted`).toBe(false);
    }
  });

  it('enforces <= 300 physical lines across src/ and worker/src/ with a shrinking allowlist', () => {
    const activeFiles = [...walkFiles('src'), ...walkFiles('worker/src')];
    const violations: Array<{ file: string; lines: number }> = [];
    const staleAllowlist: string[] = [];

    const over300Actual = new Set<string>();
    for (const file of activeFiles) {
      const lines = countPhysicalLines(file);
      if (lines > MAX_PHYSICAL_LINES) {
        over300Actual.add(file);
        if (!MAX_LINES_ALLOWLIST.has(file)) {
          violations.push({ file, lines });
        }
      }
    }

    for (const allowedFile of MAX_LINES_ALLOWLIST) {
      if (!over300Actual.has(allowedFile)) {
        staleAllowlist.push(allowedFile);
      }
    }

    expect(violations, 'Files exceeding 300 physical lines without allowlist entry').toEqual([]);
    expect(
      staleAllowlist,
      'Files in MAX_LINES_ALLOWLIST that are now <= 300 lines must be removed from the allowlist'
    ).toEqual([]);
  });

  it('enforces kebab-case file naming across src/ and worker/src/', () => {
    const activeFiles = [...walkFiles('src'), ...walkFiles('worker/src')];
    const kebabPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)*\.(?:ts|tsx|css)$/;

    const invalidNames = activeFiles.filter(
      file => !LEGACY_ROOT_NAMING_EXCEPTIONS.has(file) && !kebabPattern.test(basename(file))
    );
    expect(invalidNames).toEqual([]);
  });

  it('enforces unidirectional layer boundaries (app -> features -> sync -> {storage, auth} -> domain -> shared)', () => {
    const tsFiles = walkFiles('src', /\.(ts|tsx)$/);
    const unexpectedViolations: string[] = [];

    for (const file of tsFiles) {
      const fromLayer = getLayer(file);
      const { all } = parseEdges(file);
      for (const target of all) {
        const toLayer = getLayer(target);
        // Special rule: shared/ can only import storage/ inside mode-gate.ts
        if (fromLayer === 'shared' && toLayer === 'storage' && file !== 'src/shared/lib/mode-gate.ts') {
          unexpectedViolations.push(`${file} (${fromLayer}) -> ${target} (${toLayer})`);
          continue;
        }
        if (!ALLOWED_LAYER_TARGETS[fromLayer].has(toLayer)) {
          const key = `${file} -> ${target}`;
          if (!LAYER_VIOLATION_ALLOWLIST.has(key)) {
            unexpectedViolations.push(`${file} (${fromLayer}) -> ${target} (${toLayer})`);
          }
        }
      }
    }

    expect(unexpectedViolations).toEqual([]);
  });

  it('enforces zero runtime circular dependencies across src/ and worker/src/', () => {
    const tsFiles = [...walkFiles('src', /\.(ts|tsx)$/), ...walkFiles('worker/src', /\.(ts|tsx)$/)];
    const graph = new Map<string, string[]>();
    for (const file of tsFiles) {
      graph.set(file, parseEdges(file).runtime);
    }

    const visited = new Set<string>();
    const inStack = new Set<string>();
    const cycles: string[] = [];

    function dfs(node: string, pathStack: string[]) {
      visited.add(node);
      inStack.add(node);
      for (const next of graph.get(node) ?? []) {
        if (!graph.has(next)) continue;
        if (!visited.has(next)) {
          dfs(next, [...pathStack, next]);
        } else if (inStack.has(next)) {
          const cycleStart = pathStack.indexOf(next);
          cycles.push([...pathStack.slice(cycleStart), next].join(' -> '));
        }
      }
      inStack.delete(node);
    }

    for (const file of tsFiles) {
      if (!visited.has(file)) {
        dfs(file, [file]);
      }
    }

    expect(cycles).toEqual([]);
  });
});
