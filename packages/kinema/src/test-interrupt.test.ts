import { describe, it, expect, vi } from 'vitest'

import { delay, tween } from './animations.js'
import { Kinema, KinemaRuntime, createRuntime, isInterrupted, tag } from './runtime.js'
import type { Clip } from './runtime.js'

function observeLastValue(rt: KinemaRuntime, time: number): any {
  let captured: any = undefined
  const fibers = (rt as any).fibers as any[]
  const snapshot = fibers.slice()
  try {
    rt.tick(time)
  } catch {
    // dieOnInterrupt throws on Interrupted — ignore
  }
  for (const f of snapshot) {
    if (f.stack.length === 0) {
      captured = f.lastValue
    }
  }
  return captured
}

describe('interrupt', () => {
  it('interrupt stops fiber with reason', () => {
    const onUpdate = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* tween(500, onUpdate)
      yield* Kinema.interrupt('cancelled')
      return 'should not reach'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(0)

    rt.tick(250)
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenCalledWith(0.5)

    const val = observeLastValue(rt, 500)
    expect(isInterrupted(val)).toBe(true)
    expect(val.reason).toBe('cancelled')
    expect(onUpdate).toHaveBeenCalledTimes(3)
  })

  it('interrupt propagates through gen', () => {
    const inner = Kinema.gen(function* () {
      yield* tween(200, () => {})
      yield* Kinema.interrupt('inner-interrupt')
      return 'inner done'
    })

    const outer = Kinema.gen(function* () {
      const result: any = yield* inner
      return result
    })

    const rt = createRuntime().build()
    rt.runOrDie(outer, 0)

    rt.tick(0)
    const val = observeLastValue(rt, 200)
    expect(isInterrupted(val)).toBe(true)
    expect(val.reason).toBe('inner-interrupt')
  })

  it('try catches interrupt', () => {
    const clip = Kinema.gen(function* () {
      yield* Kinema.interrupt('error-reason')
      return 'done'
    })

    const safeClip = Kinema.try(clip)

    const rt = createRuntime().build()
    rt.runOrDie(safeClip, 0)

    const val = observeLastValue(rt, 0)
    expect(isInterrupted(val)).toBe(true)
    expect(val.reason).toBe('error-reason')
  })

  it('try passes through non-interrupted values', () => {
    const clip = Kinema.gen(function* () {
      yield* tween(100, () => {})
      return 'success'
    })

    const safeClip = Kinema.try(clip)

    const rt = createRuntime().build()
    rt.run(safeClip, 0)

    rt.tick(0)
    const val = observeLastValue(rt, 100)
    expect(val).toBe('success')
  })

  it('catch recovers from interrupt', () => {
    const clip = Kinema.gen(function* () {
      yield* Kinema.interrupt('error')
      return 'done'
    })

    const recovered = Kinema.catch(clip, (reason) => Kinema.succeed(`recovered: ${reason}`))

    const rt = createRuntime().build()
    rt.run(recovered, 0)

    const val = observeLastValue(rt, 0)
    expect(val).toBe('recovered: error')
  })

  it('catch passes through non-interrupted values', () => {
    // oxlint-disable-next-line require-yield
    const clip = Kinema.gen(function* () {
      return 'ok'
    })

    const handler = vi.fn() as (reason: any) => Clip<any, never, never>
    const caught = Kinema.catch(clip, handler)

    const rt = createRuntime().build()
    rt.run(caught, 0)

    const val = observeLastValue(rt, 0)
    expect(handler).not.toHaveBeenCalled()
    expect(val).toBe('ok')
  })

  it('retry retries on interrupt', () => {
    let attempts = 0
    const clip = Kinema.gen(function* () {
      attempts++
      if (attempts < 3) {
        yield* Kinema.interrupt('fail')
        return 'fail'
      }
      return 'success'
    })

    const retried = Kinema.retry(5, clip)

    const rt = createRuntime().build()
    rt.runOrDie(retried, 0)

    const val = observeLastValue(rt, 0)
    expect(attempts).toBe(3)
    expect(val).toBe('success')
  })

  it('retry exhausts attempts', () => {
    let attempts = 0
    const clip = Kinema.gen(function* () {
      attempts++
      yield* Kinema.interrupt('always-fail')
      return 'fail'
    })

    const retried = Kinema.retry(3, clip)

    const rt = createRuntime().build()
    rt.runOrDie(retried, 0)

    const val = observeLastValue(rt, 0)
    expect(attempts).toBe(3)
    expect(isInterrupted(val)).toBe(true)
  })

  it('interrupt propagates through Join', () => {
    const child = Kinema.gen(function* () {
      yield* tween(300, () => {})
      yield* Kinema.interrupt('child-error')
      return 'child done'
    })

    const parent = Kinema.gen(function* () {
      const fiber = yield* Kinema.fork(child)
      yield* tween(100, () => {})
      yield* Kinema.join(fiber)
      return 'parent done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(parent, 0)

    rt.tick(0)
    const val = observeLastValue(rt, 300)
    expect(isInterrupted(val)).toBe(true)
    expect(val.reason).toBe('child-error')
  })

  it('interrupt propagates through All', () => {
    const child1 = Kinema.gen(function* () {
      yield* tween(100, () => {})
      return 'ok1'
    })

    const child2 = Kinema.gen(function* () {
      yield* tween(50, () => {})
      yield* Kinema.interrupt('child2-error')
      return 'ok2'
    })

    const parent = Kinema.gen(function* () {
      const result: any = yield* Kinema.all(child1, child2)
      return result
    })

    const rt = createRuntime().build()
    rt.run(parent, 0)

    rt.tick(0)
    const val = observeLastValue(rt, 50)
    expect(isInterrupted(val)).toBe(true)
    expect(val.reason).toBe('child2-error')
  })

  it('race skips interrupted children', () => {
    const child1 = Kinema.gen(function* () {
      yield* Kinema.interrupt('fail1')
      return 'fail1'
    })

    const child2 = Kinema.gen(function* () {
      yield* tween(100, () => {})
      return 'winner'
    })

    const parent = Kinema.gen(function* () {
      const result: any = yield* Kinema.race(child1, child2)
      return result
    })

    const rt = createRuntime().build()
    rt.run(parent, 0)

    rt.tick(0)
    const val = observeLastValue(rt, 100)
    expect(val).toBe('winner')
  })

  it('interrupt in provide restores context', () => {
    const TestTag = tag<string>()('test')
    const clip = Kinema.gen(function* () {
      yield* Kinema.interrupt('error')
      return 'done'
    })

    const provided = Kinema.provide(TestTag, 'hello')(clip)

    const rt = createRuntime().build()
    rt.runOrDie(provided, 0)

    const val = observeLastValue(rt, 0)
    expect(isInterrupted(val)).toBe(true)
    expect(val.reason).toBe('error')
  })

  it('isInterrupted works correctly', () => {
    expect(isInterrupted({ _tag: 'Interrupted', reason: 'test' })).toBe(true)
    expect(isInterrupted({ _tag: 'Interrupted', reason: 42 })).toBe(true)
    expect(isInterrupted({ _tag: 'SomethingElse' })).toBe(false)
    expect(isInterrupted('string')).toBe(false)
    expect(isInterrupted(null)).toBe(false)
    expect(isInterrupted(undefined)).toBe(false)
    expect(isInterrupted(42)).toBe(false)
  })

  it('interrupt after tween completes', () => {
    const onUpdate = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* tween(100, onUpdate)
      yield* delay(50)
      yield* Kinema.interrupt('late-error')
      return 'done'
    })

    const safeClip = Kinema.try(clip)

    const rt = createRuntime().build()
    rt.runOrDie(safeClip, 0)

    rt.tick(0)
    rt.tick(100)
    const val = observeLastValue(rt, 150)

    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenLastCalledWith(1)
    expect(isInterrupted(val)).toBe(true)
    expect(val.reason).toBe('late-error')
  })

  it('interrupt with complex reason type', () => {
    type MyReason = { code: number; message: string }
    const clip = Kinema.gen(function* () {
      yield* Kinema.interrupt<MyReason>({ code: 404, message: 'not found' })
      return 'done'
    })

    const safeClip = Kinema.try(clip)

    const rt = createRuntime().build()
    rt.runOrDie(safeClip, 0)

    const val = observeLastValue(rt, 0)
    expect(isInterrupted(val)).toBe(true)
    expect(val.reason.code).toBe(404)
    expect(val.reason.message).toBe('not found')
  })

  it('runOrDie throws on interrupt and destroys runtime', () => {
    const clip = Kinema.gen(function* () {
      yield* tween(100, () => {})
      yield* Kinema.interrupt('fatal')
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    expect(() => rt.tick(100)).toThrow('Interrupted: fatal')
    expect(rt.stats().fibersActive).toBe(0)
  })

  it('runOrDie throws with complex reason', () => {
    const clip = Kinema.gen(function* () {
      yield* Kinema.interrupt({ code: 500, message: 'server error' })
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    expect(() => rt.tick(0)).toThrow('Interrupted: [object Object]')
    expect(rt.stats().fibersActive).toBe(0)
  })

  it('runOrDie destroys all fibers on interrupt', () => {
    const child1 = Kinema.gen(function* () {
      yield* tween(500, () => {})
      return 'child1'
    })
    const child2 = Kinema.gen(function* () {
      yield* tween(500, () => {})
      return 'child2'
    })
    const parent = Kinema.gen(function* () {
      yield* Kinema.fork(child1)
      yield* Kinema.fork(child2)
      yield* Kinema.interrupt('parent-error')
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(parent, 0)

    expect(() => rt.tick(0)).toThrow('Interrupted: parent-error')
    expect(rt.stats().fibersActive).toBe(0)
  })

  describe('catch — re-interrupt', () => {
    it('handler can re-interrupt with different reason', () => {
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt('original')
        return 'done'
      })

      const caught = Kinema.catch(clip, (reason) => {
        return Kinema.interrupt(`re-${reason}` as const)
      })

      const rt = createRuntime().build()
      rt.runOrDie(caught, 0)

      const val = observeLastValue(rt, 0)
      expect(isInterrupted(val)).toBe(true)
      expect(val.reason).toBe('re-original')
    })

    it('handler re-interrupt propagates through gen', () => {
      const inner = Kinema.gen(function* () {
        yield* Kinema.interrupt('inner')
        return 'done'
      })

      const outer = Kinema.gen(function* () {
        const v: any = yield* Kinema.catch(inner, (r) => Kinema.interrupt(`caught-${r}` as const))
        return v
      })

      const rt = createRuntime().build()
      rt.runOrDie(outer, 0)

      const val = observeLastValue(rt, 0)
      expect(isInterrupted(val)).toBe(true)
      expect(val.reason).toBe('caught-inner')
    })

    it('handler re-interrupt propagates through fork/join', () => {
      const child = Kinema.gen(function* () {
        yield* Kinema.interrupt('child-err')
        return 'done'
      })

      const caught = Kinema.catch(child, (r) => Kinema.interrupt(`re-${r}` as const))

      const parent = Kinema.gen(function* () {
        const f = yield* Kinema.fork(caught)
        yield* Kinema.join(f)
        return 'parent done'
      })

      const rt = createRuntime().build()
      rt.runOrDie(parent, 0)

      const val = observeLastValue(rt, 0)
      expect(isInterrupted(val)).toBe(true)
      expect(val.reason).toBe('re-child-err')
    })

    it('handler re-interrupt propagates through All', () => {
      const clip1 = Kinema.gen(function* () {
        yield* tween(100, () => {})
        return 'ok1'
      })
      const clip2 = Kinema.gen(function* () {
        yield* Kinema.interrupt('err2')
        return 'ok2'
      })

      const all = Kinema.all(
        clip1,
        Kinema.catch(clip2, (r) => Kinema.interrupt(`re-${r}` as const)),
      )

      const rt = createRuntime().build()
      rt.runOrDie(all, 0)

      const val = observeLastValue(rt, 0)
      expect(isInterrupted(val)).toBe(true)
      expect(val.reason).toBe('re-err2')
    })

    it('nested catch — outer catches inner re-interrupt', () => {
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt('original')
        return 'done'
      })

      const innerCaught = Kinema.catch(clip, (r) => Kinema.interrupt(`re-${r}` as const))
      const outerCaught = Kinema.catch(innerCaught, (r) => Kinema.succeed(`recovered: ${r}`))

      const rt = createRuntime().build()
      rt.run(outerCaught, 0)

      const val = observeLastValue(rt, 0)
      expect(val).toBe('recovered: re-original')
    })
  })

  describe('catch — complex types', () => {
    it('handler with complex reason type', () => {
      type Err = { code: number; message: string }
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt<Err>({ code: 500, message: 'server error' })
        return 'done'
      })

      const caught = Kinema.catch(clip, (reason) => {
        return Kinema.succeed(`Error ${reason.code}: ${reason.message}`)
      })

      const rt = createRuntime().build()
      rt.run(caught, 0)

      const val = observeLastValue(rt, 0)
      expect(val).toBe('Error 500: server error')
    })

    it('handler returns different success type', () => {
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt('error')
        return 42
      })

      const caught = Kinema.catch(clip, () => Kinema.succeed('recovered string'))

      const rt = createRuntime().build()
      rt.run(caught, 0)

      const val = observeLastValue(rt, 0)
      expect(val).toBe('recovered string')
      expect(typeof val).toBe('string')
    })
  })

  describe('catch — with DI context', () => {
    it('handler uses Kinema.use', () => {
      const MsgTag = tag<string>()('msg')
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt('error')
        return 'done'
      })

      const caught = Kinema.catch(clip, (reason) => {
        return Kinema.gen(function* () {
          const msg: string = yield* Kinema.use(MsgTag)
          return `${msg}: ${reason}`
        })
      })

      const rt = createRuntime().provide(MsgTag, 'RECOVERED').build()
      rt.run(caught, 0)

      const val = observeLastValue(rt, 0)
      expect(val).toBe('RECOVERED: error')
    })
  })

  describe('catch — with tween', () => {
    it('catch after tween completes', () => {
      const onUpdate = vi.fn()
      const clip = Kinema.gen(function* () {
        yield* tween(200, onUpdate)
        yield* Kinema.interrupt('after-tween')
        return 'done'
      })

      const caught = Kinema.catch(clip, () => Kinema.succeed('recovered'))

      const rt = createRuntime().build()
      rt.run(caught, 0)

      rt.tick(0)
      expect(onUpdate).toHaveBeenCalledTimes(1)

      const val = observeLastValue(rt, 200)
      expect(onUpdate).toHaveBeenCalledTimes(2)
      expect(val).toBe('recovered')
    })

    it('catch with tween in handler', () => {
      const onUpdate = vi.fn()
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt('error')
        return 'done'
      })

      const caught = Kinema.catch(clip, () => {
        return Kinema.gen(function* () {
          yield* tween(100, onUpdate)
          return 'recovered after tween'
        })
      })

      const rt = createRuntime().build()
      rt.run(caught, 0)

      rt.tick(0)
      expect(onUpdate).toHaveBeenCalledTimes(1)

      const val = observeLastValue(rt, 100)
      expect(val).toBe('recovered after tween')
    })
  })

  describe('catch — handler receives correct reason', () => {
    it('handler receives exact interrupt reason', () => {
      const handler = vi.fn(() => Kinema.succeed('ok'))
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt('my-reason')
        return 'done'
      })

      Kinema.catch(clip, handler)

      const rt = createRuntime().build()
      rt.run(Kinema.catch(clip, handler), 0)

      observeLastValue(rt, 0)
      expect(handler).toHaveBeenCalledWith('my-reason')
    })

    it('handler receives object reason by reference', () => {
      const reason = { code: 404, tags: ['a', 'b'] }
      const handler = vi.fn(() => Kinema.succeed('ok'))
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt(reason)
        return 'done'
      })

      const rt = createRuntime().build()
      rt.run(Kinema.catch(clip, handler), 0)

      observeLastValue(rt, 0)
      expect(handler).toHaveBeenCalledWith(reason)
      expect((handler.mock.calls as any[][])[0]![0]).toBe(reason)
    })
  })

  describe('retry — edge cases', () => {
    it('retry with 0 retries does not execute clip', () => {
      let attempts = 0
      const clip = Kinema.gen(function* () {
        attempts++
        yield* Kinema.interrupt('fail')
        return 'done'
      })

      const retried = Kinema.retry(0, clip)

      const rt = createRuntime().build()
      rt.runOrDie(retried, 0)

      const val = observeLastValue(rt, 0)
      expect(attempts).toBe(0)
      expect(val).toBeUndefined()
    })

    it('retry with 1 retry tries twice', () => {
      let attempts = 0
      const clip = Kinema.gen(function* () {
        attempts++
        yield* Kinema.interrupt('fail')
        return 'done'
      })

      const retried = Kinema.retry(1, clip)

      const rt = createRuntime().build()
      rt.runOrDie(retried, 0)

      const val = observeLastValue(rt, 0)
      expect(attempts).toBe(1)
      expect(isInterrupted(val)).toBe(true)
    })

    it('retry with tween between attempts', () => {
      let attempts = 0
      const clip = Kinema.gen(function* () {
        yield* tween(100, () => {})
        attempts++
        if (attempts < 3) {
          yield* Kinema.interrupt('fail')
          return 'fail'
        }
        return 'success'
      })

      const retried = Kinema.retry(5, clip)

      const rt = createRuntime().build()
      rt.runOrDie(retried, 0)

      rt.tick(0)
      rt.tick(100)
      rt.tick(200)

      const val = observeLastValue(rt, 300)

      expect(attempts).toBe(3)
      expect(val).toBe('success')
    })

    it('retry with different interrupt reasons', () => {
      const _reasons: string[] = []
      let attempts = 0
      const clip = Kinema.gen(function* () {
        attempts++
        yield* Kinema.interrupt(`err-${attempts}`)
        return 'done'
      })

      const retried = Kinema.retry(
        3,
        Kinema.gen(function* () {
          const v: any = yield* clip
          return v
        }),
      )

      const rt = createRuntime().build()
      rt.runOrDie(retried, 0)

      const val = observeLastValue(rt, 0)
      expect(attempts).toBe(3)
      expect(isInterrupted(val)).toBe(true)
      expect(val.reason).toBe('err-3')
    })
  })

  describe('catch + retry composition', () => {
    it('catch(retry(...)) recovers after exhaustion', () => {
      let attempts = 0
      const clip = Kinema.gen(function* () {
        attempts++
        yield* Kinema.interrupt('always-fail')
        return 'done'
      })

      const retried = Kinema.retry(3, clip)
      const caught = Kinema.catch(retried, (reason) => Kinema.succeed(`gave up: ${reason}`))

      const rt = createRuntime().build()
      rt.run(caught, 0)

      const val = observeLastValue(rt, 0)
      expect(attempts).toBe(3)
      expect(val).toBe('gave up: always-fail')
    })

    it('retry(catch(...)) — catch prevents retry from seeing interrupt', () => {
      let attempts = 0
      const clip = Kinema.gen(function* () {
        attempts++
        yield* Kinema.interrupt('fail')
        return 'done'
      })

      const caught = Kinema.catch(clip, () => Kinema.succeed('recovered'))
      const retried = Kinema.retry(5, caught)

      const rt = createRuntime().build()
      rt.run(retried, 0)

      const val = observeLastValue(rt, 0)
      expect(attempts).toBe(1)
      expect(val).toBe('recovered')
    })

    it('retry(catch(retry(...))) complex chain', () => {
      let innerAttempts = 0
      const innerClip = Kinema.gen(function* () {
        innerAttempts++
        yield* Kinema.interrupt('inner-fail')
        return 'done'
      })

      const innerRetried = Kinema.retry(2, innerClip)
      const caught = Kinema.catch(innerRetried, () => Kinema.succeed('caught'))
      const outerRetried = Kinema.retry(3, caught)

      const rt = createRuntime().build()
      rt.run(outerRetried, 0)

      const val = observeLastValue(rt, 0)
      expect(innerAttempts).toBe(2)
      expect(val).toBe('caught')
    })
  })

  describe('interrupt — runtime propagation', () => {
    it('interrupt in forked child propagates to parent via join', () => {
      const child = Kinema.gen(function* () {
        yield* tween(100, () => {})
        yield* Kinema.interrupt('child-error')
        return 'child done'
      })

      const parent = Kinema.gen(function* () {
        const f = yield* Kinema.fork(child)
        yield* tween(50, () => {})
        yield* Kinema.join(f)
        return 'parent done'
      })

      const rt = createRuntime().build()
      rt.runOrDie(parent, 0)

      rt.tick(0)
      const val = observeLastValue(rt, 100)
      expect(isInterrupted(val)).toBe(true)
      expect(val.reason).toBe('child-error')
    })

    it('spawn creates independent fiber (fire-and-forget)', () => {
      const updates = vi.fn()
      const child = Kinema.gen(function* () {
        yield* tween(100, updates)
        return 'child done'
      })

      const parent = Kinema.gen(function* () {
        const spawned: any = yield* Kinema.spawn(child)
        yield* tween(50, () => {})
        return spawned
      })

      const rt = createRuntime().build()
      rt.run(parent, 0)

      rt.tick(0)
      const val = observeLastValue(rt, 50)
      // parent completes with the FiberImpl reference, child runs independently
      expect(val).toBeDefined()
      expect(updates).toHaveBeenCalled()
    })

    it('interrupt in provide restores context before propagating', () => {
      const Tag1 = tag<string>()('t1')
      const Tag2 = tag<number>()('t2')

      const clip = Kinema.gen(function* () {
        const v1: string = yield* Kinema.use(Tag1)
        const v2: number = yield* Kinema.use(Tag2)
        yield* Kinema.interrupt('ctx-error')
        return `${v1}-${v2}`
      })

      const provided = Kinema.provide(Tag1, 'hello')(Kinema.provide(Tag2, 42)(clip))

      const rt = createRuntime().build()
      rt.runOrDie(provided, 0)

      const val = observeLastValue(rt, 0)
      expect(isInterrupted(val)).toBe(true)
      expect(val.reason).toBe('ctx-error')
    })

    it('race with all interrupted returns first interrupt', () => {
      const child1 = Kinema.gen(function* () {
        yield* Kinema.interrupt('err1')
        return 'c1'
      })
      const child2 = Kinema.gen(function* () {
        yield* Kinema.interrupt('err2')
        return 'c2'
      })

      const parent = Kinema.gen(function* () {
        const r: any = yield* Kinema.race(child1, child2)
        return r
      })

      const rt = createRuntime().build()
      rt.runOrDie(parent, 0)

      const val = observeLastValue(rt, 0)
      expect(isInterrupted(val)).toBe(true)
    })

    it('run rejects clip with interrupt type', () => {
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt('error')
        return 'done'
      })

      const rt = createRuntime().build()
      rt.run(clip, 0)
    })

    it('retry result requires runOrDie when interrupt type is non-never', () => {
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt('error')
        return 'done'
      })

      const retried = Kinema.retry(3, clip)
      const rt = createRuntime().build()
      rt.run(retried, 0)
    })

    it('catch with re-interrupt: handler returning union infers correct types', () => {
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt('foo' as const)
        return 'done'
      })

      const caught = Kinema.catch(clip, (s) => {
        if (s.length > 2) {
          return Kinema.interrupt('bar' as const)
        }
        return Kinema.succeed(1)
      })

      // Result type: Kinema<number, "bar", never>
      // A = number | never = number, I = "bar", R = never
      const _val: typeof caught = null!
      type A = typeof caught extends Clip<infer A, any, any> ? A : never
      type I = typeof caught extends Clip<any, infer I, any> ? I : never
      type R = typeof caught extends Clip<any, any, infer R> ? R : never

      const _a: A = 'done' as A
      const _i: I = 'bar' as I
      const _r: R = null as R

      const rt = createRuntime().build()
      rt.run(caught, 0)

      // runOrDie works
      const rt2 = createRuntime().build()
      rt2.runOrDie(caught, 0)
    })

    it('catch without re-interrupt: handler returning succeed infers never for I', () => {
      const clip = Kinema.gen(function* () {
        yield* Kinema.interrupt('foo' as const)
        return 'done'
      })

      const caught = Kinema.catch(clip, (s) => {
        return Kinema.succeed(`recovered: ${s}`)
      })

      // Result type: Kinema<string, never, never>
      type I = typeof caught extends Clip<any, infer I, any> ? I : never
      const _i: I = null! as I

      // I = never, so run works
      const rt = createRuntime().build()
      rt.run(caught, 0)
    })
  })
})
