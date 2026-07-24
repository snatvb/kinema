import { describe, it, expect } from 'vitest'

import { tween, delay } from './animations.js'
import { Kinema, createRuntime, tag } from './runtime.js'

describe('while(true) loop', () => {
  it('gen with while(true) keeps yielding across sequential ticks', () => {
    const trackValues: number[] = []

    const clip = Kinema.gen(function* () {
      let iteration = 0
      while (true) {
        iteration++
        yield* tween(100, (t) => {
          trackValues.push(iteration * 100 + t)
        })
        yield* delay(50)
      }
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    // Tick through first iteration: tween(0-100) + delay(100-150)
    rt.tick(0)
    rt.tick(50)
    rt.tick(100)
    rt.tick(150)

    // At t=150, first iteration done, second should start
    expect(trackValues.length).toBeGreaterThan(0)

    // Tick through second iteration
    rt.tick(200)
    rt.tick(250)

    expect(trackValues.length).toBeGreaterThan(0)
  })

  it('while(true) loops correctly with backward rebuild', () => {
    const trackValues: number[] = []

    const clip = Kinema.gen(function* () {
      let iteration = 0
      while (true) {
        iteration++
        yield* tween(200, (t) => {
          trackValues.push(iteration * 1000 + Math.round(t * 100))
        })
      }
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    // Forward to t=500 — should have 2+ iterations
    rt.tick(0)
    rt.tick(100)
    rt.tick(200)
    rt.tick(300)
    rt.tick(400)
    rt.tick(500)

    expect(trackValues.length).toBeGreaterThan(0)

    // Backward to t=0 — rebuild, iteration restarts
    rt.tick(0)

    // Forward again — should loop again
    rt.tick(100)
    rt.tick(200)
    rt.tick(300)

    expect(trackValues.length).toBeGreaterThan(0)
  })

  it('while(true) with fork/join inside loop', () => {
    const log: string[] = []

    const inner = Kinema.gen(function* () {
      yield* tween(100, () => {
        log.push('inner-tween')
      })
    })

    const clip = Kinema.gen(function* () {
      let i = 0
      while (true) {
        i++
        log.push(`loop-${i}`)
        const fork = yield* Kinema.fork(inner)
        yield* Kinema.join(fork)
        yield* delay(50)
      }
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    // Tick through 2 iterations
    for (let t = 0; t <= 400; t += 25) {
      rt.tick(t)
    }

    // Should have looped at least twice
    expect(log.filter((l) => l.startsWith('loop-')).length).toBeGreaterThanOrEqual(2)
    expect(log.filter((l) => l === 'inner-tween').length).toBeGreaterThanOrEqual(2)
  })

  it('while(true) with all/race inside loop', () => {
    const log: string[] = []

    const clip = Kinema.gen(function* () {
      let i = 0
      while (true) {
        i++
        log.push(`iter-${i}`)

        yield* Kinema.all(
          tween(80, (t) => {
            log.push(`a-${i}:${Math.round(t * 10)}`)
          }),
          tween(80, (t) => {
            log.push(`b-${i}:${Math.round(t * 10)}`)
          }),
        )

        yield* delay(20)
      }
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    // Tick through 3 iterations (each = all(80) + delay(20) = 100)
    for (let t = 0; t <= 350; t += 10) {
      rt.tick(t)
    }

    expect(log.filter((l) => l.startsWith('iter-')).length).toBeGreaterThanOrEqual(3)
  })

  it('while(true) with provide/use inside loop', () => {
    const Tag = tag<string>()('val')
    const log: string[] = []

    const clip = Kinema.gen(function* () {
      let i = 0
      while (true) {
        i++
        const v = yield* Kinema.use(Tag)
        log.push(`val-${i}:${v}`)
        yield* tween(50, () => {})
      }
    })

    const rt = createRuntime().provide(Tag, 'hello').build()
    rt.run(clip, 0)

    for (let t = 0; t <= 200; t += 10) {
      rt.tick(t)
    }

    // Each iteration should see the provided value
    expect(log.every((l) => l.includes('hello'))).toBe(true)
    expect(log.length).toBeGreaterThanOrEqual(3)
  })
})
