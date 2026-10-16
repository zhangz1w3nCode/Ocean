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
var page_merge_exports = {};
__export(page_merge_exports, {
  mergePageContent: () => mergePageContent,
  stripBodyWikilinkPathPrefixes: () => stripBodyWikilinkPathPrefixes
});
module.exports = __toCommonJS(page_merge_exports);
var import_frontmatter = require("./frontmatter.cjs");
var import_sources_merge = require("./sources-merge.cjs");
const UNION_FIELDS = ["sources", "tags", "related"];
const LOCKED_FIELDS = ["type", "title", "created"];
const BODY_SHRINK_THRESHOLD = 0.7;
async function mergePageContent(newContent, existingContent, merger, opts) {
  if (!existingContent) return newContent;
  if (newContent === existingContent) return existingContent;
  const arrayMerged = (0, import_sources_merge.mergeArrayFieldsIntoContent)(
    newContent,
    existingContent,
    [...UNION_FIELDS]
  );
  const oldParsed = (0, import_frontmatter.parseFrontmatter)(existingContent);
  const arrayMergedParsed = (0, import_frontmatter.parseFrontmatter)(arrayMerged);
  if (opts.replaceExistingBody) {
    await tryBackup(opts, existingContent);
    let replacement = arrayMerged;
    for (const field of LOCKED_FIELDS) {
      const existingValue = oldParsed.frontmatter?.[field];
      if (typeof existingValue === "string" && existingValue !== "") {
        replacement = setFrontmatterScalar(replacement, field, existingValue);
      }
    }
    return setFrontmatterScalar(
      replacement,
      "updated",
      (opts.today ?? defaultToday)()
    );
  }
  if (oldParsed.body.trim() === arrayMergedParsed.body.trim()) {
    return arrayMerged;
  }
  let llmOutput;
  try {
    llmOutput = await merger(
      existingContent,
      arrayMerged,
      opts.sourceFileName,
      opts.signal
    );
  } catch (err) {
    console.warn(
      `[page-merge] LLM merge failed for ${opts.pagePath}, falling back to incoming + array-field union: ${err instanceof Error ? err.message : err}`
    );
    await tryBackup(opts, existingContent);
    return arrayMerged;
  }
  const llmParsed = (0, import_frontmatter.parseFrontmatter)(llmOutput);
  if (llmParsed.frontmatter === null) {
    console.warn(
      `[page-merge] LLM output for ${opts.pagePath} has no frontmatter \u2014 rejecting, falling back`
    );
    await tryBackup(opts, existingContent);
    return arrayMerged;
  }
  const oldBodyLen = oldParsed.body.length;
  const newBodyLen = arrayMergedParsed.body.length;
  const llmBodyLen = llmParsed.body.length;
  const minThreshold = Math.max(oldBodyLen, newBodyLen) * BODY_SHRINK_THRESHOLD;
  if (llmBodyLen < minThreshold) {
    console.warn(
      `[page-merge] LLM merge for ${opts.pagePath} produced body ${llmBodyLen} chars, below threshold ${minThreshold.toFixed(0)} (max input was ${Math.max(oldBodyLen, newBodyLen)}) \u2014 rejecting, falling back`
    );
    await tryBackup(opts, existingContent);
    return arrayMerged;
  }
  let final = llmOutput;
  for (const field of LOCKED_FIELDS) {
    const existingValue = oldParsed.frontmatter?.[field];
    if (typeof existingValue === "string" && existingValue !== "") {
      final = setFrontmatterScalar(final, field, existingValue);
    }
  }
  final = (0, import_sources_merge.mergeArrayFieldsIntoContent)(final, arrayMerged, [...UNION_FIELDS]);
  const todayFn = opts.today ?? defaultToday;
  final = setFrontmatterScalar(final, "updated", todayFn());
  return stripBodyWikilinkPathPrefixes(final);
}
function stripBodyWikilinkPathPrefixes(content) {
  const frontmatter = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) return content;
  const body = content.slice(frontmatter[0].length);
  if (!body.includes("[[")) return content;
  const normalizedBody = normalizeWikilinksOutsideCode(body);
  return `${frontmatter[0]}${normalizedBody}`;
}
function normalizeWikilinksOutsideCode(body) {
  let fence = null;
  return body.replace(/.*(?:\r?\n|$)/g, (line) => {
    const content = line.replace(/\r?\n$/, "");
    const markerMatch = content.match(/^ {0,3}(`{3,}|~{3,})/);
    if (markerMatch) {
      const marker = markerMatch[1][0];
      const length = markerMatch[1].length;
      if (!fence) fence = { marker, length };
      else if (marker === fence.marker && length >= fence.length && content.slice(markerMatch[0].length).trim() === "") {
        fence = null;
      }
      return line;
    }
    if (fence || /^(?: {4}|\t)/.test(content)) return line;
    return replaceOutsideInlineCode(line);
  });
}
function replaceOutsideInlineCode(text) {
  let output = "";
  let cursor = 0;
  while (cursor < text.length) {
    const opening = text.indexOf("`", cursor);
    if (opening < 0) return output + replaceWikilinkPrefixes(text.slice(cursor));
    output += replaceWikilinkPrefixes(text.slice(cursor, opening));
    let runEnd = opening + 1;
    while (text[runEnd] === "`") runEnd += 1;
    const delimiter = text.slice(opening, runEnd);
    const closing = text.indexOf(delimiter, runEnd);
    if (closing < 0) {
      output += replaceWikilinkPrefixes(text.slice(opening, runEnd));
      cursor = runEnd;
      continue;
    }
    output += text.slice(opening, closing + delimiter.length);
    cursor = closing + delimiter.length;
  }
  return output;
}
const PAGE_WIKILINK_RE = /\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g;
function replaceWikilinkPrefixes(text) {
  return text.replace(
    PAGE_WIKILINK_RE,
    (match, rawTarget, rawAlias, offset) => {
      if (offset > 0 && text[offset - 1] === "!") return match;
      const preceding = text.slice(0, offset).match(/\\+$/)?.[0].length ?? 0;
      if (preceding % 2 === 1) return match;
      const target = rawTarget.trim();
      const normalizedTarget = bareWikilinkTarget(target);
      if (normalizedTarget === target) return match;
      const alias = rawAlias === void 0 ? "" : `|${rawAlias}`;
      return `[[${normalizedTarget}${alias}]]`;
    }
  );
}
function bareWikilinkTarget(target) {
  if (!target || target.startsWith("#")) return target;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  const fragmentIndex = target.indexOf("#");
  const pageTarget = fragmentIndex >= 0 ? target.slice(0, fragmentIndex) : target;
  const fragment = fragmentIndex >= 0 ? target.slice(fragmentIndex) : "";
  const normalizedPath = pageTarget.replace(/\\/g, "/");
  if (!normalizedPath.includes("/")) return target;
  const leaf = normalizedPath.split("/").pop();
  if (!leaf) return target;
  const extensionIndex = leaf.lastIndexOf(".");
  if (extensionIndex > 0 && leaf.slice(extensionIndex).toLowerCase() !== ".md") {
    return target;
  }
  return `${leaf}${fragment}`;
}
async function tryBackup(opts, existingContent) {
  if (!opts.backup) return;
  try {
    await opts.backup(existingContent);
  } catch (err) {
    console.warn(
      `[page-merge] backup failed for ${opts.pagePath}: ${err instanceof Error ? err.message : err}`
    );
  }
}
function defaultToday() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function setFrontmatterScalar(content, fieldName, value) {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/);
  if (!fmMatch) return content;
  const [, openDelim, fmBody, closeDelim] = fmMatch;
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const newLine = `${fieldName}: ${value}`;
  const lineRe = new RegExp(`^${escapedName}:\\s*(?!\\[)([^\\n]*)`, "m");
  if (lineRe.test(fmBody)) {
    const rewritten2 = fmBody.replace(lineRe, newLine);
    return `${openDelim}${rewritten2}${closeDelim}${content.slice(fmMatch[0].length)}`;
  }
  const rewritten = `${fmBody}
${newLine}`;
  return `${openDelim}${rewritten}${closeDelim}${content.slice(fmMatch[0].length)}`;
}
