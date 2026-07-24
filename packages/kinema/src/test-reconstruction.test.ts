import { describe, it, expect, vi } from 'vitest'

import { delay, tween } from './animations.js'
import { Kinema, createRuntime, tag } from './runtime.js'

function _createMockClip(duration: number, onUpdate?: (t: number) => void) {
  return Kinema.create<void>(duration, () => ({
    tick(localTime: number) {
      const progress = Math.max(0, Math.min(localTime / duration, 1))
      onUpdate?.(progress)
    },
    destroy() {},
  }))
}

type State = { x: number; y: number; z: number }
const StateTag = tag<State>()('State')
const makeState = (): State => ({ x: 0, y: 0, z: 0 })
const resetState = (state: State) => {
  state.x = 0
  state.y = 0
  state.z = 0
  return state
}

describe('reconstruction', () => {
  it('sequential ticks do not trigger reconstruction', () => {
    const onUpdate = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* tween(500, onUpdate)
      return 'done'
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(0)

    rt.tick(250)
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenCalledWith(0.5)

    rt.tick(500)
    expect(onUpdate).toHaveBeenCalledTimes(3)
    expect(onUpdate).toHaveBeenCalledWith(1)
  })

  it('forward jump applies final state', () => {
    const onUpdate = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* tween(500, onUpdate)
      return 'done'
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    vi.clearAllMocks()

    rt.tick(600)
    expect(onUpdate).toHaveBeenCalledWith(1)
  })

  it('backward jump restarts tween', () => {
    const onUpdate = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* tween(500, onUpdate)
      return 'done'
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(400)
    expect(onUpdate).toHaveBeenCalledWith(0.8)
    vi.clearAllMocks()

    rt.tick(100)
    expect(onUpdate).toHaveBeenCalledWith(0.2)
  })

  it('fork without join - child ticks independently', () => {
    const parentUpdate = vi.fn()
    const childUpdate = vi.fn()
    const childClip = tween(500, childUpdate)

    const clip = Kinema.gen(function* () {
      yield* Kinema.fork(childClip)
      yield* tween(1000, parentUpdate)
      return 'done'
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(250)
    expect(parentUpdate).toHaveBeenCalledWith(0.25)
    expect(childUpdate).toHaveBeenCalledWith(0.5)

    rt.tick(500)
    expect(parentUpdate).toHaveBeenCalledWith(0.5)
    expect(childUpdate).toHaveBeenCalledWith(1)
  })

  it('fork with join - parent waits for child then continues', () => {
    const childUpdate = vi.fn()
    const afterJoin = vi.fn()
    const childClip = tween(500, childUpdate)

    const clip = Kinema.gen(function* () {
      const fork = yield* Kinema.fork(childClip)
      yield* Kinema.join(fork)
      yield* tween(200, afterJoin)
      return 'done'
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)

    rt.tick(250)
    expect(childUpdate).toHaveBeenCalledWith(0.5)
    expect(afterJoin).not.toHaveBeenCalled()

    rt.tick(500)
    expect(childUpdate).toHaveBeenCalledWith(1)
    expect(afterJoin).toHaveBeenCalledWith(0)

    rt.tick(700)
    expect(afterJoin).toHaveBeenCalledWith(1)
  })

  it('provide/use context - values available during reconstruction', () => {
    const MyTag = tag<string>()('mytag')
    const values: string[] = []

    const innerClip = Kinema.gen(function* () {
      const value = yield* Kinema.use(MyTag)
      values.push(value)
      yield* tween(500, () => {})
      return 'done'
    })

    const clip = Kinema.provide(MyTag, 'hello')(innerClip)

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    expect(values).toEqual(['hello'])

    rt.tick(200)
    expect(values).toEqual(['hello'])

    vi.clearAllMocks()
    rt.tick(600)
    expect(values).toEqual(['hello'])
  })

  it('multiple tweens - all intermediate states correct', () => {
    const update1 = vi.fn()
    const update2 = vi.fn()
    const update3 = vi.fn()

    const clip = Kinema.gen(function* () {
      yield* tween(300, update1)
      yield* tween(300, update2)
      yield* tween(300, update3)
      return 'done'
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(150)
    expect(update1).toHaveBeenCalledWith(0.5)

    rt.tick(400)
    expect(update1).toHaveBeenCalledWith(1)
    expect(update2).toHaveBeenCalledWith(100 / 300)

    rt.tick(700)
    expect(update2).toHaveBeenCalledWith(1)
    expect(update3).toHaveBeenCalledWith(100 / 300)

    vi.clearAllMocks()
    rt.tick(200)
    expect(update1).toHaveBeenCalledWith(200 / 300)
    expect(update2).not.toHaveBeenCalled()
  })

  it('no premature completion during sequential ticks', () => {
    const completionSpy = vi.fn()

    const clip = Kinema.gen(function* () {
      yield* tween(500, () => {})
      yield* tween(500, () => {})
      completionSpy()
      return 'done'
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(100)
    rt.tick(200)
    rt.tick(300)
    rt.tick(400)
    rt.tick(500)
    rt.tick(600)
    rt.tick(700)

    expect(completionSpy).not.toHaveBeenCalled()

    rt.tick(1000)
    expect(completionSpy).toHaveBeenCalledTimes(1)
  })

  it('join with backward jump - child state reconstructed correctly', () => {
    const childUpdate = vi.fn()
    const childClip = tween(500, childUpdate)

    const clip = Kinema.gen(function* () {
      const fork = yield* Kinema.fork(childClip)
      yield* Kinema.join(fork)
      yield* tween(200, () => {})
      return 'done'
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(250)
    expect(childUpdate).toHaveBeenCalledWith(0.5)

    vi.clearAllMocks()
    rt.tick(100)
    expect(childUpdate).toHaveBeenCalledWith(0.2)
  })

  it('backward big jumps', () => {
    const workflowYZ = Kinema.gen(function* () {
      const state = yield* Kinema.use(StateTag)
      yield* delay(100)

      yield* Kinema.fork(
        tween(1100, (t) => {
          state.z = 1100 * t
        }),
      )
      yield* tween(1100, (t) => {
        state.y = 1100 * t
      })
    })

    const workflow = Kinema.gen(function* () {
      while (true) {
        const state = resetState(yield* Kinema.use(StateTag))
        yield* tween(500, (t) => {
          state.x = t * 5
        })
        yield* delay(100)

        const yFiber = yield* Kinema.fork(workflowYZ)
        const targetX = yield* Kinema.succeed(250)

        yield* tween(1000, (t) => {
          state.x = targetX * t
        })
        yield* Kinema.join(yFiber)
      }
    })

    const state = makeState()
    const rt = createRuntime().provide(StateTag, state).build()
    rt.run(workflow, 0)
    rt.tick(800)
    expect(state.x).toBe(50)
    expect(state.y).toBe(100)
    rt.tick(200)
    expect(state.x).toBe((200 / 500) * 5)
    expect(state.y).toBe(0)
    expect(state.z).toBe(0)
    rt.tick(1800)
    expect(state.x).toBe(0)
    expect(state.y).toBe(0)
    rt.tick(1800 + 800)
    expect(state.x).toBe(50)
    expect(state.y).toBe(100)
    expect(state.z).toBe(100)
    rt.tick(500)
    expect(state.x).toBe(5)
    expect(state.y).toBe(0)
    expect(state.z).toBe(0)
  })

  it('spawn works independed', () => {
    const workflowY = Kinema.gen(function* () {
      const state = yield* Kinema.use(StateTag)
      yield* tween(1000, (t) => {
        state.y = t * 1000
      })
    })

    const workflow = Kinema.gen(function* () {
      const state = resetState(yield* Kinema.use(StateTag))
      yield* Kinema.spawn(workflowY)
      yield* tween(500, (t) => {
        state.x = t * 500
      })
    })

    const state = makeState()
    const rt = createRuntime().provide(StateTag, state).build()
    rt.run(workflow, 0)
    rt.tick(200)
    expect(state.x).toBe(200)
    expect(state.y).toBe(200)

    rt.tick(600)
    expect(state.x).toBe(500)
    expect(state.y).toBe(600)

    rt.tick(800)
    expect(state.x).toBe(500)
    expect(state.y).toBe(800)
  })

  it('join returns child value', () => {
    const childClip = Kinema.gen(function* () {
      yield* tween(500, () => {})
      return 42
    })

    const clip = Kinema.gen(function* () {
      const fiber = yield* Kinema.fork(childClip)
      const result = yield* Kinema.join(fiber)
      return result
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(600)
  })

  it('all - parallel execution, results in order', () => {
    const clipA = Kinema.gen(function* () {
      yield* tween(300, () => {})
      return 'a'
    })
    const clipB = Kinema.gen(function* () {
      yield* tween(500, () => {})
      return 'b'
    })
    const clipC = Kinema.gen(function* () {
      yield* tween(200, () => {})
      return 'c'
    })

    const clip = Kinema.gen(function* () {
      const results = yield* Kinema.all(clipA, clipB, clipC)
      return results
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(600)
  })

  it('all - waits for slowest', () => {
    const updateA = vi.fn()
    const updateB = vi.fn()
    const allDone = vi.fn()

    const clipA = tween(300, updateA)
    const clipB = tween(600, updateB)

    const clip = Kinema.gen(function* () {
      yield* Kinema.all(clipA, clipB)
      allDone()
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(400)
    expect(updateA).toHaveBeenCalledWith(1)
    expect(allDone).not.toHaveBeenCalled()

    rt.tick(700)
    expect(updateB).toHaveBeenCalledWith(1)
    expect(allDone).toHaveBeenCalledTimes(1)
  })

  it('race - first completes, others destroyed', () => {
    const updateA = vi.fn()
    const updateB = vi.fn()
    const updateC = vi.fn()
    const afterRace = vi.fn()

    const clipA = tween(200, updateA)
    const clipB = tween(500, updateB)
    const clipC = tween(800, updateC)

    const clip = Kinema.gen(function* () {
      yield* Kinema.race(clipA, clipB, clipC)
      afterRace()
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(250)
    expect(updateA).toHaveBeenCalledWith(1)
    expect(afterRace).toHaveBeenCalledTimes(1)
    vi.clearAllMocks()
    rt.tick(500)
    expect(updateA).not.toHaveBeenCalled()
    expect(updateB).not.toHaveBeenCalled()
    expect(updateC).not.toHaveBeenCalled()
  })

  it('race - second wins if first is slow', () => {
    const updateA = vi.fn()
    const updateB = vi.fn()

    const clipA = tween(800, updateA)
    const clipB = tween(200, updateB)

    const clip = Kinema.gen(function* () {
      yield* Kinema.race(clipA, clipB)
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(250)
    expect(updateB).toHaveBeenCalledWith(1)
  })

  it('repeat - executes n times', () => {
    const completedIterations = { count: 0 }

    const clip = Kinema.gen(function* () {
      yield* Kinema.repeat(
        3,
        Kinema.gen(function* () {
          yield* tween(100, () => {})
          completedIterations.count++
        }),
      )
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    expect(completedIterations.count).toBe(0)
    rt.tick(100)
    expect(completedIterations.count).toBe(1)
    rt.tick(200)
    expect(completedIterations.count).toBe(2)
    rt.tick(300)
    expect(completedIterations.count).toBe(3)
  })

  it('race with backward jump - reconstruction works', () => {
    const updateA = vi.fn()
    const updateB = vi.fn()

    const clipA = tween(500, updateA)
    const clipB = tween(300, updateB)

    const clip = Kinema.gen(function* () {
      yield* Kinema.race(clipA, clipB)
      yield* tween(200, () => {})
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(100)
    expect(updateA).toHaveBeenCalledWith(0.2)
    expect(updateB).toHaveBeenCalledWith(100 / 300)

    vi.clearAllMocks()
    rt.tick(200)
    expect(updateA).toHaveBeenCalledWith(0.4)
    expect(updateB).toHaveBeenCalledWith(200 / 300)
  })

  it('all - backward jump reconstructs all children', () => {
    const updateA = vi.fn()
    const updateB = vi.fn()

    const clipA = tween(600, updateA)
    const clipB = tween(400, updateB)

    const clip = Kinema.gen(function* () {
      yield* Kinema.all(clipA, clipB)
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(300)
    expect(updateA).toHaveBeenCalledWith(0.5)
    expect(updateB).toHaveBeenCalledWith(0.75)

    vi.clearAllMocks()
    rt.tick(100)
    expect(updateA).toHaveBeenCalledWith(100 / 600)
    expect(updateB).toHaveBeenCalledWith(0.25)
  })

  it('all - forward jump skips to end', () => {
    const updateA = vi.fn()
    const updateB = vi.fn()
    const allDone = vi.fn()

    const clipA = tween(300, updateA)
    const clipB = tween(500, updateB)

    const clip = Kinema.gen(function* () {
      yield* Kinema.all(clipA, clipB)
      allDone()
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(700)
    expect(updateA).toHaveBeenCalledWith(1)
    expect(updateB).toHaveBeenCalledWith(1)
    expect(allDone).toHaveBeenCalledTimes(1)
  })

  it('race - backward jump reconstructs all children', () => {
    const updateA = vi.fn()
    const updateB = vi.fn()

    const clipA = tween(400, updateA)
    const clipB = tween(600, updateB)

    const clip = Kinema.gen(function* () {
      yield* Kinema.race(clipA, clipB)
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(300)
    expect(updateA).toHaveBeenCalledWith(0.75)
    expect(updateB).toHaveBeenCalledWith(0.5)

    vi.clearAllMocks()
    rt.tick(100)
    expect(updateA).toHaveBeenCalledWith(0.25)
    expect(updateB).toHaveBeenCalledWith(100 / 600)
  })

  it('race - forward jump to winner completion', () => {
    const updateA = vi.fn()
    const updateB = vi.fn()
    const afterRace = vi.fn()

    const clipA = tween(200, updateA)
    const clipB = tween(800, updateB)

    const clip = Kinema.gen(function* () {
      yield* Kinema.race(clipA, clipB)
      afterRace()
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(300)
    expect(updateA).toHaveBeenCalledWith(1)
    expect(afterRace).toHaveBeenCalledTimes(1)
  })

  it('repeat - backward jump reconstructs to correct iteration', () => {
    const update = vi.fn()

    const clip = Kinema.gen(function* () {
      yield* Kinema.repeat(
        3,
        Kinema.gen(function* () {
          yield* tween(100, (t) => update(t))
        }),
      )
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(250)
    expect(update).toHaveBeenCalledWith(1)

    vi.clearAllMocks()
    rt.tick(50)
    expect(update).toHaveBeenCalledWith(0.5)
  })

  it('repeat - forward jump skips iterations', () => {
    const completedIterations = { count: 0 }

    const clip = Kinema.gen(function* () {
      yield* Kinema.repeat(
        5,
        Kinema.gen(function* () {
          yield* tween(100, () => {})
          completedIterations.count++
        }),
      )
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(600)
    expect(completedIterations.count).toBe(5)
  })

  it('all - mixed direction changes', () => {
    const updateA = vi.fn()
    const updateB = vi.fn()

    const clipA = tween(1000, updateA)
    const clipB = tween(500, updateB)

    const clip = Kinema.gen(function* () {
      yield* Kinema.all(clipA, clipB)
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(400)
    expect(updateA).toHaveBeenCalledWith(0.4)
    expect(updateB).toHaveBeenCalledWith(0.8)

    vi.clearAllMocks()
    rt.tick(200)
    expect(updateA).toHaveBeenCalledWith(0.2)
    expect(updateB).toHaveBeenCalledWith(0.4)

    vi.clearAllMocks()
    rt.tick(600)
    expect(updateA).toHaveBeenCalledWith(0.6)
    expect(updateB).toHaveBeenCalledWith(1)
  })

  it('race - mixed direction changes', () => {
    const updateA = vi.fn()
    const updateB = vi.fn()

    const clipA = tween(800, updateA)
    const clipB = tween(400, updateB)

    const clip = Kinema.gen(function* () {
      yield* Kinema.race(clipA, clipB)
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(300)
    expect(updateA).toHaveBeenCalledWith(300 / 800)
    expect(updateB).toHaveBeenCalledWith(0.75)

    vi.clearAllMocks()
    rt.tick(100)
    expect(updateA).toHaveBeenCalledWith(0.125)
    expect(updateB).toHaveBeenCalledWith(0.25)

    vi.clearAllMocks()
    rt.tick(500)
    expect(updateB).toHaveBeenCalledWith(1)
  })

  it('pool: fiber returned after completion', () => {
    const clip = tween(100, () => {})
    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    expect(rt.stats().fibersActive).toBe(1)
    expect(rt.stats().fibersPool).toBe(0)
    rt.tick(100)
    expect(rt.stats().fibersActive).toBe(0)
    expect(rt.stats().fibersPool).toBe(1)
  })

  it('pool: all children returned to pool', () => {
    const clip = Kinema.gen(function* () {
      yield* Kinema.all(
        tween(100, () => {}),
        tween(100, () => {}),
      )
    })
    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(150)
    const s = rt.stats()
    expect(s.fibersActive).toBe(0)
    expect(s.fibersPool).toBeGreaterThanOrEqual(1)
  })

  it('pool: fork child returned to pool', () => {
    const child = Kinema.gen(function* () {
      yield* tween(100, () => {})
      return 42
    })
    const clip = Kinema.gen(function* () {
      const f = yield* Kinema.fork(child)
      yield* Kinema.join(f)
    })
    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(150)
    const s = rt.stats()
    expect(s.fibersActive).toBe(0)
    expect(s.fibersPool).toBeGreaterThanOrEqual(1)
  })

  it('pool: destroy returns all fibers', () => {
    const clip = Kinema.gen(function* () {
      yield* Kinema.spawn(tween(1000, () => {}))
      yield* tween(1000, () => {})
    })
    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(500)
    const before = rt.stats().fibersActive
    expect(before).toBeGreaterThanOrEqual(1)
    rt.destroy()
    expect(rt.stats().fibersActive).toBe(0)
    expect(rt.stats().fibersPool).toBeGreaterThanOrEqual(1)
  })

  it('pool: rebuild reuses fiber object', () => {
    const clip = tween(500, () => {})
    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    rt.tick(100)
    const firstFiber = rt.stats().fibersPool
    rt.tick(50)
    rt.tick(100)
    expect(rt.stats().fibersPool).toBe(firstFiber)
  })

  it('memory: no leak over many forward ticks', () => {
    const clip = tween(1000, () => {})
    const rt = createRuntime().build()
    rt.run(clip, 0)

    for (let i = 0; i < 100; i++) {
      rt.tick(i * 10)
    }

    const before = process.memoryUsage().heapUsed
    for (let i = 100; i < 10100; i++) {
      rt.tick(i * 10)
    }
    const after = process.memoryUsage().heapUsed

    expect(after - before).toBeLessThan(1024 * 1024)
  })

  it('memory: no leak over backward jumps', () => {
    const clip = tween(500, () => {})
    const rt = createRuntime().build()
    rt.run(clip, 0)

    const before = process.memoryUsage().heapUsed
    for (let i = 0; i < 1000; i++) {
      rt.tick(0)
      rt.tick(250)
      rt.tick(500)
    }
    const after = process.memoryUsage().heapUsed

    expect(after - before).toBeLessThan(1024 * 1024)
  })
})
