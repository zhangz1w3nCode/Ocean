"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkStepLimit = checkStepLimit;
exports.checkLoopLimit = checkLoopLimit;
exports.checkRetryLimit = checkRetryLimit;
function checkStepLimit(state) {
    if (state.step > state.limits.max_steps) {
        throw new Error(`超出最大步数 ${state.limits.max_steps}`);
    }
}
function checkLoopLimit(state) {
    if (state.loop_count > state.limits.max_loop) {
        throw new Error(`超出最大环回次数 ${state.limits.max_loop}`);
    }
}
function checkRetryLimit(state) {
    if (state.retry_count > state.limits.max_retry) {
        throw new Error(`超出最大重试次数 ${state.limits.max_retry}`);
    }
}
