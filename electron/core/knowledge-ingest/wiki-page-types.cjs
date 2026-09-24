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
var wiki_page_types_exports = {};
__export(wiki_page_types_exports, {
  GENERATION_WIKI_TYPES: () => GENERATION_WIKI_TYPES,
  inferWikiTypeFromPath: () => inferWikiTypeFromPath,
  wikiTypeLabel: () => wikiTypeLabel
});
module.exports = __toCommonJS(wiki_page_types_exports);
const GENERATION_WIKI_TYPES = [
  "source",
  "entity",
  "concept",
  "comparison",
  "query",
  "synthesis",
  "thesis",
  "methodology",
  "finding"
];
const WIKI_TYPE_DIRS = [
  { dir: "entities", type: "entity" },
  { dir: "concepts", type: "concept" },
  { dir: "sources", type: "source" },
  { dir: "queries", type: "query" },
  { dir: "comparisons", type: "comparison" },
  { dir: "synthesis", type: "synthesis" },
  { dir: "findings", type: "finding" },
  { dir: "thesis", type: "thesis" },
  { dir: "methodology", type: "methodology" }
];
function inferWikiTypeFromPath(path, fileName) {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  for (const { dir, type } of WIKI_TYPE_DIRS) {
    if (normalized.includes(`/wiki/${dir}/`) || normalized.includes(`/${dir}/`) || normalized.startsWith(`wiki/${dir}/`)) {
      return type;
    }
  }
  const name = (fileName ?? normalized.split("/").pop() ?? "").toLowerCase();
  if (name === "overview.md" || normalized.includes("/overview.md")) return "overview";
  const customDir = normalized.match(/(?:^|\/)wiki\/([^/.][^/]*)\/[^/]+\.md$/)?.[1];
  if (customDir) return customDir;
  return null;
}
function wikiTypeLabel(type) {
  if (type === "thesis") return "Thesis";
  if (type === "methodology") return "Methodology";
  if (type === "finding") return "Finding";
  return type.split(/[-_\s]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
