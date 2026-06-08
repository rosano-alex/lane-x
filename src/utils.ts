/**
 * Left-to-right function composition.
 *
 *   const formatted = pipe(celsius.get(), toCelsius, round, toLabel)
 */
export function pipe<A>(a: A): A;
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
): D;
export function pipe<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E;
export function pipe(value: unknown, ...fns: Array<(v: unknown) => unknown>): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}

/**
 * Composes functions right-to-left.
 *   const transform = compose(toLabel, round, toCelsius)
 *   transform(rawValue)
 */
export function compose<T>(...fns: Array<(v: T) => T>): (v: T) => T {
  return (value: T) => fns.reduceRight((acc, fn) => fn(acc), value);
}
