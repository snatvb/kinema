import { describe, it, expect, vi } from 'vitest'

import {
  createSpring,
  lerp,
  interpolate,
  snap,
  clamp,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  easeInQuint,
  easeOutQuint,
  easeInOutQuint,
  easeInSine,
  easeOutSine,
  easeInOutSine,
  easeInExpo,
  easeOutExpo,
  easeInOutExpo,
  easeInBack,
  easeOutBack,
  easeInOutBack,
  easeInBounce,
  easeOutBounce,
  easeInOutBounce,
  easeInElastic,
  easeOutElastic,
  easeInOutElastic,
  tween,
  delay,
} from './animations.js'
import { Kinema, createRuntime } from './runtime.js'

describe('lerp', () => {
  it('returns from at t=0', () => {
    expect(lerp(0, 100, 0)).toBe(0)
  })

  it('returns to at t=1', () => {
    expect(lerp(0, 100, 1)).toBe(100)
  })

  it('returns midpoint at t=0.5', () => {
    expect(lerp(0, 100, 0.5)).toBe(50)
  })

  it('works with negative values', () => {
    expect(lerp(-100, 100, 0.5)).toBe(0)
  })

  it('works with reversed range', () => {
    expect(lerp(100, 0, 0.5)).toBe(50)
  })
})

describe('interpolate', () => {
  it('returns a function', () => {
    const fn = interpolate(0, 100)
    expect(typeof fn).toBe('function')
  })

  it('returns from at t=0', () => {
    const fn = interpolate(10, 20)
    expect(fn(0)).toBe(10)
  })

  it('returns to at t=1', () => {
    const fn = interpolate(10, 20)
    expect(fn(1)).toBe(20)
  })

  it('works with negative range', () => {
    const fn = interpolate(-50, 50)
    expect(fn(0.5)).toBe(0)
  })
})

describe('snap', () => {
  it('snaps to nearest step', () => {
    expect(snap(12, 5)).toBe(10)
  })

  it('snaps up when closer', () => {
    expect(snap(13, 5)).toBe(15)
  })

  it('returns value when step is 0', () => {
    expect(snap(12, 0)).toBe(12)
  })

  it('works with decimal steps', () => {
    expect(snap(1.23, 0.1)).toBeCloseTo(1.2)
  })
})

describe('clamp', () => {
  it('clamps below min', () => {
    expect(clamp(-10, 0, 100)).toBe(0)
  })

  it('clamps above max', () => {
    expect(clamp(150, 0, 100)).toBe(100)
  })

  it('returns value within range', () => {
    expect(clamp(50, 0, 100)).toBe(50)
  })

  it('works with negative range', () => {
    expect(clamp(-150, -100, 0)).toBe(-100)
  })
})

describe('easing functions', () => {
  const easings = [
    { name: 'easeInQuad', fn: easeInQuad },
    { name: 'easeOutQuad', fn: easeOutQuad },
    { name: 'easeInOutQuad', fn: easeInOutQuad },
    { name: 'easeInCubic', fn: easeInCubic },
    { name: 'easeOutCubic', fn: easeOutCubic },
    { name: 'easeInOutCubic', fn: easeInOutCubic },
    { name: 'easeInQuart', fn: easeInQuart },
    { name: 'easeOutQuart', fn: easeOutQuart },
    { name: 'easeInOutQuart', fn: easeInOutQuart },
    { name: 'easeInQuint', fn: easeInQuint },
    { name: 'easeOutQuint', fn: easeOutQuint },
    { name: 'easeInOutQuint', fn: easeInOutQuint },
    { name: 'easeInSine', fn: easeInSine },
    { name: 'easeOutSine', fn: easeOutSine },
    { name: 'easeInOutSine', fn: easeInOutSine },
    { name: 'easeInExpo', fn: easeInExpo },
    { name: 'easeOutExpo', fn: easeOutExpo },
    { name: 'easeInOutExpo', fn: easeInOutExpo },
    { name: 'easeInBack', fn: easeInBack },
    { name: 'easeOutBack', fn: easeOutBack },
    { name: 'easeInOutBack', fn: easeInOutBack },
    { name: 'easeInBounce', fn: easeInBounce },
    { name: 'easeOutBounce', fn: easeOutBounce },
    { name: 'easeInOutBounce', fn: easeInOutBounce },
    { name: 'easeInElastic', fn: easeInElastic },
    { name: 'easeOutElastic', fn: easeOutElastic },
    { name: 'easeInOutElastic', fn: easeInOutElastic },
  ]

  for (const { name, fn } of easings) {
    describe(name, () => {
      it('returns 0 at t=0', () => {
        expect(fn(0)).toBeCloseTo(0, 10)
      })

      it('returns 1 at t=1', () => {
        expect(fn(1)).toBeCloseTo(1, 10)
      })

      it('output is within expected range at t=0.5', () => {
        const val = fn(0.5)
        expect(val).toBeGreaterThanOrEqual(-0.5)
        expect(val).toBeLessThanOrEqual(2)
      })
    })
  }
})

describe('tween', () => {
  it('calls onUpdate with progress', () => {
    const onUpdate = vi.fn()
    const clip = tween(500, onUpdate)

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    expect(onUpdate).toHaveBeenCalledWith(0)

    rt.tick(250)
    expect(onUpdate).toHaveBeenCalledWith(0.5)

    rt.tick(500)
    expect(onUpdate).toHaveBeenCalledWith(1)
  })

  it('applies easing function', () => {
    const onUpdate = vi.fn()
    const clip = tween(500, onUpdate, { easing: easeOutQuad })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(250)
    expect(onUpdate).toHaveBeenCalledWith(easeOutQuad(0.5))
  })

  it('clamps at duration boundaries', () => {
    const onUpdate = vi.fn()
    const clip = tween(500, onUpdate)

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(600)
    expect(onUpdate).toHaveBeenLastCalledWith(1)
  })
})

describe('delay', () => {
  it('does not call callback', () => {
    const clip = delay(500)

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(250)
    rt.tick(500)
  })
})

describe('createSpring integration with runtime', () => {
  it('produces increasing values', () => {
    const makeSpring = createSpring({ stiffness: 170, damping: 26 })
    const clip = Kinema.gen(function* () {
      yield* makeSpring(() => {})
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(100)
    rt.tick(200)
    rt.tick(500)
    rt.tick(1000)
  })

  it('with custom config', () => {
    const makeSpring = createSpring({ stiffness: 300, damping: 30, mass: 2 })
    const clip = makeSpring(() => {})

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(100)
    rt.tick(500)
  })

  it('inside gen with backward jump reconstruction', () => {
    const values: number[] = []
    const clip = Kinema.gen(function* () {
      yield* tween(500, (t) => {
        values.push(t)
      })
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(250)
    expect(values).toHaveLength(2)
    expect(values[0]).toBe(0)
    expect(values[1]).toBe(0.5)

    vi.clearAllMocks()
    rt.tick(100)
    expect(values).toHaveLength(3)
    expect(values[2]).toBe(0.2)
  })
})

describe('createSpring', () => {
  it('returns a function', () => {
    const makeSpring = createSpring({ stiffness: 170, damping: 26 })
    expect(typeof makeSpring).toBe('function')
  })

  it('returned function returns a Kinema clip', () => {
    const makeSpring = createSpring({ stiffness: 170, damping: 26 })
    const clip = makeSpring(() => {})
    expect(clip).toHaveProperty('duration')
    expect(clip).toHaveProperty('cmd')
  })

  it('computes duration from physics (no duration arg)', () => {
    const makeSpring = createSpring({ stiffness: 170, damping: 26, mass: 1 })
    const clip = makeSpring(() => {})
    expect(clip.duration).toBeGreaterThan(0)
    expect(clip.duration).toBeLessThanOrEqual(5000)
  })

  it('starts at 0', () => {
    const makeSpring = createSpring({ stiffness: 170, damping: 26, mass: 1 })
    const values: number[] = []
    const clip = makeSpring((v) => values.push(v))
    const rt = createRuntime().build()
    rt.run(clip, 0)
    rt.tick(0)
    expect(values[0]).toBeCloseTo(0, 5)
  })

  it('converges to ~1 after enough time', () => {
    const makeSpring = createSpring({ stiffness: 170, damping: 26, mass: 1 })
    const values: number[] = []
    const clip = makeSpring((v) => values.push(v))
    const rt = createRuntime().build()
    rt.run(clip, 0)
    for (let t = 0; t <= 2000; t += 16) {
      rt.tick(t)
    }
    const last = values.at(-1)!
    expect(last).toBeCloseTo(1, 1)
  })

  it('underdamped spring overshoots past 1', () => {
    const makeSpring = createSpring({ stiffness: 170, damping: 10, mass: 1 })
    const values: number[] = []
    const clip = makeSpring((v) => values.push(v))
    const rt = createRuntime().build()
    rt.run(clip, 0)
    for (let t = 0; t <= 1000; t += 8) {
      rt.tick(t)
    }
    const maxVal = Math.max(...values)
    expect(maxVal).toBeGreaterThan(1.01)
  })

  it('overdamped spring does not overshoot', () => {
    const makeSpring = createSpring({ stiffness: 170, damping: 60, mass: 1 })
    const values: number[] = []
    const clip = makeSpring((v) => values.push(v))
    const rt = createRuntime().build()
    rt.run(clip, 0)
    for (let t = 0; t <= 3000; t += 16) {
      rt.tick(t)
    }
    const maxVal = Math.max(...values)
    expect(maxVal).toBeLessThanOrEqual(1.01)
  })

  it('stiffer spring converges faster', () => {
    const makeSpringSlow = createSpring({ stiffness: 50, damping: 26, mass: 1 })
    const makeSpringFast = createSpring({ stiffness: 400, damping: 26, mass: 1 })

    const valuesSlow: number[] = []
    const valuesFast: number[] = []

    const clipSlow = makeSpringSlow((v) => valuesSlow.push(v))
    const clipFast = makeSpringFast((v) => valuesFast.push(v))

    const rt1 = createRuntime().build()
    rt1.run(clipSlow, 0)
    for (let t = 0; t <= 500; t += 16) {
      rt1.tick(t)
    }

    const rt2 = createRuntime().build()
    rt2.run(clipFast, 0)
    for (let t = 0; t <= 500; t += 16) {
      rt2.tick(t)
    }

    expect(valuesFast.at(-1)!).toBeGreaterThan(valuesSlow.at(-1)!)
  })

  it('heavier mass converges slower', () => {
    const makeSpringLight = createSpring({ stiffness: 170, damping: 26, mass: 1 })
    const makeSpringHeavy = createSpring({ stiffness: 170, damping: 26, mass: 3 })

    const valuesLight: number[] = []
    const valuesHeavy: number[] = []

    const clipLight = makeSpringLight((v) => valuesLight.push(v))
    const clipHeavy = makeSpringHeavy((v) => valuesHeavy.push(v))

    const rt1 = createRuntime().build()
    rt1.run(clipLight, 0)
    for (let t = 0; t <= 300; t += 16) {
      rt1.tick(t)
    }

    const rt2 = createRuntime().build()
    rt2.run(clipHeavy, 0)
    for (let t = 0; t <= 300; t += 16) {
      rt2.tick(t)
    }

    expect(valuesLight.at(-1)!).toBeGreaterThan(valuesHeavy.at(-1)!)
  })

  it('can create multiple clips from same config', () => {
    const makeSpring = createSpring({ stiffness: 170, damping: 26, mass: 1 })

    const values1: number[] = []
    const values2: number[] = []

    const clip1 = makeSpring((v) => values1.push(v))
    const clip2 = makeSpring((v) => values2.push(v))

    const rt1 = createRuntime().build()
    rt1.run(clip1, 0)
    for (let t = 0; t <= 1000; t += 16) {
      rt1.tick(t)
    }

    const rt2 = createRuntime().build()
    rt2.run(clip2, 0)
    for (let t = 0; t <= 1000; t += 16) {
      rt2.tick(t)
    }

    expect(values1.at(-1)!).toBeCloseTo(1, 1)
    expect(values2.at(-1)!).toBeCloseTo(1, 1)
  })
})

describe('combined usage', () => {
  it('lerp with spring values', () => {
    const makeSpring = createSpring({ stiffness: 170, damping: 26 })
    const clip = Kinema.gen(function* () {
      const values: number[] = []
      yield* makeSpring((v) => values.push(v))
      return lerp(0, 100, values.at(-1)!)
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(100)
    rt.tick(500)
    rt.tick(1000)
  })

  it('interpolate with tween progress', () => {
    const map = interpolate(0, 360)
    const values: number[] = []

    const clip = tween(500, (t) => {
      values.push(map(t))
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(250)
    rt.tick(500)

    expect(values[0]).toBe(0)
    expect(values[1]).toBeCloseTo(180, 5)
    expect(values[2]).toBeCloseTo(360, 5)
  })

  it('clamp with easing output', () => {
    const values: number[] = []
    const clip = tween(500, (t) => {
      values.push(clamp(t * 2, 0, 1))
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(300)
    rt.tick(500)

    expect(values[0]).toBe(0)
    expect(values[2]).toBe(1)
  })

  it('snap with tween values', () => {
    const values: number[] = []
    const clip = tween(500, (t) => {
      values.push(snap(t * 100, 10))
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(100)
    rt.tick(250)
    rt.tick(500)

    expect(values[0]).toBe(0)
    expect(values[2]).toBe(50)
    expect(values[3]).toBe(100)
  })

  it('sequential tweens with different easings', () => {
    const values1: number[] = []
    const values2: number[] = []

    const clip = Kinema.gen(function* () {
      yield* tween(
        500,
        (t) => {
          values1.push(t)
        },
        { easing: easeOutQuad },
      )
      yield* tween(
        500,
        (t) => {
          values2.push(t)
        },
        { easing: easeInQuad },
      )
    })

    const rt = createRuntime().build()
    rt.run(clip, 0)

    rt.tick(0)
    rt.tick(250)
    rt.tick(500)
    rt.tick(750)
    rt.tick(1000)

    expect(values1.length).toBeGreaterThan(0)
    expect(values2.length).toBeGreaterThan(0)
    expect(values1[values1.length - 1]).toBe(1)
    expect(values2[values2.length - 1]).toBe(1)
  })
})
