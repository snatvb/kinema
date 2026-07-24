import { createSpring, delay, easeInOutQuad, tween } from '@repo/kinema'
import { springs } from '@repo/kinema/animations'
import { Kinema, createRuntime, tag } from '@repo/kinema/runtime'
import { createEffect, createSignal, on } from 'solid-js'

import styles from './Slider.module.css'

type Console = { log: (...args: unknown[]) => void }

const ConsoleTag = tag<Console>()('console')
const HelloTag = tag<() => void>()('hello')
const Element = tag<HTMLDivElement>()('element')
const GreenElement = tag<HTMLDivElement>()('green-element')
const Circle = tag<HTMLDivElement>()('cicle')

const workflow2 = (box: HTMLDivElement) =>
  Kinema.gen(function* () {
    yield* Kinema.defer(
      Kinema.gen(function* () {
        yield* delay(100)

        console.log('free')
      }),
    )
    yield* tween(200, (t) => {
      box.style.opacity = `${t}`
    })
    const time = yield* Kinema.getTime('local')
    console.log(time)

    yield* delay(100)
    const c = yield* Kinema.use(ConsoleTag)
    c.log('ending')

    const targetX = yield* Kinema.succeed(250)
    const fork = yield* Kinema.fork(
      tween(500, (t) => {
        box.innerText = t.toFixed(4)
      }),
    )

    yield* tween(
      1800,
      (t) => {
        box.style.transform = `translateX(${targetX * t}px)`
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
    console.log(yield* Kinema.getTime('global'), yield* Kinema.getTime('local'))
    const fork = yield* Kinema.fork(wf)
    const v = yield* Kinema.catch(Kinema.interrupt('foo' as const), () => {
      return Kinema.succeed(1)
    })
    console.log(v)

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
    console.log('Вся цепочка анимаций полностью завершилась!')
  }
})

export default function Slider() {
  const [value, setValue] = createSignal(0)
  // oxlint-disable-next-line no-unassigned-vars
  let boxRef: HTMLDivElement | undefined
  // oxlint-disable-next-line no-unassigned-vars
  let boxRefGreen: HTMLDivElement | undefined
  // oxlint-disable-next-line no-unassigned-vars
  let circleRef: HTMLDivElement | undefined

  createEffect(() => {
    const runtime = createRuntime()
      .provide(ConsoleTag, { log: console.log })
      .provide(HelloTag, () => {})
      .provide(GreenElement, boxRefGreen!)
      .provide(Circle, circleRef!)
      .build()
    runtime.run(Kinema.provide(Element, boxRef!)(workflow), 0)
    createEffect(
      on(value, (value) => {
        runtime.tick(value)
      }),
    )
  })

  return (
    <>
      <div
        ref={circleRef}
        style={{
          width: '100px',
          height: '100px',
          background: '#0080cc',
          'border-radius': '9999px',
          opacity: 0,
        }}
      />
      <div
        ref={boxRef}
        style={{ width: '100px', height: '100px', background: '#000', opacity: 0 }}
      />
      <div
        ref={boxRefGreen}
        style={{ width: '100px', height: '100px', background: '#ccee00', opacity: '0' }}
      />
      <div class={styles.container}>
        <div class={styles.value}>{value()}</div>
        <input
          type="range"
          min="0"
          max="10000"
          value={value()}
          onInput={(e) => setValue(Number(e.target.value))}
          autocomplete="off"
          class={styles.slider}
        />
      </div>
    </>
  )
}
