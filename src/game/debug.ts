/** Playtest and e2e hooks stay off unless the page URL asks for them. */
export function debugHooksEnabled(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('debug') === '1'
}
