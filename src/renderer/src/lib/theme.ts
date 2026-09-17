export type Theme = 'light' | 'dark' | 'system'
export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem('appearance')
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}
/** Executado antes do React montar; o modo sistema acompanha alterações do Windows/Linux. */
export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}
applyTheme(readTheme())
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (readTheme() === 'system') applyTheme('system')
})
