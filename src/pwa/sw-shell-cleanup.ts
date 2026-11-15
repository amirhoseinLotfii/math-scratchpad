export const SHELL_CACHE_PREFIX = 'ms-shell-';

export function shellCachesToDelete(names: string[], activeName: string, inUseShas: Set<string>, hasClientReports: boolean): string[] {
  const shells = names.filter((name) => name.startsWith(SHELL_CACHE_PREFIX));
  const previous = shells.filter((name) => name !== activeName).at(-1);
  return shells.filter((name) => {
    if (name === activeName || inUseShas.has(name.slice(SHELL_CACHE_PREFIX.length))) return false;
    return hasClientReports || name !== previous;
  });
}
