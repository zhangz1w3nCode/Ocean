var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var frontmatter_exports = {};
__export(frontmatter_exports, {
  parseFrontmatter: () => parseFrontmatter
});
module.exports = __toCommonJS(frontmatter_exports);
var import_js_yaml = __toESM(require("js-yaml"), 1);
const FM_BLOCK_STRICT_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
const FM_BLOCK_ANYWHERE_RE = /\n---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
const MAX_PREFIX_LINES_BEFORE_FRONTMATTER = 6;
function parseFrontmatter(content) {
  const located = locateFrontmatterBlock(content);
  if (!located) return { frontmatter: null, body: content, rawBlock: "" };
  const { yamlPayload, rawBlock, body } = located;
  let parsed;
  try {
    parsed = import_js_yaml.default.load(yamlPayload, { schema: import_js_yaml.default.JSON_SCHEMA });
  } catch {
    try {
      parsed = import_js_yaml.default.load(repairWikilinkLists(yamlPayload), { schema: import_js_yaml.default.JSON_SCHEMA });
    } catch {
      return { frontmatter: null, body, rawBlock };
    }
  }
  return {
    frontmatter: normalize(parsed),
    body,
    rawBlock
  };
}
function locateFrontmatterBlock(content) {
  const strict = content.match(FM_BLOCK_STRICT_RE);
  if (strict) {
    return {
      yamlPayload: strict[1],
      rawBlock: strict[0],
      body: content.slice(strict[0].length)
    };
  }
  const fallback = content.match(FM_BLOCK_ANYWHERE_RE);
  if (!fallback || fallback.index === void 0) return null;
  const openIdx = fallback.index + 1;
  if (lineNumberAt(content, openIdx) > MAX_PREFIX_LINES_BEFORE_FRONTMATTER) {
    return null;
  }
  const rawBlock = content.slice(openIdx, openIdx + fallback[0].length - 1);
  const bodyAfterFm = content.slice(openIdx + rawBlock.length);
  const prefix = content.slice(0, openIdx);
  const prefixIsYamlFence = /^\s*```(?:yaml|yml)?\s*\r?\n$/i.test(prefix);
  if (prefixIsYamlFence) {
    const stripped = bodyAfterFm.replace(/^\s*```\s*(?:\r?\n|$)/, "");
    return {
      yamlPayload: fallback[1],
      rawBlock,
      body: stripped
    };
  }
  return {
    yamlPayload: fallback[1],
    rawBlock,
    body: bodyAfterFm
  };
}
function lineNumberAt(s, index) {
  let line = 1;
  for (let i = 0; i < index && i < s.length; i++) {
    if (s.charCodeAt(i) === 10) line++;
  }
  return line;
}
function repairWikilinkLists(payload) {
  return payload.split("\n").map((line) => {
    const m = line.match(/^(\s*[A-Za-z_][\w-]*\s*:\s*)(\[\[[^\]]+\]\](?:\s*,\s*\[\[[^\]]+\]\])+)\s*$/);
    if (!m) return line;
    const prefix = m[1];
    const items = m[2].split(",").map((s) => s.trim()).filter(Boolean).map((s) => `"${s}"`).join(", ");
    return `${prefix}[${items}]`;
  }).join("\n");
}
function normalize(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const out = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (Array.isArray(value)) {
      // Ocean 适配：对象数组（sources:[{path,anchor,kind}] / relations:[{to,rel}]）保留原对象，
      // 其余类型仍走 llm_wiki 原有的 stringifyScalar 降级
      out[key] = value.map((v) => v && typeof v === "object" ? v : stringifyScalar(v));
      continue;
    }
    out[key] = stringifyScalar(value);
  }
  return out;
}
function stringifyScalar(v) {
  if (v === null || v === void 0) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
