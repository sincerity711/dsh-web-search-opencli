import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import { DEFAULT_OPENCLI_COMMAND, runOpenCliProcess } from './opencli.js'
import { asGoogleAiModeExtraction, buildGoogleAiModeUrl, EXTRACT_GOOGLE_AI_MODE_JS, extractionToDocument, unwrapOpenCliEval } from './extract.js'
import type { OpenCliRunner, OpenCliRunResult } from './types.js'

/** Stable default provider id. */
export const GOOGLE_AI_MODE_PROVIDER_ID = 'google-ai-mode'

/** Default OpenCLI browser session name. */
export const DEFAULT_OPENCLI_SESSION = 'dsh-google-ai-mode'

/** Default OpenCLI tab visibility. */
export const DEFAULT_OPENCLI_WINDOW = 'background'

/** Default end-to-end search timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 45_000

/** Provider options after plugin config defaults are resolved. */
export interface GoogleAiModeSearchProviderOptions {
  /** Provider id registered with ctx.web. */
  readonly providerId: string
  /** OpenCLI executable name or path. */
  readonly opencliCommand: string
  /** OpenCLI browser session to reuse. */
  readonly opencliSession: string
  /** OpenCLI window mode passed through OPENCLI_WINDOW. */
  readonly opencliWindow: string
  /** End-to-end timeout in milliseconds for each OpenCLI command. */
  readonly timeoutMs: number
  /** Optional runner for tests and embedders. */
  readonly runner?: OpenCliRunner
}

interface Tab {
  readonly page?: string
  readonly targetId?: string
  readonly url?: string
}

/** WebSearchProvider backed by Google AI Mode in a real browser through OpenCLI. */
export class GoogleAiModeSearchProvider implements WebSearchProvider {
  readonly id: string
  private readonly options: GoogleAiModeSearchProviderOptions
  private readonly runner: OpenCliRunner

  /**
   * @param options - resolved OpenCLI and provider registration settings.
   */
  constructor(options: GoogleAiModeSearchProviderOptions) {
    this.id = options.providerId
    this.options = options
    this.runner = options.runner ?? (request => runOpenCliProcess(options.opencliCommand, request))
  }

  /** Cheap local usability check; command execution happens only during search. */
  available(): boolean {
    return this.id.length > 0 && this.options.opencliCommand.length > 0 && this.options.opencliSession.length > 0
  }

  /** Run a Google AI Mode search and return its answer plus citation sources. */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    if (isAborted(signal)) throw new WebError('web search was aborted', 'WEB_ABORTED')
    const started = Date.now()
    const tab = await this.openSearchTab(buildGoogleAiModeUrl(request.query), signal)
    await this.waitForCompletion(tab, started, signal)
    const probe = await this.evalJson(tab, "JSON.stringify({u: location.href, len: document.body.innerText.length, sample: document.body.innerText.slice(0, 300)})", started, signal)
    if (isRecord(probe) && typeof probe.u === 'string' && probe.u.includes('/sorry/index')) {
      throw new WebError('Google CAPTCHA detected; solve it in the browser tab and retry', 'WEB_SEARCH_OPENCLI_CAPTCHA')
    }
    if (isRecord(probe) && typeof probe.sample === 'string' && /unusual traffic/i.test(probe.sample)) {
      throw new WebError('Google CAPTCHA detected; solve it in the browser tab and retry', 'WEB_SEARCH_OPENCLI_CAPTCHA')
    }

    const raw = asGoogleAiModeExtraction(await this.evalJson(tab, EXTRACT_GOOGLE_AI_MODE_JS, started, signal))
    if (raw === undefined) throw new WebError('Google AI Mode extraction returned non-JSON', 'WEB_PROVIDER_ERROR')
    if (raw.error === 'CAPTCHA') throw new WebError('Google CAPTCHA detected during extraction', 'WEB_SEARCH_OPENCLI_CAPTCHA')
    if (raw.error === 'AI_MODE_NOT_AVAILABLE') {
      throw new WebError('Google AI Mode is not available in the current country or language', 'WEB_SEARCH_OPENCLI_AI_MODE_UNAVAILABLE')
    }
    if (raw.error !== undefined) throw new WebError('Google AI Mode extraction failed: ' + raw.error, 'WEB_PROVIDER_ERROR')

    const document = extractionToDocument(raw)
    return {
      ...(document.markdown.length > 0 ? { content: document.markdown } : {}),
      sources: document.sources,
      truncated: false,
    }
  }

  private async openSearchTab(url: string, signal: AbortSignal | undefined): Promise<string> {
    for (const tab of await this.listTabs(signal)) {
      const id = tabId(tab)
      if (id.length > 0) await this.run(['browser', this.options.opencliSession, 'tab', 'close', id], Date.now(), signal, false)
    }
    const result = await this.run(['browser', this.options.opencliSession, 'tab', 'new', url], Date.now(), signal, true)
    const parsed = parseJson(result.stdout)
    if (!isRecord(parsed)) throw new WebError('OpenCLI tab new returned non-JSON', 'WEB_PROVIDER_ERROR')
    const id = typeof parsed.page === 'string' ? parsed.page : typeof parsed.targetId === 'string' ? parsed.targetId : ''
    if (id.length === 0) throw new WebError('OpenCLI tab new did not return a tab id', 'WEB_PROVIDER_ERROR')
    return id
  }

  private async listTabs(signal: AbortSignal | undefined): Promise<readonly Tab[]> {
    const result = await this.run(['browser', this.options.opencliSession, 'tab', 'list'], Date.now(), signal, true)
    const parsed = parseJson(result.stdout)
    if (!Array.isArray(parsed)) throw new WebError('OpenCLI tab list returned non-JSON', 'WEB_PROVIDER_ERROR')
    return parsed.flatMap(value => isRecord(value) ? [{
      ...(typeof value.page === 'string' ? { page: value.page } : {}),
      ...(typeof value.targetId === 'string' ? { targetId: value.targetId } : {}),
      ...(typeof value.url === 'string' ? { url: value.url } : {}),
    }] : [])
  }

  private async waitForCompletion(tab: string, started: number, signal: AbortSignal | undefined): Promise<void> {
    await this.run(['browser', this.options.opencliSession, 'wait', 'selector', '[data-container-id="main-col"]', '--tab', tab, '--timeout', String(this.remainingMs(started))], started, signal, true)
  }

  private async evalJson(tab: string, js: string, started: number, signal: AbortSignal | undefined): Promise<unknown> {
    const result = await this.run(['browser', this.options.opencliSession, 'eval', '--tab', tab, js], started, signal, true)
    try {
      return unwrapOpenCliEval(result.stdout)
    } catch (error) {
      throw new WebError('OpenCLI eval returned invalid JSON', 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  private async run(args: readonly string[], started: number, signal: AbortSignal | undefined, failOnNonZero: boolean): Promise<OpenCliRunResult> {
    if (isAborted(signal)) throw new WebError('web search was aborted', 'WEB_ABORTED')
    const result = await this.runner({
      args,
      env: { OPENCLI_WINDOW: this.options.opencliWindow },
      timeoutMs: this.remainingMs(started),
      ...(signal !== undefined ? { signal } : {}),
    })
    if (isAborted(signal)) throw new WebError('web search was aborted', 'WEB_ABORTED')
    if (result.timedOut) throw new WebError('OpenCLI Google AI Mode search timed out', 'WEB_SEARCH_OPENCLI_TIMEOUT')
    if (failOnNonZero && result.code !== 0) {
      const detail = (result.stderr.trim() || result.stdout.trim()).slice(0, 500)
      throw new WebError('OpenCLI command failed' + (detail.length > 0 ? ': ' + detail : ''), 'WEB_PROVIDER_ERROR')
    }
    return result
  }

  private remainingMs(started: number): number {
    const remaining = this.options.timeoutMs - (Date.now() - started)
    if (remaining <= 0) throw new WebError('OpenCLI Google AI Mode search timed out', 'WEB_SEARCH_OPENCLI_TIMEOUT')
    return remaining
  }
}

/** Resolve provider options from partial plugin config. */
export function resolveGoogleAiModeOptions(config: {
  readonly providerId?: string
  readonly opencliCommand?: string
  readonly opencliSession?: string
  readonly opencliWindow?: string
  readonly timeoutMs?: number
}): GoogleAiModeSearchProviderOptions {
  return {
    providerId: config.providerId ?? GOOGLE_AI_MODE_PROVIDER_ID,
    opencliCommand: config.opencliCommand ?? DEFAULT_OPENCLI_COMMAND,
    opencliSession: config.opencliSession ?? DEFAULT_OPENCLI_SESSION,
    opencliWindow: config.opencliWindow ?? DEFAULT_OPENCLI_WINDOW,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  }
}

function tabId(tab: Tab): string {
  return tab.targetId ?? tab.page ?? ''
}

function parseJson(stdout: string): unknown {
  return JSON.parse(stdout.trim()) as unknown
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
