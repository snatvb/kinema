import { Kinema } from './runtime.js'
import type { Clip } from './runtime.js'

export interface CreateSpringConfig {
  stiffness: number
  damping: number
  mass?: number
  precision?: number
}

function buildSpringFunction(
  stiffness: number,
  damping: number,
  mass: number,
): (t: number) => number {
  const w0 = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))

  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    const ratio = (zeta * w0) / wd
    return (t: number) =>
      1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ratio * Math.sin(wd * t))
  } else if (zeta === 1) {
    return (t: number) => 1 - (1 + w0 * t) * Math.exp(-w0 * t)
  } else {
    const sq = Math.sqrt(zeta * zeta - 1)
    const s1 = -w0 * (zeta + sq)
    const s2 = -w0 * (zeta - sq)
    const denom = s2 - s1
    return (t: number) => 1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / denom
  }
}

function computeSettlingTime(
  stiffness: number,
  damping: number,
  mass: number,
  precision: number,
): number {
  const w0 = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))

  if (zeta < 1) {
    return -Math.log(precision) / (zeta * w0)
  } else if (zeta === 1) {
    let lo = 0
    let hi = 20 / w0
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      if ((1 + w0 * mid) * Math.exp(-w0 * mid) < precision) {
        hi = mid
      } else {
        lo = mid
      }
    }
    return hi
  } else {
    const sq = Math.sqrt(zeta * zeta - 1)
    const slowPole = w0 * (zeta - sq)
    return -Math.log(precision) / slowPole
  }
}

export const springs = {
  default: { stiffness: 170, damping: 26 },
  gentle: { stiffness: 120, damping: 14 },
  wobbly: { stiffness: 180, damping: 12 },
  stiff: { stiffness: 210, damping: 20 },
  slow: { stiffness: 280, damping: 60 },
  molasses: { stiffness: 120, damping: 50 },
} satisfies Record<string, CreateSpringConfig>

export function createSpring(config: CreateSpringConfig) {
  const { stiffness, damping, mass = 1, precision = 0.001 } = config
  const springFn = buildSpringFunction(stiffness, damping, mass)
  const naturalDuration = computeSettlingTime(stiffness, damping, mass, precision)

  return function springClip(onUpdate: (value: number) => void): Clip<void, never, never> {
    const ms = Math.ceil(naturalDuration * 1000)

    return Kinema.create<void>(ms, () => {
      return {
        tick(localTime: number) {
          const t = localTime / 1000
          onUpdate(springFn(t))
        },
        destroy() {},
      }
    })
  }
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

export function interpolate(from: number, to: number): (t: number) => number {
  return (t: number) => lerp(from, to, t)
}

export function snap(value: number, step: number): number {
  if (step <= 0) {
    return value
  }
  return Math.round(value / step) * step
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export const easeInQuad = (t: number) => t * t
export const easeOutQuad = (t: number) => t * (2 - t)
export const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

export const easeInCubic = (t: number) => t * t * t
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export const easeInQuart = (t: number) => t * t * t * t
export const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4)
export const easeInOutQuart = (t: number) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2

export const easeInQuint = (t: number) => t * t * t * t * t
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5)
export const easeInOutQuint = (t: number) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2

export const easeInSine = (t: number) => 1 - Math.cos((t * Math.PI) / 2)
export const easeOutSine = (t: number) => Math.sin((t * Math.PI) / 2)
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2

export const easeInExpo = (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10))
export const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))
export const easeInOutExpo = (t: number) => {
  if (t === 0) {
    return 0
  }
  if (t === 1) {
    return 1
  }
  if (t < 0.5) {
    return Math.pow(2, 20 * t - 10) / 2
  }
  return (2 - Math.pow(2, -20 * t + 10)) / 2
}

const c1 = 1.70158
const c2 = c1 * 1.525
const c3 = c1 + 1

export const easeInBack = (t: number) => c3 * t * t * t - c1 * t * t
export const easeOutBack = (t: number) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
export const easeInOutBack = (t: number) => {
  if (t < 0.5) {
    return (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
  }
  return (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2
}

export const easeOutBounce = (t: number) => {
  const n1 = 7.5625
  const d1 = 2.75

  if (t < 1 / d1) {
    return n1 * t * t
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375
  }
}

export const easeInBounce = (t: number) => 1 - easeOutBounce(1 - t)

export const easeInOutBounce = (t: number) =>
  t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2

export const easeInElastic = (t: number) => {
  if (t === 0 || t === 1) {
    return t
  }
  return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3))
}

export const easeOutElastic = (t: number) => {
  if (t === 0 || t === 1) {
    return t
  }
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
}

export const easeInOutElastic = (t: number) => {
  if (t === 0 || t === 1) {
    return t
  }
  if (t < 0.5) {
    return -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2
  }
  return (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2 + 1
}

const noop = () => {}

export const tween = (
  duration: number,
  onUpdate: (t: number) => void,
  options: { easing?: (t: number) => number } = {},
) => {
  const easing = options.easing ?? ((t) => t)

  return Kinema.create<void>(duration, () => {
    return {
      tick(localTime) {
        const progress = Math.max(0, Math.min(localTime / duration, 1))
        onUpdate(easing(progress))
      },
      destroy() {},
    }
  })
}

export const delay = (duration: number) => tween(duration, noop)
