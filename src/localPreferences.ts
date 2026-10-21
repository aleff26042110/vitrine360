export function readPreference(key: string, fallback = ''): string {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

export function readStringList(key: string, fallback: string[] = []): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    return Array.isArray(value) && value.every(item => typeof item === 'string') ? [...new Set(value)] : fallback
  } catch { return fallback }
}
