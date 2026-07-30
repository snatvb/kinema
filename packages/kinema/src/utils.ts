/// <reference lib="dom" />

export function createLoop(getTime = Date.now) {
  let rafId = 0
  let prevTime = 0

  function run(callback: (dt: number, timestamp: number) => void) {
    cancelAnimationFrame(rafId)
    prevTime = getTime()

    function frame() {
      const time = getTime()
      const deltaTime = time - prevTime
      prevTime = time
      callback(deltaTime, time)
      if (rafId !== 0) {
        rafId = requestAnimationFrame(frame)
      }
    }
    rafId = requestAnimationFrame(frame)
  }

  function pause() {
    cancelAnimationFrame(rafId)
    rafId = 0
  }

  return { run, pause, now: getTime }
}

export type Loop = ReturnType<typeof createLoop>
