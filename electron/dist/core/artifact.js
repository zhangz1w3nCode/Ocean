"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.artifactDir = artifactDir;
exports.writeDetail = writeDetail;
exports.writeError = writeError;
exports.hasDetail = hasDetail;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
function artifactDir(root, workflow, instanceId, nodeName, invoke) {
    return path.join(root, '.workflows', workflow, 'instance', instanceId, 'artifacts', nodeName, invoke);
}
function writeDetail(root, workflow, instanceId, nodeName, invoke, content) {
    const dir = artifactDir(root, workflow, instanceId, nodeName, invoke);
    try {
        fs.mkdirSync(dir, { recursive: true });
    }
    catch (e) {
        throw new Error(`创建产物目录失败: ${e.message}`);
    }
    const filePath = path.join(dir, 'detail.md');
    try {
        fs.writeFileSync(filePath, content);
    }
    catch (e) {
        throw new Error(`写入 detail.md 失败: ${e.message}`);
    }
    return filePath;
}
function writeError(root, workflow, instanceId, nodeName, invoke, reason) {
    const dir = artifactDir(root, workflow, instanceId, nodeName, invoke);
    try {
        fs.mkdirSync(dir, { recursive: true });
    }
    catch (e) {
        throw new Error(`创建产物目录失败: ${e.message}`);
    }
    const filePath = path.join(dir, 'error.md');
    try {
        fs.writeFileSync(filePath, reason);
    }
    catch (e) {
        throw new Error(`写入 error.md 失败: ${e.message}`);
    }
    return filePath;
}
function hasDetail(root, workflow, instanceId, nodeName, invoke) {
    const filePath = path.join(artifactDir(root, workflow, instanceId, nodeName, invoke), 'detail.md');
    try {
        const stats = fs.statSync(filePath);
        return stats.size > 0;
    }
    catch {
        return false;
    }
}
