/* oxlint-disable no-unused-vars */
// Test: invariant R through phantom property
interface ClipInvariant<A, I = never, R = never> {
  readonly [Symbol.iterator]: () => Generator<ClipInvariant<A, I, R>, A, any>
  readonly cmd: string
  readonly duration: number
  // Phantom: R in covariant position (return type) → R is invariant
  readonly _r?: () => R
}

// Does ClipInvariant<void, never, {foo:string}> assign to ClipInvariant<void, never, never>?
type D1 =
  ClipInvariant<void, never, { foo: string }> extends ClipInvariant<void, never, never>
    ? 'yes'
    : 'no'

function testC<A, I, R extends never>(clip: ClipInvariant<A, I, R>): void {}
declare const clipC: ClipInvariant<void, never, { foo: string }>
// @ts-expect-error — R = { foo: string } is not assignable to never
testC(clipC) // should error with invariant R
