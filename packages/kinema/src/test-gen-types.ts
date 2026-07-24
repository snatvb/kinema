/* oxlint-disable no-unused-vars */
import { tween } from './animations'
import { Kinema, Clip, tag, type Tag } from './runtime'

type AOf<T> = T extends Clip<infer A, any, any> ? A : never
type IOf<T> = T extends Clip<any, infer I, any> ? I : never
type ROf<T> = T extends Clip<any, any, infer R> ? R : never

const ConsoleTag = tag<Console>()('console')
const HelloTag = tag<() => void>()('hello')
const Element = tag<HTMLDivElement>()('element')
const GreenElement = tag<HTMLDivElement>()('green-element')
const Circle = tag<HTMLDivElement>()('cicle')

const workflow = Kinema.gen(function* () {
  const box = yield* Kinema.use(Element)
  const greenBox = yield* Kinema.use(GreenElement)
  const circle = yield* Kinema.use(Circle)
})
