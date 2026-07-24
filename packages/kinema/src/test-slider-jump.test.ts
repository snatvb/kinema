import { describe, it, expect } from 'vitest'

import { createSpring, delay, easeInOutQuad, tween } from './animations.js'
import { springs } from './animations.js'
import { Kinema, createRuntime, tag } from './runtime.js'

// Faithful copy of apps/demo/src/components/Slider.tsx workflow with mock DOM

interface MockEl {
  style: any
  innerText: string
}

const mkEl = (): MockEl => ({ style: {}, innerText: '' })

const Element = tag<MockEl>()('element')
const GreenElement = tag<MockEl>()('green-element')
const Circle = tag<MockEl>()('cicle')

const workflow2 = (box: MockEl) =>
  Kinema.gen(function* () {
    yield* Kinema.defer(
      Kinema.gen(function* () {
        yield* delay(100)
      }),
    )
    yield* tween(200, (t) => {
      box.style.opacity = `${t}`
    })
    yield* Kinema.getTime('local')
    yield* delay(100)
    yield* Kinema.succeed(250)
    const fork = yield* Kinema.fork(
      tween(500, (t) => {
        box.innerText = t.toFixed(4)
      }),
    )
    yield* tween(
      1800,
      (t) => {
        box.style.transform = `translateX(${250 * t}px)`
      },
      { easing: easeInOutQuad },
    )
    yield* Kinema.join(fork)
  })

const bam = createSpring(springs.wobbly)
const workflow = Kinema.gen(function* () {
  const box = yield* Kinema.use(Element)
  const greenBox = yield* Kinema.use(GreenElement)
  const circle = yield* Kinema.use(Circle)
  const wf = workflow2(greenBox)
  while (true) {
    greenBox.style.transform = `translateX(0px)`
    greenBox.style.opacity = '0'
    greenBox.innerText = ''
    box.style.transform = `translateX(0px)`
    box.style.opacity = '0'
    circle.style.opacity = '0'
    circle.style.transform = ''

    const circleFork = yield* Kinema.fork(
      Kinema.all(
        bam((t) => {
          circle.style.opacity = String(t)
        }),
        bam((t) => {
          circle.style.transform = `scale(${t})`
        }),
      ),
    )

    yield* tween(500, (t) => {
      box.style.opacity = `${t}`
    })

    yield* delay(300)
    const fork = yield* Kinema.fork(wf)
    yield* Kinema.catch(Kinema.interrupt('foo' as const), () => {
      return Kinema.succeed(1)
    })

    const targetX = yield* Kinema.succeed(250)

    yield* tween(
      1000,
      (t) => {
        box.style.transform = `translateX(${targetX * t}px)`
      },
      { easing: easeInOutQuad },
    )

    yield* Kinema.join(fork)
    yield* tween(200, (t) => {
      box.style.opacity = `${1 - t}`
      greenBox.style.opacity = `${1 - t}`
    })
    yield* Kinema.join(circleFork)
    yield* Kinema.all(
      tween(200, (t) => {
        circle.style.opacity = String(1 - t)
      }),
      tween(200, (t) => {
        circle.style.transform = `scale(${1 - t})`
      }),
    )
    yield* delay(100)
  }
})

type State = { box: MockEl; green: MockEl; circle: MockEl }

const snap = (s: State) =>
  JSON.stringify({
    box: s.box.style,
    boxText: s.box.innerText,
    green: s.green.style,
    greenText: s.green.innerText,
    circle: s.circle.style,
  })

function makeRuntime() {
  const state: State = { box: mkEl(), green: mkEl(), circle: mkEl() }
  const runtime = createRuntime()
    .provide(Element, state.box)
    .provide(GreenElement, state.green)
    .provide(Circle, state.circle)
    .build()
  return { runtime, state }
}

describe('slider workflow determinism', () => {
  it('backward jumps into 2nd/3rd loop iteration match sequential play', () => {
    const { runtime, state } = makeRuntime()
    runtime.run(workflow, 0)

    const snapshots = new Map<number, string>()
    for (let t = 0; t <= 10000; t += 25) {
      runtime.tick(t)
      snapshots.set(t, snap(state))
    }

    const targets = [3125, 3375, 4725, 5000, 7000, 8500]
    for (const target of targets) {
      runtime.tick(target)
      const afterJump = snap(state)
      const expected = snapshots.get(target)!
      console.log(`t=${target}: match=${afterJump === expected}`)
      if (afterJump !== expected) {
        console.log(`  expected: ${expected}`)
        console.log(`  actual:   ${afterJump}`)
      }
      expect(afterJump).toBe(expected)
    }
  })

  it('big forward jumps from 0 match sequential play', () => {
    const ref = makeRuntime()
    ref.runtime.run(workflow, 0)
    const snapshots = new Map<number, string>()
    for (let t = 0; t <= 10000; t += 25) {
      ref.runtime.tick(t)
      snapshots.set(t, snap(ref.state))
    }

    const targets = [3125, 3375, 4725, 5000, 7000, 8500]
    for (const target of targets) {
      const { runtime, state } = makeRuntime()
      runtime.run(workflow, 0)
      runtime.tick(0)
      runtime.tick(target)
      const afterJump = snap(state)
      const expected = snapshots.get(target)!
      console.log(`fwd t=${target}: match=${afterJump === expected}`)
      if (afterJump !== expected) {
        console.log(`  expected: ${expected}`)
        console.log(`  actual:   ${afterJump}`)
      }
      expect(afterJump).toBe(expected)
    }
  })

  it('loop iterations are periodic: state at t equals state at t + period', () => {
    // regression: joining an already-finished fork used to rewind the fiber
    // clock, restarting the loop early and freezing the circle spring
    const { runtime, state } = makeRuntime()
    runtime.run(workflow, 0)

    const snapshots = new Map<number, string>()
    for (let t = 0; t <= 7000; t += 25) {
      runtime.tick(t)
      snapshots.set(t, snap(state))
    }

    const period = 3500 // iteration length: wf ends 2900, +defer 100, +fade 200, +circle fade 200, +delay 100... anchored by loop-top logs
    for (let t = 100; t <= 3400; t += 100) {
      expect(snapshots.get(t + period)).toBe(snapshots.get(t))
    }
  })
})
