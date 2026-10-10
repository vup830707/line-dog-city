/** Public path for Vite, the PWA manifest, and the Pages workflow. */
export function publicBase(raw = process.env.VITE_BASE) {
  const value = (raw ?? '').trim()
  if (value === '' || value === '/') return '/'
  let base = value.startsWith('/') || /^[a-z]+:/i.test(value) ? value : `/${value}`
  if (!base.endsWith('/')) base += '/'
  return base
}
