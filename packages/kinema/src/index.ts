export function hello() {
  return 'Hello from kinema!'
}

export { Clip, makeClip, createRuntime, tag, Kinema, isInterrupted } from './runtime.js'
export type {
  Tag,
  ClipCommand,
  KinemaRuntime,
  KinemaRuntimeBuilder,
  Interrupted,
} from './runtime.js'

export { createSpring, springs, tween, delay, easeInOutQuad } from './animations.js'
export type { CreateSpringConfig } from './animations.js'
