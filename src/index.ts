/**
 * OpenCLI Google AI Mode search provider for DeepSeek Harness ctx.web.
 * @module dsh-web-search-opencli
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import { DEFAULT_OPENCLI_COMMAND } from './opencli.js'
import {
  DEFAULT_OPENCLI_SESSION,
  DEFAULT_OPENCLI_WINDOW,
  DEFAULT_TIMEOUT_MS,
  GoogleAiModeSearchProvider,
  GOOGLE_AI_MODE_PROVIDER_ID,
  resolveGoogleAiModeOptions,
} from './provider.js'

export { DEFAULT_OPENCLI_COMMAND } from './opencli.js'
export {
  DEFAULT_OPENCLI_SESSION,
  DEFAULT_OPENCLI_WINDOW,
  DEFAULT_TIMEOUT_MS,
  GoogleAiModeSearchProvider,
  GOOGLE_AI_MODE_PROVIDER_ID,
  resolveGoogleAiModeOptions,
} from './provider.js'
export { buildGoogleAiModeUrl, cleanTitle, embedCitations, extractionToDocument, htmlToMarkdown } from './extract.js'
export type { GoogleAiModeSearchProviderOptions } from './provider.js'
export type { GoogleAiModeExtraction, GoogleAiModeRawCitation, GoogleAiModeRawSource, GoogleAiModeSearchDocument, OpenCliRunner } from './types.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-web-search-opencli'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config. */
export interface Config {
  /** Provider id registered into ctx.web. Defaults to google-ai-mode. */
  readonly providerId?: string
  /** OpenCLI executable name or path. Defaults to opencli. */
  readonly opencliCommand?: string
  /** OpenCLI browser session name. Defaults to dsh-google-ai-mode. */
  readonly opencliSession?: string
  /** OPENCLI_WINDOW value. Defaults to background. */
  readonly opencliWindow?: string
  /** End-to-end timeout in milliseconds. Defaults to 45000. */
  readonly timeoutMs?: number
}

export const Config: z<Config> = z.object({
  providerId: z.string().default(GOOGLE_AI_MODE_PROVIDER_ID),
  opencliCommand: z.string().default(DEFAULT_OPENCLI_COMMAND),
  opencliSession: z.string().default(DEFAULT_OPENCLI_SESSION),
  opencliWindow: z.string().default(DEFAULT_OPENCLI_WINDOW),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS),
})

/** Register the Google AI Mode search provider into ctx.web. */
export function apply(ctx: Context, config: Config): void {
  const provider = new GoogleAiModeSearchProvider(resolveGoogleAiModeOptions(config))
  ctx.effect(() => ctx.web.registerSearchProvider(provider), 'dsh-web-search-opencli.registerSearchProvider()')
}
