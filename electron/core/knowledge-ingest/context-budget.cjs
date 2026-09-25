var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var context_budget_exports = {};
__export(context_budget_exports, {
  computeContextBudget: () => computeContextBudget
});
module.exports = __toCommonJS(context_budget_exports);
const DEFAULT_MAX_CTX = 204800;
const RESPONSE_RESERVE_FRAC = 0.15;
const INDEX_BUDGET_FRAC = 0.05;
const PAGE_BUDGET_FRAC = 0.5;
const PER_PAGE_FRAC = 0.3;
const PER_PAGE_FLOOR = 5e3;
function computeContextBudget(maxContextSize) {
  const maxCtx = typeof maxContextSize === "number" && maxContextSize > 0 ? maxContextSize : DEFAULT_MAX_CTX;
  const responseReserve = Math.floor(maxCtx * RESPONSE_RESERVE_FRAC);
  const indexBudget = Math.floor(maxCtx * INDEX_BUDGET_FRAC);
  const pageBudget = Math.floor(maxCtx * PAGE_BUDGET_FRAC);
  const maxPageSize = Math.min(
    pageBudget,
    Math.max(PER_PAGE_FLOOR, Math.floor(pageBudget * PER_PAGE_FRAC))
  );
  return {
    maxCtx,
    responseReserve,
    indexBudget,
    pageBudget,
    maxPageSize
  };
}
