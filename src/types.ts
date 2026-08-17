import type { WebSearchSource } from '@deepseek-ai/dsh-web'

/** One OpenCLI command invocation. */
export interface OpenCliRunRequest {
  /** Command arguments after the OpenCLI executable name. */
  readonly args: readonly string[]
  /** Environment overrides for this command. */
  readonly env: Readonly<Record<string, string | undefined>>
  /** Per-command timeout in milliseconds. */
  readonly timeoutMs: number
  /** Optional cancellation signal. */
  readonly signal?: AbortSignal
}

/** Result captured from one OpenCLI process. */
export interface OpenCliRunResult {
  /** Process exit code; null means the process ended by signal. */
  readonly code: number | null
  /** Captured stdout as UTF-8 text. */
  readonly stdout: string
  /** Captured stderr as UTF-8 text. */
  readonly stderr: string
  /** Signal name when the process ended by signal. */
  readonly signal: NodeJS.Signals | null
  /** True when the local timeout killed the process. */
  readonly timedOut: boolean
}

/** Runs OpenCLI commands for the provider. */
export type OpenCliRunner = (request: OpenCliRunRequest) => Promise<OpenCliRunResult>

/** Raw source extracted from a Google AI Mode citation panel. */
export interface GoogleAiModeRawSource {
  readonly title: string
  readonly url: string
  readonly source: string
}

/** Citation marker and the sources attached to that marker. */
export interface GoogleAiModeRawCitation {
  readonly marker_id: number
  readonly sources: readonly GoogleAiModeRawSource[]
}

/** Raw DOM extraction result returned from the browser tab. */
export interface GoogleAiModeExtraction {
  readonly html?: string
  readonly citations?: readonly GoogleAiModeRawCitation[]
  readonly error?: string
}

/** Markdown answer and normalized citation sources. */
export interface GoogleAiModeSearchDocument {
  readonly markdown: string
  readonly sources: readonly WebSearchSource[]
}
