import { describe, it, expect } from 'vitest'

import { tween } from './animations.js'
import { Kinema, createRuntime } from './runtime.js'

describe('backward jump with while(true)', () => {
  it('jumps backward correctly after multiple cycles', () => {
    const log: string[] = []
    const runtime = createRuntime().build()

    const workflow = Kinema.gen(function* () {
      let iteration = 0
      while (true) {
        iteration++
        log.push(`iter-${iteration}-start`)
        yield* tween(100, (t) => {
          log.push(`iter-${iteration}-tween-${Math.round(t * 100)}`)
        })
        log.push(`iter-${iteration}-end`)
      }
    })

    runtime.run(workflow, 0)

    // Tick through 3 full cycles (each = 100ms)
    runtime.tick(50) // cycle 1 mid
    runtime.tick(100) // cycle 1 end
    runtime.tick(150) // cycle 2 mid
    runtime.tick(200) // cycle 2 end
    runtime.tick(250) // cycle 3 mid
    runtime.tick(300) // cycle 3 end

    const _stateAt300 = [...log]
    log.length = 0

    // Jump backward to t=50 (cycle 1 mid)
    runtime.tick(50)

    // Should see cycle 1 state again
    expect(log.some((l) => l.includes('iter-1'))).toBe(true)
    expect(log.some((l) => l.includes('iter-3'))).toBe(false)
  })

  it('jumps backward to intermediate cycle after multiple cycles', () => {
    const log: string[] = []
    const runtime = createRuntime().build()

    const workflow = Kinema.gen(function* () {
      let iteration = 0
      while (true) {
        iteration++
        log.push(`iter-${iteration}-start`)
        yield* tween(100, (t) => {
          log.push(`iter-${iteration}-tween-${Math.round(t * 100)}`)
        })
        log.push(`iter-${iteration}-end`)
      }
    })

    runtime.run(workflow, 0)

    // Tick through 3 full cycles
    runtime.tick(50)
    runtime.tick(100)
    runtime.tick(150)
    runtime.tick(200)
    runtime.tick(250)
    runtime.tick(300)

    log.length = 0

    // Jump backward to t=150 (cycle 2 mid)
    runtime.tick(150)

    // Should see cycle 1 completed and cycle 2 in progress
    expect(log.some((l) => l.includes('iter-1'))).toBe(true)
    expect(log.some((l) => l.includes('iter-2'))).toBe(true)
    expect(log.some((l) => l.includes('iter-3'))).toBe(false)
  })

  it('jumps backward with fork inside while(true)', () => {
    const log: string[] = []
    const runtime = createRuntime().build()

    const inner = Kinema.gen(function* () {
      yield* tween(50, (_t) => {
        log.push('inner-tween')
      })
    })

    const workflow = Kinema.gen(function* () {
      let iteration = 0
      while (true) {
        iteration++
        log.push(`iter-${iteration}-start`)
        const fork = yield* Kinema.fork(inner)
        yield* tween(100, (t) => {
          log.push(`iter-${iteration}-tween-${Math.round(t * 100)}`)
        })
        yield* Kinema.join(fork)
        log.push(`iter-${iteration}-end`)
      }
    })

    runtime.run(workflow, 0)

    // Tick through 3 full cycles (each = 100ms for tween + fork runs in parallel)
    runtime.tick(50)
    runtime.tick(100)
    runtime.tick(150)
    runtime.tick(200)
    runtime.tick(250)
    runtime.tick(300)

    log.length = 0

    // Jump backward to t=50 (cycle 1 mid)
    runtime.tick(50)

    // Should see cycle 1 state
    expect(log.some((l) => l.includes('iter-1'))).toBe(true)
    expect(log.some((l) => l.includes('iter-3'))).toBe(false)
  })

  it('fork/all inside while(true) - old fork children cleaned up on backward jump', () => {
    const tickLog: string[] = []
    let forkId = 0
    const runtime = createRuntime().build()

    const forkChild = Kinema.gen(function* () {
      const myId = ++forkId
      yield* tween(100, (t) => {
        tickLog.push(`fork-${myId}:${Math.round(t * 100)}`)
      })
    })

    const workflow = Kinema.gen(function* () {
      while (true) {
        yield* Kinema.fork(forkChild)
        yield* Kinema.all(
          tween(80, () => {}),
          tween(80, () => {}),
        )
        yield* tween(50, () => {})
      }
    })

    runtime.run(workflow, 0)

    // Forward through first cycle (fork 100ms, all 80ms, tween 50ms)
    runtime.tick(0)
    runtime.tick(100)
    runtime.tick(180)
    runtime.tick(230)

    // Forward through second cycle
    runtime.tick(250)
    runtime.tick(330)
    runtime.tick(380)

    tickLog.length = 0
    const forksBefore = forkId

    // Jump backward to t=20 (back into first cycle territory)
    runtime.tick(20)

    // Old fork children from cycles 1 and 2 should NOT have been ticked.
    // Only the NEW fork child (id=forksBefore+1) should have been ticked.
    const oldForkTicks = tickLog.filter((l) => {
      const match = l.match(/^fork-(\d+):/)
      return match && Number(match[1]) < forksBefore + 1
    })
    expect(oldForkTicks).toEqual([])
    // New fork child should be active
    const newForkTicks = tickLog.filter((l) => {
      const match = l.match(/^fork-(\d+):/)
      return match && Number(match[1]) === forksBefore + 1
    })
    expect(newForkTicks.length).toBeGreaterThan(0)
  })

  it('fork/all backward jump - fiber count stays bounded', () => {
    const runtime = createRuntime().build()

    const forkChild = Kinema.gen(function* () {
      yield* tween(100, () => {})
    })

    const workflow = Kinema.gen(function* () {
      while (true) {
        yield* Kinema.fork(forkChild)
        yield* Kinema.all(
          tween(80, () => {}),
          tween(80, () => {}),
        )
        yield* tween(50, () => {})
      }
    })

    runtime.run(workflow, 0)

    // Tick through 3 cycles
    runtime.tick(0)
    runtime.tick(100)
    runtime.tick(180)
    runtime.tick(230)
    runtime.tick(300)
    runtime.tick(380)
    runtime.tick(430)

    const statsAfterForward = runtime.stats()

    // Jump backward multiple times
    runtime.tick(20)
    runtime.tick(50)
    runtime.tick(200)
    runtime.tick(30)
    runtime.tick(400)

    const statsAfterJumps = runtime.stats()

    // Fibers should not grow unboundedly
    // After 3 forward cycles + backward jumps, active fibers should be small
    expect(statsAfterJumps.fibersActive).toBeLessThanOrEqual(statsAfterForward.fibersActive + 5)
  })

  it('suppresses callbacks during backward rebuild', () => {
    const callbackCount = { current: 0 }
    const runtime = createRuntime().build()

    const workflow = Kinema.gen(function* () {
      while (true) {
        yield* tween(100, (_t) => {
          callbackCount.current++
        })
      }
    })

    runtime.run(workflow, 0)
    runtime.tick(100) // cycle 1 done
    runtime.tick(200) // cycle 2 done
    runtime.tick(300) // cycle 3 done

    callbackCount.current = 0

    // Backward jump to t=150 (mid cycle 2)
    runtime.tick(150)

    // During rebuild, completed clips (cycle 1 tween + cycle 2 tween)
    // should NOT fire their callbacks. Only the active clip tick
    // in the normal tickFiber loop fires once.
    expect(callbackCount.current).toBeLessThanOrEqual(2)
  })
})
