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
var sources_merge_exports = {};
__export(sources_merge_exports, {
  mergeArrayFieldsIntoContent: () => mergeArrayFieldsIntoContent,
  mergeSourcesIntoContent: () => mergeSourcesIntoContent,
  mergeSourcesLists: () => mergeSourcesLists,
  parseFrontmatterArray: () => parseFrontmatterArray,
  parseSources: () => parseSources,
  writeFrontmatterArray: () => writeFrontmatterArray,
  writeSources: () => writeSources
});
module.exports = __toCommonJS(sources_merge_exports);
function parseFrontmatterArray(content, fieldName) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return [];
  const fm = fmMatch[1];
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRe = new RegExp(
    `^${escapedName}:\\s*\\r?\\n((?:[ \\t]+-\\s+.+(?:\\r?\\n|$))+)`,
    "m"
  );
  const block = fm.match(blockRe);
  if (block) {
    const out = [];
    for (const line of block[1].split(/\r?\n/)) {
      const m = line.match(/^\s+-\s+["']?(.+?)["']?\s*$/);
      if (m && m[1]) out.push(m[1].trim());
    }
    return out;
  }
  const inlineRe = new RegExp(`^${escapedName}:\\s*\\[([^\\]]*)\\]`, "m");
  const inline = fm.match(inlineRe);
  if (!inline) return [];
  const body = inline[1].trim();
  if (body === "") return [];
  return splitInlineArray(body);
}
function splitInlineArray(body) {
  const out = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const ch of body) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (quote === '"' && ch === "\\") {
      escaped = true;
      continue;
    }
    if ((ch === '"' || ch === "'") && quote === null) {
      quote = ch;
      continue;
    }
    if (quote === ch) {
      quote = null;
      continue;
    }
    if (ch === "," && quote === null) {
      const value2 = current.trim();
      if (value2) out.push(value2);
      current = "";
      continue;
    }
    current += ch;
  }
  const value = current.trim();
  if (value) out.push(value);
  return out;
}
function writeFrontmatterArray(content, fieldName, values) {
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fmMatch) return content;
  const [, openDelim, fmBody, closeDelim] = fmMatch;
  const newline = openDelim.endsWith("\r\n") ? "\r\n" : "\n";
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const serialized = values.map(quoteInlineArrayValue).join(", ");
  const newLine = `${fieldName}: [${serialized}]`;
  const inlineRe = new RegExp(`^${escapedName}:\\s*\\[[^\\]]*\\]`, "m");
  if (inlineRe.test(fmBody)) {
    const rewritten2 = fmBody.replace(inlineRe, newLine);
    return `${openDelim}${rewritten2}${closeDelim}${content.slice(fmMatch[0].length)}`;
  }
  const blockRe = new RegExp(
    `^${escapedName}:\\s*\\r?\\n((?:[ \\t]+-\\s+.+(?:\\r?\\n|$))+)`,
    "m"
  );
  if (blockRe.test(fmBody)) {
    const rewritten2 = fmBody.replace(
      blockRe,
      (matched) => `${newLine}${/\r?\n$/.test(matched) ? newline : ""}`
    );
    return `${openDelim}${rewritten2}${closeDelim}${content.slice(fmMatch[0].length)}`;
  }
  const rewritten = `${fmBody}${newline}${newLine}`;
  return `${openDelim}${rewritten}${closeDelim}${content.slice(fmMatch[0].length)}`;
}
function quoteInlineArrayValue(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function mergeLists(existing, incoming) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const s of [...existing, ...incoming]) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
function mergeArrayFieldsIntoContent(newContent, existingContent, fields) {
  if (!existingContent) return newContent;
  if (!/^---\r?\n/.test(existingContent)) return newContent;
  let result = newContent;
  let changed = false;
  for (const field of fields) {
    const oldValues = parseFrontmatterArray(existingContent, field);
    if (oldValues.length === 0) continue;
    const newValues = parseFrontmatterArray(result, field);
    const merged = mergeLists(oldValues, newValues);
    if (merged.length === newValues.length && merged.every((s, i) => s === newValues[i])) {
      continue;
    }
    result = writeFrontmatterArray(result, field, merged);
    changed = true;
  }
  return changed ? result : newContent;
}
function parseSources(content) {
  return parseFrontmatterArray(content, "sources");
}
function writeSources(content, sources) {
  return writeFrontmatterArray(content, "sources", sources);
}
function mergeSourcesLists(existing, incoming) {
  return mergeLists(existing, incoming);
}
function mergeSourcesIntoContent(newContent, existingContent) {
  return mergeArrayFieldsIntoContent(newContent, existingContent, ["sources"]);
}
