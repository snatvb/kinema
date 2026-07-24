import { createSignal } from 'solid-js'

export default function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <div>
      <button onClick={() => setCount((c) => c - 1)}>-</button>
      <span>{count()}</span>
      <button onClick={() => setCount((c) => c + 1)}>+</button>
    </div>
  )
}
