const OPEN_MODES = new Set(['development', 'test'])

/**
 * Dev and unit tests always get the hook. A production build (the public site
 * and `vite preview`) only exposes it when the URL has `?debug=1`.
 */
export function debugHooksEnabled(search: string, mode = 'production'): boolean {
  if (OPEN_MODES.has(mode)) return true
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('debug') === '1'
}
