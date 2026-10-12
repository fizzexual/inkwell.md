// Load something expensive (an on-device model…) once and share it between callers.

export interface Loader<T> {
  (): Promise<T>;
  /** True once a load has succeeded. */
  ready: () => boolean;
}

/**
 * Calls `load` on first use and caches the promise; same-time callers share one load.
 * A failed load is NOT cached: the error goes to the callers and the next call tries again
 * (e.g. the model download failed while offline).
 */
export function loadOnce<T>(load: () => Promise<T>): Loader<T> {
  let value: { v: T } | null = null;
  let pending: Promise<T> | null = null;
  const get = (() => {
    if (value) return Promise.resolve(value.v);
    if (!pending) {
      pending = load().then(
        (v) => {
          value = { v };
          return v;
        },
        (err) => {
          pending = null;
          throw err;
        },
      );
    }
    return pending;
  }) as Loader<T>;
  get.ready = () => !!value;
  return get;
}
