import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// Jev (TypeSafe AI) 产物符合性校验客户端
//
// 供 ocean workflow next 在推进前校验上一节点产物是否按照节点内容执行。
// 协议依据 typesafe-sdk-js (POST /v1/systemone, Bearer auth)。
// 校验失败（网络/超时/鉴权/响应异常）抛 JevUnavailableError，由调用方降级。
// ---------------------------------------------------------------------------

export interface JevValidationConfig {
  enabled: boolean
  threshold: number
  timeoutMs: number
}

export interface JevConfigFile {
  baseUrl: string
  apiKey: string
  validation: JevValidationConfig
  updatedAt?: string
}

const JEV_DEFAULT_BASE_URL = 'https://api.typesafe.ai'
const JEV_DEFAULT_THRESHOLD = 0.7
const JEV_DEFAULT_TIMEOUT_MS = 5000
const JEV_MODEL = 'jev-latest'

/** Jev 服务不可用（网络/超时/鉴权/响应格式异常），调用方应降级而非阻断。 */
export class JevUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JevUnavailableError'
  }
}

export function loadJevConfig(root: string): JevConfigFile | null {
  const configPath = path.join(root, '.ocean', 'jev-config.json')
  try {
    if (!fs.existsSync(configPath)) return null
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    if (typeof raw?.baseUrl !== 'string' || typeof raw?.apiKey !== 'string') return null
    const v = raw.validation ?? {}
    return {
      baseUrl: raw.baseUrl,
      apiKey: raw.apiKey,
      validation: {
        enabled: v.enabled === true,
        threshold: typeof v.threshold === 'number' && v.threshold > 0 && v.threshold <= 1
          ? v.threshold
          : JEV_DEFAULT_THRESHOLD,
        timeoutMs: typeof v.timeoutMs === 'number' && v.timeoutMs > 0
          ? v.timeoutMs
          : JEV_DEFAULT_TIMEOUT_MS,
      },
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    }
  } catch {
    return null
  }
}

export interface JevComplianceResult {
  /** P(产物按照节点任务的要求完成)，0 到 1。 */
  noul: number
}

/** 校验产物是否按照节点任务的要求完成。失败抛 JevUnavailableError。 */
export async function checkArtifactCompliance(
  config: JevConfigFile,
  nodeTask: string,
  artifact: string,
): Promise<JevComplianceResult> {
  if (!config.apiKey.trim()) throw new JevUnavailableError('未配置 Jev API Key')

  const base = (config.baseUrl.trim() || JEV_DEFAULT_BASE_URL).replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.validation.timeoutMs)

  try {
    const res = await fetch(`${base}/v1/systemone`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        state: { node_task: nodeTask, artifact },
        questions: {
          compliance: {
            type: 'noul',
            instructions: '该产物是否按照节点任务的要求完成？（产物内容是否兑现了节点任务声明要完成的事项，而非占位、空白或无关内容）',
          },
        },
        model: JEV_MODEL,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new JevUnavailableError(`TypeSafe API 返回 ${res.status}`)
    }

    const data = await res.json() as {
      answers?: { compliance?: { noul?: unknown } }
    }
    const noul = data?.answers?.compliance?.noul
    if (typeof noul !== 'number' || !Number.isFinite(noul)) {
      throw new JevUnavailableError('TypeSafe API 响应格式异常')
    }
    return { noul }
  } catch (e: any) {
    if (e instanceof JevUnavailableError) throw e
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
      throw new JevUnavailableError(`请求超时（${config.validation.timeoutMs}ms）`)
    }
    throw new JevUnavailableError(e?.message ?? String(e))
  } finally {
    clearTimeout(timer)
  }
}
