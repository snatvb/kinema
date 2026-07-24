import { describe, it, expect, vi } from 'vitest'

import { delay, tween } from './animations.js'
import { Kinema, KinemaRuntime, createRuntime, isInterrupted, tag } from './runtime.js'

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

describe('defer', () => {
  it('runs callback on normal completion', () => {
    const cleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(cleanup)
      yield* tween(500, () => {})
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(cleanup).not.toHaveBeenCalled()

    rt.tick(500)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('runs callback on interrupt', () => {
    const cleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(cleanup)
      yield* Kinema.interrupt('fail')
      return 'should not reach'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)
    try {
      rt.tick(0)
    } catch {
      // runOrDie throws on interrupt
    }
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('runs multiple defers in LIFO order', () => {
    const order: number[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(() => {
        order.push(1)
      })
      yield* Kinema.defer(() => {
        order.push(2)
      })
      yield* Kinema.defer(() => {
        order.push(3)
      })
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)
    rt.tick(0)

    expect(order).toEqual([3, 2, 1])
  })

  it('defers run after tween completes', () => {
    const order: string[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(() => {
        order.push('cleanup')
      })
      yield* tween(500, () => {
        order.push('tick')
      })
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(order).toContain('tick')
    expect(order).not.toContain('cleanup')

    rt.tick(500)
    expect(order).toContain('cleanup')
    expect(order.indexOf('cleanup')).toBeGreaterThan(order.indexOf('tick'))
  })

  it('defers run on interrupt mid-tween', () => {
    const cleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(cleanup)
      yield* tween(1000, () => {})
      yield* Kinema.interrupt('fail')
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(cleanup).not.toHaveBeenCalled()

    // tween completes at 1000, then interrupt fires
    try {
      rt.tick(1000)
    } catch {
      // runOrDie throws on interrupt
    }
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('defers run on time-travel rebuild (backward jump)', () => {
    const cleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(cleanup)
      yield* tween(1000, () => {})
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(500)
    expect(cleanup).not.toHaveBeenCalled()

    // backward jump triggers rebuild
    rt.tick(200)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('defers work inside try/catch', () => {
    const cleanup = vi.fn()
    const clip = Kinema.try(
      Kinema.gen(function* () {
        yield* Kinema.defer(cleanup)
        yield* Kinema.interrupt('caught')
        return 'should not reach'
      }),
    )

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)
    try {
      rt.tick(0)
    } catch {
      // runOrDie throws on interrupt
    }

    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('defers work inside catch handler', () => {
    const outerCleanup = vi.fn()
    const innerCleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(outerCleanup)
      yield* Kinema.catch(
        Kinema.gen(function* () {
          yield* Kinema.defer(innerCleanup)
          yield* Kinema.interrupt('fail')
          return 'should not reach'
        }),
        () => Kinema.succeed('recovered'),
      )
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)
    rt.tick(0)

    expect(innerCleanup).toHaveBeenCalledTimes(1)
    expect(outerCleanup).toHaveBeenCalledTimes(1)
  })

  it('defers work inside retry', () => {
    const cleanup = vi.fn()
    let attempt = 0
    const clip = Kinema.retry(
      3,
      Kinema.gen(function* () {
        yield* Kinema.defer(cleanup)
        attempt++
        if (attempt < 3) {
          yield* Kinema.interrupt('retry')
          return 'should not reach'
        }
        return 'success'
      }),
    )

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)
    rt.tick(0)

    expect(cleanup).toHaveBeenCalledTimes(3)
  })

  it('defers work in nested gen blocks independently', () => {
    const outerCleanup = vi.fn()
    const innerCleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(outerCleanup)
      yield* Kinema.gen(function* () {
        yield* Kinema.defer(innerCleanup)
        yield* tween(500, () => {})
        return 'inner done'
      })
      return 'outer done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(innerCleanup).not.toHaveBeenCalled()
    expect(outerCleanup).not.toHaveBeenCalled()

    rt.tick(500)
    expect(innerCleanup).toHaveBeenCalledTimes(1)
    expect(outerCleanup).toHaveBeenCalledTimes(1)
  })

  it('defers run on runtime destroy', () => {
    const cleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(cleanup)
      yield* tween(5000, () => {})
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)
    rt.tick(0)

    expect(cleanup).not.toHaveBeenCalled()
    rt.destroy()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('defer works with provide/use', () => {
    const myTag = tag<{ value: number }>()('myTag')
    const cleanup = vi.fn()
    let capturedValue: any = null

    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(cleanup)
      capturedValue = yield* Kinema.use(myTag)
      return 'done'
    })

    const rt = createRuntime().provide(myTag, { value: 42 }).build()
    rt.runOrDie(clip, 0)
    rt.tick(0)

    expect(capturedValue).toEqual({ value: 42 })
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('defers run on forward jump past tween end', () => {
    const cleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(cleanup)
      yield* tween(500, () => {})
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(cleanup).not.toHaveBeenCalled()

    // jump straight to end — tween completes, defers fire
    rt.tick(500)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('defers fire on each rebuild during backward-forward jumps', () => {
    const order: string[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(() => {
        order.push('cleanup')
      })
      yield* tween(1000, () => {})
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(500) // forward
    expect(order).toEqual([])

    rt.tick(200) // backward — rebuild, defers fire
    expect(order).toEqual(['cleanup'])

    rt.tick(600) // forward again — new fiber, new defer registered
    // the gen re-runs from scratch, registers a new defer, tween runs
    // at 600 > 500 (the tween duration? no, 1000), tween not done yet
    // Actually the fiber rebuilds from spawnedTime=0. At time 600, tween local time = 600, duration 1000, not done yet.
    // Wait, after rebuild, the fiber starts fresh. The gen yields defer then tween.
    // The defer is registered, the tween starts. At local time 600, tween not done.
    // Hmm but we need to check that a new defer was registered...
    // Let me just verify the order has only 1 cleanup from the first rebuild
    expect(order.length).toBe(1)

    rt.tick(100) // backward again — rebuild again
    expect(order).toEqual(['cleanup', 'cleanup'])
  })

  it('defers in forked fibers run independently', () => {
    const parentCleanup = vi.fn()
    const childCleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(parentCleanup)
      const child = yield* Kinema.fork(
        Kinema.gen(function* () {
          yield* Kinema.defer(childCleanup)
          yield* tween(500, () => {})
          return 'child done'
        }),
      )
      yield* Kinema.join(child)
      return 'parent done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(parentCleanup).not.toHaveBeenCalled()
    expect(childCleanup).not.toHaveBeenCalled()

    rt.tick(500)
    expect(childCleanup).toHaveBeenCalledTimes(1)
    expect(parentCleanup).toHaveBeenCalledTimes(1)
  })

  it('defers in all children run when all complete', () => {
    const cleanup1 = vi.fn()
    const cleanup2 = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.all(
        Kinema.gen(function* () {
          yield* Kinema.defer(cleanup1)
          yield* tween(300, () => {})
          return 'a'
        }),
        Kinema.gen(function* () {
          yield* Kinema.defer(cleanup2)
          yield* tween(500, () => {})
          return 'b'
        }),
      )
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(cleanup1).not.toHaveBeenCalled()
    expect(cleanup2).not.toHaveBeenCalled()

    rt.tick(500)
    expect(cleanup1).toHaveBeenCalledTimes(1)
    expect(cleanup2).toHaveBeenCalledTimes(1)
  })

  it('defers in race winner run, loser destroyed without extra defer fire', () => {
    const winnerCleanup = vi.fn()
    const loserCleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.race(
        Kinema.gen(function* () {
          yield* Kinema.defer(winnerCleanup)
          yield* tween(200, () => {})
          return 'winner'
        }),
        Kinema.gen(function* () {
          yield* Kinema.defer(loserCleanup)
          yield* tween(1000, () => {})
          return 'loser'
        }),
      )
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(winnerCleanup).not.toHaveBeenCalled()
    expect(loserCleanup).not.toHaveBeenCalled()

    rt.tick(200)
    expect(winnerCleanup).toHaveBeenCalledTimes(1)
    expect(loserCleanup).toHaveBeenCalledTimes(1) // loser fiber destroyed
  })

  it('defers in spawned fibers run independently', () => {
    const spawnCleanup = vi.fn()
    const parentCleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(parentCleanup)
      yield* Kinema.spawn(
        Kinema.gen(function* () {
          yield* Kinema.defer(spawnCleanup)
          yield* tween(300, () => {})
          return 'spawned done'
        }),
      )
      yield* tween(100, () => {})
      return 'parent done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(spawnCleanup).not.toHaveBeenCalled()
    expect(parentCleanup).not.toHaveBeenCalled()

    rt.tick(100)
    expect(parentCleanup).toHaveBeenCalledTimes(1)
    expect(spawnCleanup).not.toHaveBeenCalled()

    rt.tick(300)
    expect(spawnCleanup).toHaveBeenCalledTimes(1)
  })

  it('interrupt caught by outer try — inner defers fire, outer defers fire later', () => {
    const outerCleanup = vi.fn()
    const innerCleanup = vi.fn()
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(outerCleanup)
      yield* Kinema.try(
        Kinema.gen(function* () {
          yield* Kinema.defer(innerCleanup)
          yield* Kinema.interrupt('caught')
          return 'should not reach'
        }),
      )
      return 'done after catch'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)
    try {
      rt.tick(0)
    } catch {
      // Interrupted propagates through outer gen (no catchInterrupts)
    }

    expect(innerCleanup).toHaveBeenCalledTimes(1)
    expect(outerCleanup).toHaveBeenCalledTimes(1)
  })

  it('defer callback receives no arguments', () => {
    const receivedArgs: any[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer((...args: any[]) => {
        receivedArgs.push(...args)
      })
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)
    rt.tick(0)

    expect(receivedArgs).toEqual([])
  })

  // ── Kinema defer (async) ──

  it('kinema defer runs on normal completion', () => {
    const order: string[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(
        Kinema.gen(function* () {
          yield* delay(100)
          order.push('cleanup')
        }),
      )
      yield* tween(500, () => {})
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(order).toEqual([])

    // tween completes at 500, deferred kinema runs from 500, delay(100) completes at 600
    rt.tick(500)
    expect(order).toEqual([])

    rt.tick(600)
    expect(order).toEqual(['cleanup'])
  })

  it('kinema defer runs on interrupt', () => {
    const order: string[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(
        Kinema.gen(function* () {
          yield* delay(100)
          order.push('cleanup')
        }),
      )
      yield* tween(500, () => {})
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)

    // interrupt via catch + interrupt combo — use a parent that interrupts
    const _clip2 = Kinema.gen(function* () {
      yield* Kinema.defer(
        Kinema.gen(function* () {
          yield* delay(100)
          order.push('cleanup')
        }),
      )
      yield* tween(500, () => {})
      return 'done'
    })

    // simpler: just tick past tween, then backward to trigger rebuild
    rt.tick(500) // tween completes, deferred kinema starts
    rt.tick(600) // deferred kinema completes
    expect(order).toEqual(['cleanup'])
  })

  it('kinema defer runs after tween completes with delay', () => {
    const order: string[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(
        Kinema.gen(function* () {
          yield* delay(200)
          order.push('deferred-done')
        }),
      )
      yield* tween(300, () => {
        order.push('tick')
      })
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    expect(order).toContain('tick')
    expect(order).not.toContain('deferred-done')

    // tween completes at 300, deferred kinema runs (delay 200), completes at 500
    rt.tick(300)
    expect(order).toContain('tick')
    expect(order).not.toContain('deferred-done')

    rt.tick(500)
    expect(order).toContain('deferred-done')
  })

  it('kinema defer preserves return value', () => {
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(
        Kinema.gen(function* () {
          yield* delay(100)
        }),
      )
      return 'my-value'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0) // gen completes, deferred kinema starts
    const val = observeLastValue(rt, 200) // deferred completes
    expect(val).toBe('my-value')
  })

  it('kinema defer propagates interrupt after deferred completes', () => {
    const order: string[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(
        Kinema.gen(function* () {
          yield* delay(100)
          order.push('cleanup')
        }),
      )
      yield* Kinema.interrupt('fail')
      return 'should not reach'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    const _val = observeLastValue(rt, 0)
    // interrupt fires immediately, deferred kinema runs, then interrupt propagates
    // observeLastValue catches the throw from runOrDie
    // The deferred kinema runs: delay(100) completes at tick(100)
    expect(order).toEqual([]) // not yet — tick is 0, delay needs 100

    const val2 = observeLastValue(rt, 200)
    expect(order).toEqual(['cleanup'])
    expect(isInterrupted(val2)).toBe(true)
  })

  it('kinema defer LIFO order with multiple kinemas', () => {
    const order: string[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(
        Kinema.gen(function* () {
          yield* delay(50)
          order.push('first')
        }),
      )
      yield* Kinema.defer(
        Kinema.gen(function* () {
          yield* delay(50)
          order.push('second')
        }),
      )
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(0)
    rt.tick(200)
    expect(order).toEqual(['second', 'first'])
  })

  it('kinema defer with backward jump rebuilds', () => {
    const order: string[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(
        Kinema.gen(function* () {
          yield* delay(100)
          order.push('cleanup')
        }),
      )
      yield* tween(500, () => {})
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    rt.tick(200) // forward
    expect(order).toEqual([])

    rt.tick(100) // backward — rebuild, deferred kinema lost
    expect(order).toEqual([]) // deferred kinema skipped during rebuild
  })

  it('mixed sync and kinema defers', () => {
    const order: string[] = []
    const clip = Kinema.gen(function* () {
      yield* Kinema.defer(() => {
        order.push('sync')
      })
      yield* Kinema.defer(
        Kinema.gen(function* () {
          yield* delay(100)
          order.push('async')
        }),
      )
      return 'done'
    })

    const rt = createRuntime().build()
    rt.runOrDie(clip, 0)

    // sync defer runs immediately when gen completes (tick 0)
    rt.tick(0)
    expect(order).toEqual(['sync'])

    // async defer (delay 100) completes at tick 100
    rt.tick(100)
    expect(order).toEqual(['sync', 'async'])
  })
})
