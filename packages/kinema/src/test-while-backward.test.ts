import { describe, it, expect } from 'vitest'

import { tween, delay } from './animations.js'
import { Kinema, createRuntime } from './runtime.js'

describe('while(true) backward jump - simple tween', () => {
  it('state at t=750 (250ms into 2nd cycle) matches forward vs backward', () => {
    const obj = { x: 0 }
    const runtime = createRuntime().build()

    const workflow = Kinema.gen(function* () {
      while (true) {
        yield* tween(500, (t) => {
          obj.x = t
        })
        obj.x = 0
      }
    })

    runtime.run(workflow, 0)

    const forwardSnapshots = new Map<number, number>()
    for (let t = 0; t <= 1500; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, obj.x)
    }

    const forwardAt750 = forwardSnapshots.get(750)!
    runtime.tick(750)
    const backwardAt750 = obj.x

    console.log('Forward x at t=750:', forwardAt750)
    console.log('Backward x at t=750:', backwardAt750)
    expect(backwardAt750).toBe(forwardAt750)
  })
})

describe('while(true) backward jump - multi-step cycle', () => {
  it('state at t=1500 matches forward vs backward', () => {
    const obj = { x: 0, phase: '' }
    const runtime = createRuntime().build()

    const workflow = Kinema.gen(function* () {
      while (true) {
        obj.x = 0
        obj.phase = 'tween1-start'
        yield* tween(500, (t) => {
          obj.x = t * 100
          obj.phase = 'tween1'
        })
        obj.phase = 'delay'
        yield* delay(200)
        obj.phase = 'tween2'
        yield* tween(300, (t) => {
          obj.x = 100 + t * 50
          obj.phase = 'tween2'
        })
        obj.phase = 'cycle-end'
      }
    })

    runtime.run(workflow, 0)

    const forwardSnapshots = new Map<number, { x: number; phase: string }>()
    for (let t = 0; t <= 3500; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, { x: obj.x, phase: obj.phase })
    }

    const forwardAt1500 = forwardSnapshots.get(1500)!
    runtime.tick(1500)
    const backwardAt1500 = { x: obj.x, phase: obj.phase }

    console.log('Forward at t=1500:', JSON.stringify(forwardAt1500))
    console.log('Backward at t=1500:', JSON.stringify(backwardAt1500))
    expect(backwardAt1500.x).toBe(forwardAt1500.x)
    expect(backwardAt1500.phase).toBe(forwardAt1500.phase)
  })
})

describe('while(true) backward jump - multi-step with 4 tweens', () => {
  it('state at t=1500 matches forward vs backward (cycle=1200ms)', () => {
    const obj = { x: 0, y: 0, z: 0 }
    const runtime = createRuntime().build()

    const workflow = Kinema.gen(function* () {
      while (true) {
        obj.x = 0
        obj.y = 0
        obj.z = 0
        yield* tween(500, (t) => {
          obj.x = t * 100
        })
        yield* delay(200)
        yield* tween(300, (t) => {
          obj.y = t * 50
        })
        yield* tween(200, (t) => {
          obj.z = t * 75
        })
      }
    })

    runtime.run(workflow, 0)

    const forwardSnapshots = new Map<number, { x: number; y: number; z: number }>()
    for (let t = 0; t <= 3600; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, { x: obj.x, y: obj.y, z: obj.z })
    }

    const targets = [1300, 1500, 2000, 2500, 3000, 3500]
    for (const target of targets) {
      const forward = forwardSnapshots.get(target)!
      runtime.tick(target)
      const backward = { x: obj.x, y: obj.y, z: obj.z }
      console.log(
        `t=${target}: forward=${JSON.stringify(forward)}, backward=${JSON.stringify(backward)}`,
      )
      expect(backward).toEqual(forward)
    }
  })

  it('backward jump then forward continuation matches continuous forward', () => {
    const obj = { x: 0, y: 0, z: 0 }
    const runtime = createRuntime().build()

    const workflow = Kinema.gen(function* () {
      while (true) {
        obj.x = 0
        obj.y = 0
        obj.z = 0
        yield* tween(500, (t) => {
          obj.x = t * 100
        })
        yield* delay(200)
        yield* tween(300, (t) => {
          obj.y = t * 50
        })
        yield* tween(200, (t) => {
          obj.z = t * 75
        })
      }
    })

    runtime.run(workflow, 0)

    const forwardSnapshots = new Map<number, { x: number; y: number; z: number }>()
    for (let t = 0; t <= 3600; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, { x: obj.x, y: obj.y, z: obj.z })
    }

    const jumpTarget = 1500
    runtime.tick(jumpTarget)
    const backwardAtJump = { x: obj.x, y: obj.y, z: obj.z }
    const forwardAtJump = forwardSnapshots.get(jumpTarget)!
    expect(backwardAtJump).toEqual(forwardAtJump)

    for (let t = jumpTarget + 10; t <= jumpTarget + 500; t += 10) {
      runtime.tick(t)
      const backward = { x: obj.x, y: obj.y, z: obj.z }
      const forward = forwardSnapshots.get(t)
      if (forward) {
        expect(backward).toEqual(forward)
      }
    }
  })
})

describe('while(true) backward jump - with fork/join', () => {
  it('state at multiple targets matches forward vs backward', () => {
    const obj = { x: 0, y: 0, z: 0 }
    const runtime = createRuntime().build()

    const forkWork = Kinema.gen(function* () {
      yield* tween(400, (t) => {
        obj.y = t * 100
      })
    })

    const workflow = Kinema.gen(function* () {
      while (true) {
        obj.x = 0
        obj.y = 0
        obj.z = 0

        yield* tween(500, (t) => {
          obj.x = t * 100
        })
        yield* delay(300)
        const fork = yield* Kinema.fork(forkWork)
        yield* tween(1000, (t) => {
          obj.z = t * 50
        })
        yield* Kinema.join(fork)
        yield* tween(200, (t) => {
          obj.x = 100 + t * 50
        })
      }
    })

    runtime.run(workflow, 0)

    const forwardSnapshots = new Map<number, { x: number; y: number; z: number }>()
    for (let t = 0; t <= 5000; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, { x: obj.x, y: obj.y, z: obj.z })
    }

    const targets = [2400, 2450, 2500, 2600, 2800, 3000, 3500, 4000]
    for (const target of targets) {
      const forward = forwardSnapshots.get(target)!
      runtime.tick(target)
      const backward = { x: obj.x, y: obj.y, z: obj.z }
      console.log(
        `t=${target}: forward=${JSON.stringify(forward)}, backward=${JSON.stringify(backward)}`,
      )
      expect(backward).toEqual(forward)
    }
  })

  it('backward jump + forward tick continuation with fork/join', () => {
    const obj = { x: 0, y: 0, z: 0 }
    const runtime = createRuntime().build()

    const forkWork = Kinema.gen(function* () {
      yield* tween(400, (t) => {
        obj.y = t * 100
      })
    })

    const workflow = Kinema.gen(function* () {
      while (true) {
        obj.x = 0
        obj.y = 0
        obj.z = 0

        yield* tween(500, (t) => {
          obj.x = t * 100
        })
        yield* delay(300)
        const fork = yield* Kinema.fork(forkWork)
        yield* tween(1000, (t) => {
          obj.z = t * 50
        })
        yield* Kinema.join(fork)
        yield* tween(200, (t) => {
          obj.x = 100 + t * 50
        })
      }
    })

    runtime.run(workflow, 0)

    const forwardSnapshots = new Map<number, { x: number; y: number; z: number }>()
    for (let t = 0; t <= 5000; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, { x: obj.x, y: obj.y, z: obj.z })
    }

    const jumpTarget = 2400
    runtime.tick(jumpTarget)
    const backwardAtJump = { x: obj.x, y: obj.y, z: obj.z }
    const forwardAtJump = forwardSnapshots.get(jumpTarget)!
    console.log(
      `At jump t=${jumpTarget}: forward=${JSON.stringify(forwardAtJump)}, backward=${JSON.stringify(backwardAtJump)}`,
    )
    expect(backwardAtJump).toEqual(forwardAtJump)

    for (let t = jumpTarget + 10; t <= jumpTarget + 500; t += 10) {
      runtime.tick(t)
      const backward = { x: obj.x, y: obj.y, z: obj.z }
      const forward = forwardSnapshots.get(t)
      if (forward) {
        if (backward.x !== forward.x || backward.y !== forward.y || backward.z !== forward.z) {
          console.log(
            `MISMATCH at t=${t}: forward=${JSON.stringify(forward)}, backward=${JSON.stringify(backward)}`,
          )
        }
        expect(backward).toEqual(forward)
      }
    }
  })
})

describe('while(true) backward jump - nested while(true)', () => {
  it('inner while(true) inside outer while(true) backward jump', () => {
    const obj = { x: 0, y: 0 }
    const runtime = createRuntime().build()

    const innerLoop = Kinema.gen(function* () {
      while (true) {
        yield* tween(200, (t) => {
          obj.y = t * 100
        })
        obj.y = 0
      }
    })

    const workflow = Kinema.gen(function* () {
      while (true) {
        obj.x = 0
        obj.y = 0
        yield* tween(300, (t) => {
          obj.x = t * 100
        })
        yield* innerLoop
      }
    })

    runtime.run(workflow, 0)

    const forwardSnapshots = new Map<number, { x: number; y: number }>()
    for (let t = 0; t <= 3000; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, { x: obj.x, y: obj.y })
    }

    const targets = [250, 350, 500, 750, 1000, 1250, 1500, 2000, 2500]
    for (const target of targets) {
      const forward = forwardSnapshots.get(target)!
      runtime.tick(target)
      const backward = { x: obj.x, y: obj.y }
      console.log(
        `t=${target}: forward=${JSON.stringify(forward)}, backward=${JSON.stringify(backward)}`,
      )
      expect(backward).toEqual(forward)
    }
  })
})

describe('while(true) backward jump - nested while(true) with varying step counts', () => {
  it('3-iteration inner loop inside outer while(true)', () => {
    const obj = { x: 0, y: 0, step: 0 }
    const runtime = createRuntime().build()

    const innerLoop = Kinema.gen(function* () {
      let i = 0
      while (i < 3) {
        yield* tween(100, (t) => {
          obj.y = t * 100
        })
        obj.y = 0
        i++
      }
    })

    const workflow = Kinema.gen(function* () {
      while (true) {
        obj.x = 0
        obj.y = 0
        obj.step = 0
        yield* tween(200, (t) => {
          obj.x = t * 50
          obj.step = 1
        })
        yield* innerLoop
        obj.step = 2
        yield* tween(150, (t) => {
          obj.x = 100 + t * 20
          obj.step = 3
        })
      }
    })

    runtime.run(workflow, 0)

    // cycle = 200 + 3*100 + 150 = 650ms
    const forwardSnapshots = new Map<number, { x: number; y: number; step: number }>()
    for (let t = 0; t <= 2600; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, { x: obj.x, y: obj.y, step: obj.step })
    }

    const targets = [100, 300, 400, 500, 650, 800, 1000, 1300, 1950, 2600]
    for (const target of targets) {
      const forward = forwardSnapshots.get(target)!
      runtime.tick(target)
      const backward = { x: obj.x, y: obj.y, step: obj.step }
      console.log(
        `t=${target}: forward=${JSON.stringify(forward)}, backward=${JSON.stringify(backward)}`,
      )
      expect(backward).toEqual(forward)
    }
  })
})

describe('while(true) backward jump - multiple sequential backward jumps', () => {
  it('jump backward, then forward, then backward again', () => {
    const obj = { x: 0 }
    const runtime = createRuntime().build()

    const workflow = Kinema.gen(function* () {
      while (true) {
        yield* tween(500, (t) => {
          obj.x = t * 100
        })
        yield* delay(200)
      }
    })

    runtime.run(workflow, 0)

    const forwardSnapshots = new Map<number, number>()
    for (let t = 0; t <= 3000; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, obj.x)
    }

    // Jump backward to t=300
    runtime.tick(300)
    expect(obj.x).toBe(forwardSnapshots.get(300)!)

    // Tick forward a bit
    runtime.tick(350)
    expect(obj.x).toBe(forwardSnapshots.get(350)!)

    // Jump backward again to t=100
    runtime.tick(100)
    expect(obj.x).toBe(forwardSnapshots.get(100)!)

    // Jump forward far
    runtime.tick(1500)
    expect(obj.x).toBe(forwardSnapshots.get(1500)!)
  })
})

describe('while(true) backward jump - Kinema.all inside loop', () => {
  it('parallel tweens inside while(true) backward jump', () => {
    const obj = { x: 0, y: 0 }
    const runtime = createRuntime().build()

    const workflow = Kinema.gen(function* () {
      while (true) {
        obj.x = 0
        obj.y = 0
        yield* Kinema.all(
          tween(400, (t) => {
            obj.x = t * 100
          }),
          tween(600, (t) => {
            obj.y = t * 50
          }),
        )
      }
    })

    runtime.run(workflow, 0)

    const forwardSnapshots = new Map<number, { x: number; y: number }>()
    for (let t = 0; t <= 3000; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, { x: obj.x, y: obj.y })
    }

    const targets = [200, 400, 600, 800, 1200, 1600, 2000, 2400]
    for (const target of targets) {
      const forward = forwardSnapshots.get(target)!
      runtime.tick(target)
      const backward = { x: obj.x, y: obj.y }
      console.log(
        `t=${target}: forward=${JSON.stringify(forward)}, backward=${JSON.stringify(backward)}`,
      )
      expect(backward).toEqual(forward)
    }
  })
})

describe('while(true) backward jump - large forward then backward', () => {
  it('play to t=10000 then jump back to t=500', () => {
    const obj = { x: 0 }
    const runtime = createRuntime().build()

    const workflow = Kinema.gen(function* () {
      while (true) {
        yield* tween(500, (t) => {
          obj.x = t * 100
        })
        yield* delay(200)
      }
    })

    runtime.run(workflow, 0)

    // Build forward snapshot
    const forwardSnapshots = new Map<number, number>()
    for (let t = 0; t <= 10000; t += 100) {
      runtime.tick(t)
      forwardSnapshots.set(t, obj.x)
    }

    // Jump backward to t=500
    runtime.tick(500)
    const backwardAt500 = obj.x
    const forwardAt500 = forwardSnapshots.get(500)!
    console.log(`t=500: forward=${forwardAt500}, backward=${backwardAt500}`)
    expect(backwardAt500).toBe(forwardAt500)
  })
})

describe('while(true) backward jump - with Kinema.all + fork/join', () => {
  it('complex: all + fork/join inside while(true)', () => {
    const obj = { x: 0, y: 0, z: 0 }
    const runtime = createRuntime().build()

    const forkWork = Kinema.gen(function* () {
      yield* tween(300, (t) => {
        obj.y = t * 100
      })
    })

    const workflow = Kinema.gen(function* () {
      while (true) {
        obj.x = 0
        obj.y = 0
        obj.z = 0

        yield* Kinema.all(
          tween(200, (t) => {
            obj.x = t * 50
          }),
          tween(400, (t) => {
            obj.z = t * 25
          }),
        )
        const fork = yield* Kinema.fork(forkWork)
        yield* tween(300, (t) => {
          obj.x = 100 + t * 10
        })
        yield* Kinema.join(fork)
      }
    })

    runtime.run(workflow, 0)

    const forwardSnapshots = new Map<number, { x: number; y: number; z: number }>()
    for (let t = 0; t <= 4000; t += 10) {
      runtime.tick(t)
      forwardSnapshots.set(t, { x: obj.x, y: obj.y, z: obj.z })
    }

    const targets = [200, 400, 600, 700, 900, 1000, 1300, 2000, 2600, 3000, 3500]
    for (const target of targets) {
      const forward = forwardSnapshots.get(target)!
      runtime.tick(target)
      const backward = { x: obj.x, y: obj.y, z: obj.z }
      console.log(
        `t=${target}: forward=${JSON.stringify(forward)}, backward=${JSON.stringify(backward)}`,
      )
      expect(backward).toEqual(forward)
    }
  })
})
