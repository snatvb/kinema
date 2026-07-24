/// <reference lib="dom" />

import { Clip, createRuntime, tag, tween, delay } from './index.js'

const ConsoleTag = tag<{ log: (...args: unknown[]) => void }>()('ConsoleTag')
const HelloTag = tag<() => void>()('HelloTag')
const RendererTag = tag<{ canvas: HTMLCanvasElement }>()('RendererTag')

// ============================================================
// Clips
// ============================================================

const clipNoDeps = Clip.succeed(42)

const clipRequiresConsole = Clip.gen(function* () {
  const c = yield* Clip.use(ConsoleTag)
  c.log('hello from gen')
  return c
})

const clipRequiresBoth = Clip.gen(function* () {
  const c = yield* Clip.use(ConsoleTag)
  const h = yield* Clip.use(HelloTag)
  c.log('both')
  h()
  return { c, h }
})

const clipRequiresRenderer = Clip.gen(function* () {
  const r = yield* Clip.use(RendererTag)
  return r.canvas
})

// ============================================================
// Case 1: runtime without providers — should ERROR on clips with deps
// ============================================================

const rt1 = createRuntime().build()

rt1.run(clipNoDeps, 0) // OK — clip has no deps

// @ts-expect-error — ConsoleTag not provided
rt1.run(clipRequiresConsole, 0)

// @ts-expect-error — ConsoleTag and HelloTag not provided
rt1.run(clipRequiresBoth, 0)

// ============================================================
// Case 2: runtime with all providers — should NOT error
// ============================================================

const rt2 = createRuntime()
  .provide(ConsoleTag, { log: console.log })
  .provide(HelloTag, () => {})
  .build()

rt2.run(clipNoDeps, 0) // OK
rt2.run(clipRequiresConsole, 0) // OK — ConsoleTag provided
rt2.run(clipRequiresBoth, 0) // OK — both provided

// ============================================================
// Case 3: runtime with partial providers — TS allows, runtime checks
// ============================================================

const rt3 = createRuntime().provide(ConsoleTag, { log: console.log }).build()

rt3.run(clipNoDeps, 0) // OK
rt3.run(clipRequiresConsole, 0) // OK — ConsoleTag provided

// @ts-expect-error — HelloTag not provided (tags are now distinguishable at type level)
rt3.run(clipRequiresBoth, 0)

// ============================================================
// Case 4: Clip.provide at clip level — satisfies deps
// ============================================================

const clipWithProvide = Clip.provide(ConsoleTag, { log: console.log })(
  Clip.gen(function* () {
    const c = yield* Clip.use(ConsoleTag)
    c.log('provided at clip level')
    return c
  }),
)

rt1.run(clipWithProvide, 0) // OK — deps satisfied via Clip.provide

// ============================================================
// Case 5: Clip.provide partial — still needs runtime deps
// ============================================================

const clipHalfProvided = Clip.provide(ConsoleTag, { log: console.log })(
  Clip.gen(function* () {
    const c = yield* Clip.use(ConsoleTag)
    const h = yield* Clip.use(HelloTag)
    c.log('partial')
    h()
    return { c, h }
  }),
)

// @ts-expect-error — HelloTag still required, not provided by rt1
rt1.run(clipHalfProvided, 0)

// OK — only HelloTag needed at runtime, provided via builder
const rtHalf = createRuntime()
  .provide(HelloTag, () => {})
  .build()
rtHalf.run(clipHalfProvided, 0)

// ============================================================
// Case 6: tween/delay — no deps, always OK
// ============================================================

const clipTween = tween(1000, (t) => {
  console.log(t)
})

const clipDelay = delay(500)

rt1.run(clipTween, 0) // OK
rt1.run(clipDelay, 0) // OK

// ============================================================
// Case 7: chained generators — deps accumulate
// ============================================================

const clipChained = Clip.gen(function* () {
  yield* tween(500, () => {})
  const c = yield* Clip.use(ConsoleTag)
  yield* delay(200)
  c.log('chained')
  const h = yield* Clip.use(HelloTag)
  h()
  return 'done'
})

// @ts-expect-error — ConsoleTag and HelloTag not provided by rt1
rt1.run(clipChained, 0)

// @ts-expect-error — HelloTag not provided by rt3
rt3.run(clipChained, 0)

rt2.run(clipChained, 0) // OK — both provided

// ============================================================
// Case 8: fork/join — deps from forked clip propagate
// ============================================================

const clipFork = Clip.gen(function* () {
  const fork = yield* Clip.fork(clipRequiresConsole)
  yield* Clip.join(fork)
  return 'forked'
})

// @ts-expect-error — forked clip's ConsoleTag dep propagates, not provided by rt1
rt1.run(clipFork, 0)

rt3.run(clipFork, 0) // OK — ConsoleTag provided in rt3

// ============================================================
// Case 9: multiple .provide() calls — builder accumulates
// ============================================================

const rtMulti = createRuntime()
  .provide(ConsoleTag, { log: console.log })
  .provide(HelloTag, () => {})
  .provide(RendererTag, { canvas: null as unknown as HTMLCanvasElement })
  .build()

rtMulti.run(clipRequiresRenderer, 0) // OK
rtMulti.run(clipRequiresBoth, 0) // OK

// ============================================================
// Case 10: wrong value type — should ERROR
// ============================================================

const _rtWrongType = createRuntime()
  // @ts-expect-error — string is not assignable to { log: (...args: unknown[]) => void }
  .provide(ConsoleTag, 'not a logger')
  .build()

// ============================================================
// Case 11: providing same tag twice — last wins (no error)
// ============================================================

const rtOverride = createRuntime()
  .provide(ConsoleTag, { log: console.log })
  .provide(ConsoleTag, { log: () => {} }) // override
  .build()

rtOverride.run(clipRequiresConsole, 0) // OK
