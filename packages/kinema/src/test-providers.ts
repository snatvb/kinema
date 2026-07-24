import { tag, createRuntime, Clip } from './runtime.js'

const ConsoleTag = tag<{ log: (...args: unknown[]) => void }>()('ConsoleTag')
const HelloTag = tag<() => void>()('HelloTag')

// With provide — should work
const rt1 = createRuntime().provide(ConsoleTag, { log: console.log }).build()

// Without provide — clip requiring deps will fail at runtime
const clip = Clip.gen(function* () {
  yield* Clip.use(ConsoleTag)
  yield* Clip.use(HelloTag)
})
// @ts-expect-error — HelloTag not provided; tags are now distinguishable at type level
rt1.run(clip, 0) // would also throw at runtime: Missing dependency for HelloTag
