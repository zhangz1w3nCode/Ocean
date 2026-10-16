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
var card_blocks_src_exports = {};
__export(card_blocks_src_exports, {
  FILE_BLOCK_REGEX: () => FILE_BLOCK_REGEX,
  isSafeIngestPath: () => isSafeIngestPath,
  parseFileBlocks: () => parseFileBlocks
});
module.exports = __toCommonJS(card_blocks_src_exports);
const FILE_BLOCK_REGEX = /---FILE:\s*([^\n]+?)\s*---\n([\s\S]*?)---END FILE---/g;
const OPENER_LINE = /^---\s*FILE:\s*(.+?)\s*---\s*$/i;
const CLOSER_LINE = /^---\s*END\s+FILE\s*---\s*$/i;
function isSafeIngestPath(p) {
  if (typeof p !== "string" || p.trim().length === 0) return false;
  if (/[\x00-\x1f]/.test(p)) return false;
  if (p.startsWith("/") || p.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/.test(p)) return false;
  const normalized = p.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.some((seg) => seg === "..")) return false;
  if (segments.some((seg) => !isWindowsSafePathSegment(seg))) return false;
  if (!normalized.startsWith("wiki/")) return false;
  return true;
}
function isWindowsSafePathSegment(segment) {
  if (segment.length === 0) return false;
  if (/[<>:"|?*]/.test(segment)) return false;
  if (/[ .]$/.test(segment)) return false;
  const stem = segment.split(".")[0]?.toUpperCase();
  if (!stem) return false;
  if (stem === "CON" || stem === "PRN" || stem === "AUX" || stem === "NUL" || /^COM[1-9]$/.test(stem) || /^LPT[1-9]$/.test(stem)) {
    return false;
  }
  return true;
}
const FENCE_LINE = /^\s{0,3}(```+|~~~+)/;
function parseFileBlocks(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks = [];
  const warnings = [];
  const truncatedPaths = [];
  let i = 0;
  while (i < lines.length) {
    const openerMatch = OPENER_LINE.exec(lines[i]);
    if (!openerMatch) {
      i++;
      continue;
    }
    const path = openerMatch[1].trim();
    i++;
    const contentLines = [];
    let fenceMarker = null;
    let fenceLen = 0;
    let closed = false;
    while (i < lines.length) {
      const line = lines[i];
      const fenceMatch = FENCE_LINE.exec(line);
      if (fenceMatch) {
        const run = fenceMatch[1];
        const char = run[0];
        const len = run.length;
        if (fenceMarker === null) {
          fenceMarker = char;
          fenceLen = len;
        } else if (char === fenceMarker && len >= fenceLen) {
          fenceMarker = null;
          fenceLen = 0;
        }
        contentLines.push(line);
        i++;
        continue;
      }
      if (fenceMarker === null && CLOSER_LINE.test(line)) {
        closed = true;
        i++;
        break;
      }
      contentLines.push(line);
      i++;
    }
    if (!closed) {
      const pathLabel = path || "(unnamed)";
      const msg = `FILE block "${pathLabel}" was not closed before end of stream \u2014 likely truncation (model hit max_tokens, timeout, or connection dropped). Block dropped.`;
      console.warn(`[ingest] ${msg}`);
      warnings.push(msg);
      if (isSafeIngestPath(path)) truncatedPaths.push(path);
      continue;
    }
    if (!path) {
      const msg = `FILE block with empty path skipped (LLM omitted the path after \`---FILE:\`).`;
      console.warn(`[ingest] ${msg}`);
      warnings.push(msg);
      continue;
    }
    if (!isSafeIngestPath(path)) {
      const msg = `FILE block with unsafe path "${path}" rejected (must be under wiki/, no .., no absolute paths, and Windows-safe file names).`;
      console.warn(`[ingest] ${msg}`);
      warnings.push(msg);
      continue;
    }
    blocks.push({ path, content: contentLines.join("\n") });
  }
  return { blocks, warnings, truncatedPaths };
}
