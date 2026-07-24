export interface Tag<Id, _T = Id> {
  readonly _tag: Id
}

export function tag<T>(_phantom?: T) {
  return <Id extends string>(id: Id): Tag<Id, T> => ({ _tag: id })
}

export interface Interrupted<I = never> {
  readonly _tag: 'Interrupted'
  readonly reason: I
}

export function isInterrupted(value: unknown): value is Interrupted<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_tag' in value &&
    (value as { _tag: unknown })._tag === 'Interrupted'
  )
}

function interrupted<I>(reason: I): Interrupted<I> {
  return { _tag: 'Interrupted', reason }
}

export type ClipCommand<A, I, R> =
  | { readonly _tag: 'Succeed'; readonly value: A }
  | {
      readonly _tag: 'Custom'
      readonly create: (context: R) => CustomClipInstance<A, I>
    }
  | {
      readonly _tag: 'Gen'
      readonly generatorFactory: () => Generator<Clip<any, any, any>, A, any>
      readonly catchInterrupts?: boolean
    }
  | { readonly _tag: 'Fork'; readonly clip: Clip<any, any, any> }
  | { readonly _tag: 'Spawn'; readonly clip: Clip<any, any, any> }
  | { readonly _tag: 'Join'; readonly fiber: FiberImpl }
  | { readonly _tag: 'Use'; readonly tag: Tag<any, any> }
  | {
      readonly _tag: 'Provide'
      readonly clip: Clip<any, any, any>
      readonly tag: Tag<any, any>
      readonly value: any
    }
  | { readonly _tag: 'All'; readonly clips: Clip<any, any, any>[] }
  | { readonly _tag: 'Race'; readonly clips: Clip<any, any, any>[] }
  | { readonly _tag: 'GetTime'; readonly scope: 'local' | 'global' }
  | { readonly _tag: 'Interrupt'; readonly reason: any }
  | { readonly _tag: 'Try'; readonly clip: Clip<any, any, any> }
  | {
      readonly _tag: 'Catch'
      readonly clip: Clip<any, any, any>
      readonly handler: (reason: any) => Clip<any, any, any>
    }
  | {
      readonly _tag: 'Retry'
      readonly maxRetries: number
      readonly clip: Clip<any, any, any>
    }
  | {
      readonly _tag: 'Repeat'
      readonly times: number
      readonly clip: Clip<any, any, any>
    }
  | {
      readonly _tag: 'Defer'
      readonly defer: (() => void) | Clip<any, any, any>
    }

// oxlint-disable-next-line no-unused-vars
export interface CustomClipInstance<A, I> {
  tick(time: number): void
  destroy(): void
}

export interface Clip<A, I = never, R = never> {
  readonly [Symbol.iterator]: () => Generator<Clip<A, I, R>, A, any>
  readonly cmd: ClipCommand<any, any, any>
  readonly duration: number
  // ponytail: phantom fields — without them TS treats Clips with different I/R
  // as mutually assignable (recursion bailout) and collapses yield-type unions
  // in gen() to the first member
  readonly _I: [I] | undefined
  readonly _R: [R] | undefined
}

export function makeClip<A, I, R>(cmd: ClipCommand<A, I, R>, duration = 0): Clip<A, I, R> {
  const clip: Clip<A, I, R> = {
    cmd,
    duration,
    *[Symbol.iterator]() {
      return yield clip
    },
  } as Clip<A, I, R>
  return clip
}

export const Clip = {
  succeed: <A>(value: A): Clip<A, never, never> => makeClip({ _tag: 'Succeed', value }, 0),

  create: <A, I = never, R = never>(
    duration: number,
    createFn: (context: R) => CustomClipInstance<A, I>,
  ): Clip<A, I, R> => makeClip({ _tag: 'Custom', create: createFn }, duration),

  gen: <Yield, A>(
    f: () => Generator<Yield, A, unknown>,
  ): Clip<
    A,
    Yield extends Clip<any, infer I, any> ? I : never,
    Yield extends Clip<any, any, infer R> ? R : never
  > => makeClip({ _tag: 'Gen', generatorFactory: f as any }, 0),

  fork: <A, I = never, R = never>(clip: Clip<A, I, R>): Clip<FiberImpl, I, R> =>
    makeClip({ _tag: 'Fork', clip }),

  spawn: <A, I = never, R = never>(clip: Clip<A, I, R>): Clip<FiberImpl, I, R> =>
    makeClip({ _tag: 'Spawn', clip }),

  join: (fiber: FiberImpl): Clip<void, never, never> => makeClip({ _tag: 'Join', fiber }, 0),

  use: <Id, T>(t: Tag<Id, T>): Clip<T, never, Tag<Id, T>> =>
    makeClip({ _tag: 'Use', tag: t }, 0) as any,

  provide:
    <Id, T>(t: Tag<Id, T>, value: T) =>
    <A, I, R>(clip: Clip<A, I, R>): Clip<A, I, Exclude<R, Tag<Id, T>>> =>
      makeClip({ _tag: 'Provide', clip, tag: t, value }, clip.duration) as any,

  all: <const Clips extends readonly Clip<any, any, any>[]>(
    ...clips: Clips
  ): Clip<
    { [K in keyof Clips]: Clips[K] extends Clip<infer A, any, any> ? A : never },
    Clips[number] extends Clip<any, infer I, any> ? I : never,
    Clips[number] extends Clip<any, any, infer R> ? R : never
  > => makeClip({ _tag: 'All', clips: [...clips] }) as any,

  race: <const Clips extends readonly Clip<any, any, any>[]>(
    ...clips: Clips
  ): Clip<
    Clips[number] extends Clip<infer A, any, any> ? A : never,
    Clips[number] extends Clip<any, infer I, any> ? I : never,
    Clips[number] extends Clip<any, any, infer R> ? R : never
  > => makeClip({ _tag: 'Race', clips: [...clips] }) as any,

  interrupt: <R = never>(reason?: R): Clip<never, R, never> =>
    makeClip({ _tag: 'Interrupt', reason }, 0) as any,

  try: <A, I, R>(clip: Clip<A, I, R>): Clip<A, never, R> =>
    makeClip({ _tag: 'Try', clip }, clip.duration) as any,

  catch: <A, I, R>(
    clip: Clip<A, I, R>,
    handler: (reason: I) => Clip<any, any, any>,
  ): Clip<A, never, R> => makeClip({ _tag: 'Catch', clip, handler }, clip.duration) as any,

  retry: <A, I, R>(maxRetries: number, clip: Clip<A, I, R>): Clip<A, I, R> =>
    makeClip({ _tag: 'Retry', maxRetries, clip }, clip.duration) as any,

  repeat: <A, I, R>(times: number, clip: Clip<A, I, R>): Clip<void, I, R> =>
    Clip.gen(function* () {
      for (let i = 0; i < times; i++) {
        yield* clip
      }
    }),

  getTime: (scope: 'local' | 'global'): Clip<number, never, never> =>
    makeClip({ _tag: 'GetTime', scope }, 0),

  defer: (callback: (() => void) | Clip<any, any, any>): Clip<void, never, never> =>
    makeClip({ _tag: 'Defer', defer: callback }, 0) as any,
}

type DeferEntry =
  | { type: 'sync'; callback: () => void }
  | { type: 'async'; clip: Clip<any, any, any> }

type StackFrame =
  | {
      _tag: 'Iterator'
      iterator: Generator<any, any, any>
      catchInterrupts?: boolean
      defers: DeferEntry[]
    }
  | {
      _tag: 'Instance'
      instance: CustomClipInstance<any, any>
      startTime: number
      duration: number
    }
  // minTime: parent's own clock when the wait started — completion time is
  // max(minTime, child end), joining an early-finished child never rewinds time
  | { _tag: 'WaitingForChild'; childFiber: FiberImpl; minTime: number }
  | { _tag: 'WaitingForAll'; children: FiberImpl[]; preserveValue?: any }
  | { _tag: 'WaitingForRace'; children: FiberImpl[] }
  | { _tag: 'Provide'; parentContext: Map<string, any> }
  | {
      _tag: 'Catch'
      childFiber: FiberImpl
      handler: (reason: any) => Clip<any, any, any>
      minTime: number
    }
  | {
      _tag: 'Retry'
      childFiber: FiberImpl
      clip: Clip<any, any, any>
      maxRetries: number
      retriesUsed: number
      minTime: number
    }

// ── FiberImpl ──

// Shared per-runtime environment: one object, passed to every fiber
interface FiberEnv {
  fibers: FiberImpl[] | undefined
  pool: FiberImpl[]
  providerMap: Map<string, any>
}

class FiberImpl {
  readonly stack: StackFrame[] = []
  spawnedTime: number = 0
  nextFiberTime: number = 0
  lastValue: any = undefined
  lastTickTime: number = -1
  initialClip: Clip<any, any, any> = undefined as any
  context: Map<string, any> = undefined as any
  readonly pendingForks: Clip<any, any, any>[] = []
  readonly pendingSpawns: Clip<any, any, any>[] = []
  readonly children: FiberImpl[] = []
  parent: FiberImpl | null = null
  interrupted: Interrupted<any> | null = null
  env: FiberEnv = undefined as any
  // ponytail: fork/spawn children escape to user code via join(fiber) — they
  // are destroyed but never pooled, a reused handle would corrupt late joins
  pooled = true
  private released = false

  constructor(
    context: Map<string, any>,
    initialClip: Clip<any, any, any>,
    time: number,
    env: FiberEnv,
  ) {
    this.reset(context, initialClip, time, env)
  }

  reset(
    context: Map<string, any>,
    initialClip: Clip<any, any, any>,
    time: number,
    env: FiberEnv,
  ): this {
    this.context = context
    this.initialClip = initialClip
    this.spawnedTime = time
    this.nextFiberTime = time
    this.lastValue = undefined
    this.lastTickTime = -1
    this.interrupted = null
    this.parent = null
    this.pooled = true
    this.released = false
    this.env = env
    this.stack.length = 0
    this.pendingForks.length = 0
    this.pendingSpawns.length = 0
    this.children.length = 0
    this.addNext(initialClip, time)
    return this
  }

  // Take a child fiber from the pool (or allocate), register as child
  private spawnChild(clip: Clip<any, any, any>, time: number): FiberImpl {
    const pool = this.env.pool
    const child =
      pool.length > 0
        ? pool.pop()!.reset(this.env.providerMap, clip, time, this.env)
        : new FiberImpl(this.env.providerMap, clip, time, this.env)
    child.parent = this
    this.children.push(child)
    return child
  }

  // Fiber finished naturally (stack empty). Pool it without touching its
  // children — spawned descendants may still be running on the runtime list.
  recycle() {
    if (this.released) return
    this.released = true
    this.children.length = 0
    if (this.pooled) this.env.pool.push(this)
  }

  // Kill fiber + subtree, then pool it
  release() {
    if (this.released) return
    this.destroy()
    this.recycle()
  }

  addNext(clip: Clip<any, any, any>, time: number) {
    const cmd = clip.cmd

    if (cmd._tag === 'Succeed') {
      this.lastValue = cmd.value
    } else if (cmd._tag === 'Custom') {
      this.nextFiberTime = time + clip.duration
      this.stack.push({
        _tag: 'Instance',
        instance: cmd.create(this.context),
        duration: clip.duration,
        startTime: time,
      })
    } else if (cmd._tag === 'Gen') {
      this.stack.push({
        _tag: 'Iterator',
        iterator: cmd.generatorFactory(),
        catchInterrupts: cmd.catchInterrupts,
        defers: [],
      })
    } else if (cmd._tag === 'Fork') {
      this.pendingForks.push(cmd.clip)
    } else if (cmd._tag === 'Spawn') {
      this.pendingSpawns.push(cmd.clip)
    } else if (cmd._tag === 'Join') {
      this.stack.push({
        _tag: 'WaitingForChild',
        childFiber: cmd.fiber,
        minTime: this.nextFiberTime,
      })
    } else if (cmd._tag === 'Use') {
      const service = this.context.get(cmd.tag._tag)
      if (service === undefined) {
        throw new Error(`Missing dependency for tag`)
      }
      this.lastValue = service
    } else if (cmd._tag === 'Provide') {
      this.stack.push({
        _tag: 'Provide',
        parentContext: this.context,
      })
      this.context = new Map(this.context)
      this.context.set(cmd.tag._tag, cmd.value)
      this.addNext(cmd.clip, time)
    } else if (cmd._tag === 'All' || cmd._tag === 'Race') {
      const children = cmd.clips.map((clip) => this.spawnChild(clip, time))
      if (cmd._tag === 'All') {
        this.stack.push({ _tag: 'WaitingForAll', children })
      } else {
        this.stack.push({ _tag: 'WaitingForRace', children })
      }
      this.nextFiberTime = Infinity
    } else if (cmd._tag === 'GetTime') {
      this.lastValue =
        cmd.scope === 'local' ? this.nextFiberTime - this.spawnedTime : this.nextFiberTime
    } else if (cmd._tag === 'Interrupt') {
      this.interrupted = interrupted(cmd.reason)
      this.lastValue = this.interrupted
      const asyncDeferClips = this.terminate()
      if (asyncDeferClips.length > 0) {
        const children = asyncDeferClips.map((clip) => this.spawnChild(clip, this.nextFiberTime))
        this.stack.push({ _tag: 'WaitingForAll', children, preserveValue: this.lastValue })
        this.nextFiberTime = Infinity
      }
    } else if (cmd._tag === 'Try') {
      this.addNext(cmd.clip, time)
    } else if (cmd._tag === 'Catch') {
      const child = this.spawnChild(cmd.clip, time)
      this.stack.push({
        _tag: 'Catch',
        childFiber: child,
        handler: cmd.handler,
        minTime: this.nextFiberTime,
      })
    } else if (cmd._tag === 'Retry') {
      if (cmd.maxRetries <= 0) {
        // retry(0) = no retries, skip clip entirely
        this.lastValue = undefined
      } else {
        const child = this.spawnChild(cmd.clip, time)
        this.stack.push({
          _tag: 'Retry',
          childFiber: child,
          clip: cmd.clip,
          maxRetries: cmd.maxRetries,
          retriesUsed: 0,
          minTime: this.nextFiberTime,
        })
      }
    } else if (cmd._tag === 'Defer') {
      // Find the current Iterator frame and add defer to it
      for (let i = this.stack.length - 1; i >= 0; i--) {
        const frame = this.stack[i]!
        if (frame._tag === 'Iterator') {
          if (typeof cmd.defer === 'function') {
            frame.defers.push({ type: 'sync', callback: cmd.defer })
          } else {
            frame.defers.push({ type: 'async', clip: cmd.defer })
          }
          break
        }
      }
      this.lastValue = undefined
    }
  }

  private terminate(): Clip<any, any, any>[] {
    const asyncDeferClips: Clip<any, any, any>[] = []
    while (this.stack.length > 0) {
      const frame = this.stack[this.stack.length - 1]!
      if (frame._tag === 'Iterator') {
        for (let i = frame.defers.length - 1; i >= 0; i--) {
          const entry = frame.defers[i]!
          if (entry.type === 'sync') {
            entry.callback()
          } else {
            asyncDeferClips.push(entry.clip)
          }
        }
        frame.defers.length = 0
      }
      this.stack.pop()
    }
    return asyncDeferClips
  }

  private runDefers(defers: DeferEntry[]) {
    // LIFO order
    for (let i = defers.length - 1; i >= 0; i--) {
      const entry = defers[i]!
      if (entry.type === 'sync') {
        entry.callback()
      }
    }
  }

  private destroyFrame(frame: StackFrame) {
    if (frame._tag === 'Instance') {
      frame.instance.destroy()
    } else if (frame._tag === 'Iterator') {
      this.runDefers(frame.defers)
      frame.iterator.return(null)
    } else if (frame._tag === 'WaitingForChild') {
      frame.childFiber.release()
    } else if (frame._tag === 'WaitingForAll' || frame._tag === 'WaitingForRace') {
      for (const child of frame.children) {
        child.release()
      }
    } else if (frame._tag === 'Catch') {
      frame.childFiber.release()
    } else if (frame._tag === 'Retry') {
      frame.childFiber.release()
    }
  }

  rebuild() {
    for (const frame of this.stack) {
      this.destroyFrame(frame)
    }
    this.stack.length = 0
    this.lastValue = undefined
    this.lastTickTime = -1
    this.nextFiberTime = this.spawnedTime
    this.interrupted = null
    this.pendingForks.length = 0
    this.pendingSpawns.length = 0
    // Remove old fork children from runtime fibers before destroying them
    const fibers = this.env.fibers
    if (fibers) {
      for (let i = 0; i < this.children.length; i++) {
        const idx = fibers.indexOf(this.children[i]!)
        if (idx !== -1) {
          fibers.splice(idx, 1)
        }
      }
    }
    for (let i = 0; i < this.children.length; i++) {
      this.children[i]!.release()
    }
    this.parent = null
    this.children.length = 0
    this.addNext(this.initialClip, this.spawnedTime)
  }

  destroy() {
    for (const frame of this.stack) {
      this.destroyFrame(frame)
    }
    this.stack.length = 0
    for (let i = 0; i < this.children.length; i++) {
      this.children[i]!.release()
    }
    this.parent = null
    this.children.length = 0
  }

  tick(time: number) {
    if (time < this.spawnedTime) return

    const topFrame = this.stack[this.stack.length - 1]
    const isWaitingForChild = topFrame?._tag === 'WaitingForChild'
    const isSequential =
      this.lastTickTime === -1 ||
      (time >= this.lastTickTime && time <= this.nextFiberTime) ||
      (isWaitingForChild && time >= this.lastTickTime)
    const isTimeJump = !isSequential && this.lastTickTime !== -1

    if (isTimeJump && time < this.lastTickTime) {
      this.rebuild()
    }

    this.lastTickTime = time

    // ponytail: explicit fiber stack instead of recursive child.tick() —
    // waiting frames push the child that needs ticking, one frame-step per
    // iteration; depth of the fiber tree no longer maps to call-stack depth
    const fiberStack: FiberImpl[] = [this]
    while (fiberStack.length > 0) {
      const fiber = fiberStack[fiberStack.length - 1]!
      if (fiber.stack.length === 0) {
        fiberStack.pop()
        continue
      }
      const frame = fiber.stack[fiber.stack.length - 1]!

      if (frame._tag === 'Instance') {
        const localTime = time - frame.startTime
        if (localTime >= frame.duration) {
          frame.instance.tick(frame.duration)
          frame.instance.destroy()
          fiber.stack.pop()
          fiber.lastValue = undefined
          fiber.nextFiberTime = frame.startTime + frame.duration
          continue
        }
        frame.instance.tick(localTime)
        fiberStack.pop() // suspended until a later tick
        continue
      }

      if (frame._tag === 'Iterator') {
        if (fiber.interrupted) {
          fiber.stack.pop()
          continue
        }
        const nextResult = frame.iterator.next(fiber.lastValue)
        fiber.lastValue = undefined
        if (nextResult.done) {
          fiber.lastValue = nextResult.value

          const asyncDeferClips: Clip<any, any, any>[] = []
          for (let di = fiber.stack.length - 1; di >= 0; di--) {
            const df = fiber.stack[di]!
            if (df._tag === 'Iterator') {
              for (let j = df.defers.length - 1; j >= 0; j--) {
                const entry = df.defers[j]!
                if (entry.type === 'sync') {
                  entry.callback()
                } else {
                  asyncDeferClips.push(entry.clip)
                }
              }
              df.defers.length = 0
              break
            }
          }

          fiber.stack.pop()

          if (asyncDeferClips.length > 0) {
            const children = asyncDeferClips.map((clip) =>
              fiber.spawnChild(clip, fiber.nextFiberTime),
            )
            fiber.stack.push({ _tag: 'WaitingForAll', children, preserveValue: fiber.lastValue })
            fiber.nextFiberTime = Infinity
          }
          continue
        }

        fiber.addNext(nextResult.value, fiber.nextFiberTime)

        fiber.flushPendings(fiber.pendingForks)
        fiber.flushPendings(fiber.pendingSpawns)
        continue
      }

      if (frame._tag === 'Provide') {
        fiber.context = frame.parentContext
        fiber.stack.pop()
        continue
      }

      if (frame._tag === 'WaitingForChild') {
        const child = frame.childFiber
        if (fiber.pushIfNeedsTick(fiberStack, child, time)) {
          continue
        }
        if (child.stack.length === 0) {
          fiber.lastValue = child.lastValue
          fiber.nextFiberTime = Math.max(frame.minTime, child.nextFiberTime)
          fiber.stack.pop()
          if (child.interrupted) {
            fiber.interrupted = child.interrupted
            fiber.lastValue = child.lastValue
          }
          child.recycle()
          continue
        }
        // while waiting, mirror child clock but never below our own
        fiber.nextFiberTime = Math.max(frame.minTime, child.nextFiberTime)
        fiberStack.pop() // suspended
        continue
      }

      if (frame._tag === 'WaitingForAll') {
        let allDone = true
        let interruptedChild: FiberImpl | null = null
        for (const child of frame.children) {
          if (child.stack.length > 0) {
            allDone = false
            if (fiber.pushIfNeedsTick(fiberStack, child, time)) {
              break
            }
          } else if (child.interrupted) {
            interruptedChild = child
          }
        }
        // a child was pushed for ticking, revisit this frame after it
        if (!allDone && fiberStack[fiberStack.length - 1] !== fiber) {
          continue
        }
        if (interruptedChild) {
          fiber.interrupted = interruptedChild.interrupted
          fiber.lastValue = interruptedChild.lastValue
          for (const c of frame.children) {
            if (c !== interruptedChild) {
              c.release()
            }
          }
          fiber.stack.pop()
          continue
        }
        if (allDone) {
          fiber.lastValue =
            frame.preserveValue !== undefined
              ? frame.preserveValue
              : frame.children.map((c) => c.lastValue)
          // replaces the Infinity sentinel; children always start at >= parent time
          fiber.nextFiberTime = Math.max(...frame.children.map((c) => c.nextFiberTime))
          fiber.stack.pop()
          for (const c of frame.children) {
            c.recycle()
          }
          continue
        }
        fiberStack.pop() // suspended
        continue
      }

      if (frame._tag === 'WaitingForRace') {
        let winner: FiberImpl | null = null
        let pushed = false
        for (const child of frame.children) {
          if (child.stack.length === 0 && !child.interrupted) {
            winner = child
            break
          }
          if (!pushed && fiber.pushIfNeedsTick(fiberStack, child, time)) {
            pushed = true
          }
        }
        if (pushed) {
          continue
        }
        if (winner) {
          fiber.lastValue = winner.lastValue
          for (const child of frame.children) {
            if (child !== winner) child.release()
          }
          fiber.nextFiberTime = winner.nextFiberTime
          fiber.stack.pop()
          winner.recycle()
          continue
        }
        const allInterrupted = frame.children.every((c) => c.stack.length === 0 && c.interrupted)
        if (allInterrupted) {
          fiber.lastValue = frame.children[0]!.lastValue
          fiber.interrupted = frame.children[0]!.interrupted
          fiber.stack.pop()
          continue
        }
        fiberStack.pop() // suspended
        continue
      }

      if (frame._tag === 'Catch') {
        const child = frame.childFiber
        if (fiber.pushIfNeedsTick(fiberStack, child, time)) {
          continue
        }
        if (child.stack.length === 0) {
          if (child.interrupted) {
            const recoveryClip = frame.handler(child.interrupted.reason)
            const recoveryFiber = fiber.spawnChild(recoveryClip, child.nextFiberTime)
            child.recycle()
            fiber.stack.pop()
            fiber.stack.push({
              _tag: 'WaitingForChild',
              childFiber: recoveryFiber,
              minTime: frame.minTime,
            })
            continue
          } else {
            fiber.lastValue = child.lastValue
            fiber.nextFiberTime = Math.max(frame.minTime, child.nextFiberTime)
            fiber.stack.pop()
            child.recycle()
            continue
          }
        }
        fiber.nextFiberTime = Math.max(frame.minTime, child.nextFiberTime)
        fiberStack.pop() // suspended
        continue
      }

      if (frame._tag === 'Retry') {
        const child = frame.childFiber
        if (fiber.pushIfNeedsTick(fiberStack, child, time)) {
          continue
        }
        if (child.stack.length === 0) {
          if (child.interrupted && frame.retriesUsed + 1 < frame.maxRetries) {
            frame.retriesUsed++
            const newChild = fiber.spawnChild(frame.clip, child.nextFiberTime)
            child.recycle()
            frame.childFiber = newChild
            continue
          } else {
            fiber.lastValue = child.lastValue
            fiber.interrupted = child.interrupted
            fiber.nextFiberTime = Math.max(frame.minTime, child.nextFiberTime)
            fiber.stack.pop()
            child.recycle()
            continue
          }
        }
        fiber.nextFiberTime = Math.max(frame.minTime, child.nextFiberTime)
        fiberStack.pop() // suspended
        continue
      }

      fiberStack.pop()
    }
  }

  // Push child onto the tick stack if it still needs this time slice
  private pushIfNeedsTick(fiberStack: FiberImpl[], child: FiberImpl, time: number): boolean {
    if (child.stack.length > 0 && child.lastTickTime < time && time >= child.spawnedTime) {
      child.lastTickTime = time
      fiberStack.push(child)
      return true
    }
    return false
  }

  // Materialize queued fork/spawn clips into runtime fibers
  private flushPendings(pendings: Clip<any, any, any>[]) {
    for (const clip of pendings) {
      const child = this.spawnChild(clip, this.nextFiberTime)
      child.pooled = false // handle escapes to user code, see `pooled` comment
      this.lastValue = child
      this.env.fibers?.push(child)
    }
    pendings.length = 0
  }
}

// ── Runtime ──

export class KinemaRuntime<Provided = never> {
  private fibers: FiberImpl[] = []
  private pool: FiberImpl[] = []
  private env: FiberEnv
  private dieOnInterrupt = false

  constructor(private providerMap: Map<string, any>) {
    this.env = { fibers: this.fibers, pool: this.pool, providerMap }
  }

  private obtain(clip: Clip<any, any, any>, time: number): FiberImpl {
    const reused = this.pool.pop()
    return reused
      ? reused.reset(this.providerMap, clip, time, this.env)
      : new FiberImpl(this.providerMap, clip, time, this.env)
  }

  run<A, I, R extends Provided>(clip: Clip<A, I, R>, time: number): void {
    this.fibers.push(this.obtain(clip, time))
  }

  runOrDie<A, I, R extends Provided>(clip: Clip<A, I, R>, time: number): void {
    this.dieOnInterrupt = true
    this.run(clip, time)
  }

  tick(time: number) {
    let i = 0
    while (i < this.fibers.length) {
      const fiber = this.fibers[i]!
      if (fiber.stack.length > 0) {
        fiber.tick(time)
      }
      if (fiber.stack.length === 0) {
        this.fibers.splice(i, 1)
        const interrupted = fiber.interrupted
        fiber.recycle()
        if (this.dieOnInterrupt && interrupted) {
          this.destroyRemaining()
          throw new Error(`Interrupted: ${String(interrupted.reason)}`)
        }
        continue
      }
      i++
    }
  }

  private destroyRemaining() {
    for (const f of this.fibers) {
      f.release()
    }
    this.fibers.length = 0
  }

  stats() {
    return {
      fibersActive: this.fibers.length,
      fibersPool: this.pool.length,
    }
  }

  destroy() {
    this.destroyRemaining()
  }
}

export class KinemaRuntimeBuilder<Provided = never> {
  private providerMap: Map<string, any>

  constructor(providerMap?: Map<string, any>) {
    this.providerMap = providerMap ?? new Map()
  }

  provide<Id, T>(tag: Tag<Id, T>, value: T): KinemaRuntimeBuilder<Provided | Tag<Id, T>> {
    const newMap = new Map(this.providerMap)
    newMap.set(tag._tag as string, value)
    return new KinemaRuntimeBuilder(newMap)
  }

  build(): KinemaRuntime<Provided> {
    return new KinemaRuntime(this.providerMap)
  }
}

export function createRuntime(): KinemaRuntimeBuilder<never> {
  return new KinemaRuntimeBuilder()
}

// ── Kinema static facade ──

export const Kinema = {
  gen: Clip.gen,
  succeed: Clip.succeed,
  create: Clip.create,
  fork: Clip.fork,
  join: Clip.join,
  spawn: Clip.spawn,
  use: Clip.use,
  provide: Clip.provide,
  all: Clip.all,
  race: Clip.race,
  interrupt: Clip.interrupt,
  try: Clip.try,
  catch: Clip.catch,
  retry: Clip.retry,
  repeat: Clip.repeat,
  defer: Clip.defer,
  getTime: Clip.getTime,
}
