import { describe, it, expect } from 'vitest'

import { tween, delay } from './animations.js'
import { Kinema, createRuntime } from './runtime.js'

type Snap = {
  box: { x: number; y: number; opacity: number; scale: number }
  circle: { x: number; opacity: number; scale: number }
}

function diffStates(a: Snap, b: Snap, path = ''): string[] {
  const diffs: string[] = []
  for (const key of Object.keys(a) as Array<keyof Snap>) {
    const objA = a[key]
    const objB = b[key]
    for (const prop of Object.keys(objA) as Array<keyof typeof objA>) {
      const fullPath = path ? `${path}.${key}.${prop}` : `${key}.${prop}`
      const va = (objA as any)[prop]
      const vb = (objB as any)[prop]
      if (va !== vb) {
        diffs.push(`${fullPath}: forward=${va}, backward=${vb}, diff=${vb - va}`)
      }
    }
  }
  return diffs
}

describe('backward jump fidelity', () => {
  it('backward step at t=2484 matches forward snapshot at t=2484', () => {
    const box = { x: 0, y: 0, opacity: 1, scale: 1 }
    const circle = { x: 0, opacity: 1, scale: 1 }

    // Workflow mimics the demo: while(true) with tween, delay, fork+join, all
    // Cycle: tween(500) + delay(300) + [fork(400) || all(200) + delay(100)] + join
    // Fork runs 800-1200ms in parallel. Main thread: all(800-1000) + delay(1000-1100) + join(waits until 1200)
    // Total cycle: 1200ms
    const workflow = Kinema.gen(function* () {
      while (true) {
        box.x = 0
        box.opacity = 1
        box.scale = 1
        circle.x = 0
        circle.opacity = 1
        circle.scale = 1

        yield* tween(500, (t) => {
          box.opacity = t
        })

        yield* delay(300)

        const fork = yield* Kinema.fork(
          tween(400, (t) => {
            box.x = t * 100
          }),
        )

        yield* Kinema.all(
          tween(200, (t) => {
            circle.opacity = t
          }),
          tween(200, (t) => {
            circle.scale = t
          }),
        )

        yield* delay(100)

        yield* Kinema.join(fork)
      }
    })

    const runtime = createRuntime().build()
    runtime.run(workflow, 0)

    // ── Forward pass ──
    const snapshots = new Map<number, Snap>()
    const TARGET = 2500
    const STEP = 16

    for (let t = 0; t <= TARGET; t += STEP) {
      runtime.tick(t)
      snapshots.set(t, { box: { ...box }, circle: { ...circle } })
    }
    // Ensure we have a snapshot at exactly 2500
    runtime.tick(TARGET)
    snapshots.set(TARGET, { box: { ...box }, circle: { ...circle } })

    // Also record at 2484 (one 16ms step before 2500)
    const COMPARE_TIME = TARGET - STEP // 2484
    if (!snapshots.has(COMPARE_TIME)) {
      runtime.tick(COMPARE_TIME)
      snapshots.set(COMPARE_TIME, { box: { ...box }, circle: { ...circle } })
    }

    const stateForward2500 = snapshots.get(TARGET)!
    const stateForwardCompare = snapshots.get(COMPARE_TIME)!

    // ── Backward jump ──
    // Currently at t=2500 (or last ticked time). Jump back to COMPARE_TIME.
    runtime.tick(COMPARE_TIME)
    const stateBackward: Snap = { box: { ...box }, circle: { ...circle } }

    // ── Compare ──
    console.log('Forward state at t=2500:', JSON.stringify(stateForward2500))
    console.log('Forward state at t=' + COMPARE_TIME + ':', JSON.stringify(stateForwardCompare))
    console.log('Backward state at t=' + COMPARE_TIME + ':', JSON.stringify(stateBackward))

    const diffs = diffStates(stateForwardCompare, stateBackward)

    if (diffs.length > 0) {
      console.log('DIFF between forward and backward at t=' + COMPARE_TIME + ':')
      for (const d of diffs) {
        console.log('  ' + d)
      }
    }

    expect(diffs).toEqual([])
  })
})
