/**
 * The Nuxt test environment supplies a `localStorage` object that is missing
 * the Storage methods, so any code that calls getItem/setItem throws
 * `localStorage.getItem is not a function`. Application code guards against
 * this (see api/api-client.ts), but third-party plugins do not -
 * @nuxtjs/color-mode writes a preference on startup and floods every run with
 * a caught-but-noisy initialization error.
 *
 * Installing a real in-memory Storage keeps the suite's output readable and
 * lets tests that care about persistence actually assert on it.
 */
function createStorage(): Storage {
  let store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(String(key)) ?? null,
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value))
    },
    removeItem: (key: string) => {
      store.delete(String(key))
    },
    clear: () => {
      store = new Map()
    },
  } satisfies Storage
}

function isUsable(candidate: unknown): boolean {
  return typeof (candidate as Storage | undefined)?.getItem === 'function'
}

for (const target of [globalThis, globalThis.window].filter(Boolean)) {
  if (!isUsable((target as typeof globalThis).localStorage)) {
    Object.defineProperty(target, 'localStorage', {
      value: createStorage(),
      configurable: true,
      writable: true,
    })
  }
}
