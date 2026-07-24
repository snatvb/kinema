import { tag, createRuntime, Clip } from './runtime.js'

const ConsoleTag = tag<{ log: (...args: unknown[]) => void }>()('ConsoleTag')
const HelloTag = tag<() => void>()('HelloTag')

// Test that tag produces correct types
const _consoleTag: typeof ConsoleTag = ConsoleTag
const _helloTag: typeof HelloTag = HelloTag

// Test provide/use works end-to-end
const clip = Clip.gen(function* () {
  const c = yield* Clip.use(ConsoleTag)
  const h = yield* Clip.use(HelloTag)
  c.log('test')
  h()
})

const rt = createRuntime()
  .provide(ConsoleTag, { log: console.log })
  .provide(HelloTag, () => {})
  .build()

rt.run(clip, 0)
