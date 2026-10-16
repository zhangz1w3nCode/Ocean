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
var ingest_sanitize_exports = {};
__export(ingest_sanitize_exports, {
  sanitizeIngestedFileContent: () => sanitizeIngestedFileContent
});
module.exports = __toCommonJS(ingest_sanitize_exports);
function sanitizeIngestedFileContent(content) {
  let cleaned = content;
  cleaned = stripOuterCodeFence(cleaned);
  cleaned = stripFrontmatterKeyPrefix(cleaned);
  cleaned = addMissingOpeningFrontmatterFence(cleaned);
  cleaned = repairWikilinkListsInFrontmatter(cleaned);
  return cleaned;
}
function stripOuterCodeFence(content) {
  const open = content.match(
    /^(?:\uFEFF)?(?:[ \t]*\r?\n)*[ \t]*```(?:yaml|md|markdown)?[ \t]*\r?\n/i
  );
  if (!open) return content;
  const afterOpen = content.slice(open[0].length);
  const close = afterOpen.match(/\r?\n[ \t]*```[ \t]*\r?\n?\s*$/);
  if (close) return afterOpen.slice(0, close.index);
  const frontmatterOnly = afterOpen.match(
    /^(---[ \t]*\r?\n[\s\S]*?^---[ \t]*\r?\n)[ \t]*```[ \t]*(?:\r?\n|$)/m
  );
  if (!frontmatterOnly) return content;
  return frontmatterOnly[1] + afterOpen.slice(frontmatterOnly[0].length);
}
function stripFrontmatterKeyPrefix(content) {
  const m = content.match(/^[ \t]*frontmatter\s*:\s*\r?\n(?=[ \t]*---\s*\r?\n)/);
  if (!m) return content;
  return content.slice(m[0].length);
}
function addMissingOpeningFrontmatterFence(content) {
  if (/^[ \t]*---\s*(\r?\n|$)/.test(content)) return content;
  const lines = content.split(/\r?\n/);
  const firstContentIdx = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIdx < 0) return content;
  const first = lines[firstContentIdx].trim();
  if (!/^(type|title|created|updated|tags|related|sources)\s*:/i.test(first)) {
    return content;
  }
  const searchEnd = Math.min(lines.length, firstContentIdx + 30);
  for (let i = firstContentIdx + 1; i < searchEnd; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "---") {
      return `---
${lines.slice(firstContentIdx).join("\n")}`;
    }
    if (/^#{1,6}\s+/.test(trimmed)) break;
  }
  return content;
}
function repairWikilinkListsInFrontmatter(content) {
  const fmRe = /^(---[ \t]*(\r?\n))([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;
  const m = content.match(fmRe);
  if (!m) return content;
  const repairedPayload = m[3].split(/\r?\n/).map((line) => {
    const lm = line.match(
      /^(\s*[A-Za-z_][\w-]*\s*:\s*)(\[\[[^\]]+\]\](?:\s*,\s*\[\[[^\]]+\]\])+)\s*$/
    );
    if (!lm) return line;
    const items = lm[2].split(",").map((s) => s.trim()).filter(Boolean).map((s) => `"${s}"`).join(", ");
    return `${lm[1]}[${items}]`;
  }).join(m[2]);
  return m[1] + repairedPayload + m[4] + content.slice(m[0].length);
}
