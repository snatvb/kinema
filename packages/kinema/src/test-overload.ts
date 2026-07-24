import { tag, createRuntime, Clip } from './runtime.js'

const ConsoleTag = tag<{ log: (...args: unknown[]) => void }>()('ConsoleTag')
const HelloTag = tag<() => void>()('HelloTag')

// Test builder with multiple providers
const rt = createRuntime()
  .provide(ConsoleTag, { log: console.log })
  .provide(HelloTag, () => {})
  .build()

// Test use + gen with provided deps
const clip = Clip.gen(function* () {
  const c = yield* Clip.use(ConsoleTag)
  c.log('test')
})
rt.run(clip, 0)
