export type SavePhase = 'pending' | 'saving' | 'saved' | 'error'
export function saveFailureMessage(error: unknown) {
  return error instanceof Error && error.name === 'QuotaExceededError'
    ? 'Falha ao salvar: espaço insuficiente. Faça backup e libere espaço neste navegador.'
    : `Falha ao salvar: ${error instanceof Error ? error.message : 'armazenamento indisponível'}`
}

/** Owns a debounce and one write, coalesces later snapshots, and retains failed work for retry. */
export function createAutosave<T>(write: (snapshot: T) => Promise<unknown>, report: (phase: SavePhase, error?: unknown) => void, delay = 350) {
  let pending: { value: T } | null = null, running: Promise<void> | null = null, timer: ReturnType<typeof setTimeout> | undefined
  function flush(): Promise<void> {
    clearTimeout(timer); timer = undefined
    if (running) return running.then(() => flush())
    const task = pending; if (!task) return Promise.resolve()
    pending = null; report('saving')
    running = Promise.resolve().then(() => write(task.value)).then(() => { if (!pending) report('saved') }).catch(error => {
      if (!pending) pending = task
      report('error',error); throw error
    }).finally(() => { running = null })
    return running
  }
  return {
    schedule(value: T) { pending = { value }; clearTimeout(timer); report('pending'); timer = setTimeout(() => { void flush().catch(() => {}) },delay) },
    flush,
    hasUnsaved: () => Boolean(pending || running),
    dispose() { clearTimeout(timer); timer = undefined; return flush() },
  }
}

const writes = new Map<string,Promise<unknown>>()
/** Orders invocations at the storage boundary, including explicit preview/publication writes. */
export function serializeLocalWrite<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const result = (writes.get(key) ?? Promise.resolve()).catch(() => {}).then(operation)
  writes.set(key,result)
  const release = () => { if (writes.get(key) === result) writes.delete(key) }
  result.then(release,release)
  return result
}
