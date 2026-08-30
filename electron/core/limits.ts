import { ProcessState } from './state'

export function checkStepLimit(state: ProcessState): void {
  if (state.step > state.limits.max_steps) {
    throw new Error(`超出最大步数 ${state.limits.max_steps}`)
  }
}

export function checkLoopLimit(state: ProcessState): void {
  if (state.loop_count > state.limits.max_loop) {
    throw new Error(`超出最大环回次数 ${state.limits.max_loop}`)
  }
}

export function checkRetryLimit(state: ProcessState): void {
  if (state.retry_count > state.limits.max_retry) {
    throw new Error(`超出最大重试次数 ${state.limits.max_retry}`)
  }
}
