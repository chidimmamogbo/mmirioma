/**
 * Load a mock module on first use, and only in builds that serve mocks.
 *
 * The mock layer (`src/mocks/`) holds sample accounts, phone numbers and a
 * demo password. A production build must not contain them: anyone can read a
 * downloaded site's JavaScript, and a demo value in it reads as a real one
 * (#236). Each caller therefore passes the loader behind the build-time
 * constant `__USE_MOCKS__` (see `vite.config.ts`):
 *
 * ```ts
 * const mock = lazyMock(__USE_MOCKS__ && (() => import('../../mocks/fooMock')))
 * ```
 *
 * When the constant is `false`, the bundler folds the expression to `false`,
 * drops the `import()` and emits no mock chunk at all.
 */

/** The module's functions, each now returning a promise because the module loads on first call. */
export type LazyMock<M> = {
  [K in keyof M as M[K] extends (...args: never[]) => unknown ? K : never]: M[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never
}

/**
 * Wrap a mock module so its functions load it on first call.
 *
 * @param load - The dynamic import, or `false` in a build without mocks. Calling any function then rejects: that is
 *   a bug in the caller, since mock functions are only reached when `USE_MOCKS` is true.
 * @returns An object with the module's functions; the module loads once, on the first call.
 */
export function lazyMock<M>(load: false | (() => Promise<M>)): LazyMock<M> {
  let loaded: Promise<M> | undefined
  const module = () => {
    if (!load) return Promise.reject(new Error('Mock data is not part of this build.'))
    return (loaded ??= load())
  }
  return new Proxy({} as LazyMock<M>, {
    get: (_target, name) => (...args: unknown[]) =>
      module().then((m) => (m as Record<string | symbol, (...a: unknown[]) => unknown>)[name](...args)),
  })
}
