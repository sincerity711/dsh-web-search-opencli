import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { describe, expect, it, vi } from 'vitest'
import * as plugin from '../src/index.ts'
import { GoogleAiModeSearchProvider, GOOGLE_AI_MODE_PROVIDER_ID, resolveGoogleAiModeOptions } from '../src/provider.ts'
import { buildGoogleAiModeUrl, embedCitations, extractionToDocument, htmlToMarkdown, sourcesFromAnswerHtml } from '../src/extract.ts'
import type { OpenCliRunRequest, OpenCliRunResult } from '../src/types.ts'

function ok(stdout: unknown): OpenCliRunResult {
  return { code: 0, stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout), stderr: '', signal: null, timedOut: false }
}

function fail(stderr: string): OpenCliRunResult {
  return { code: 1, stdout: '', stderr, signal: null, timedOut: false }
}

function envelope(value: unknown): string {
  return JSON.stringify({ result: JSON.stringify(value) })
}

describe('Google AI Mode extraction mapping', () => {
  it('builds the udm=50 Google AI Mode URL', () => {
    const url = new URL(buildGoogleAiModeUrl('DeepSeek Harness web search'))
    expect(url.origin + url.pathname).toBe('https://www.google.com/search')
    expect(url.searchParams.get('udm')).toBe('50')
    expect(url.searchParams.get('q')).toBe('DeepSeek Harness web search')
  })

  it('converts common answer HTML to markdown', () => {
    expect(htmlToMarkdown('<h2>Title</h2><p>Hello <strong>world</strong></p><ul><li>One</li></ul>'))
      .toBe(`## Title
Hello **world**

- One`)
  })

  it('uses only citation panel sources and deduplicates URLs', () => {
    const document = embedCitations('Alpha [CITE-0] beta [CITE-1] leftover [CITE-2]', [
      { marker_id: 0, sources: [{ title: 'First Open in new tab', url: 'https://example.com/a', source: 'example.com' }] },
      { marker_id: 1, sources: [
        { title: 'First duplicate', url: 'https://example.com/a', source: 'example.com' },
        { title: '', url: 'https://example.com/b', source: 'example.com' },
        { title: 'Bad', url: '/relative', source: 'relative' },
      ] },
      { marker_id: 2, sources: [] },
    ])
    expect(document.markdown).toBe('Alpha [1] beta [1][2] leftover')
    expect(document.sources).toEqual([
      { title: 'First', url: 'https://example.com/a' },
      { title: 'example.com', url: 'https://example.com/b' },
    ])
  })

  it('maps an extraction to web_search content and sources', () => {
    expect(extractionToDocument({
      html: '<p>Answer <code>[CITE-0]</code></p>',
      citations: [{ marker_id: 0, sources: [{ title: 'Source', url: 'https://source.test/', source: 'source.test' }] }],
    })).toEqual({
      markdown: 'Answer [1]',
      sources: [{ title: 'Source', url: 'https://source.test/' }],
    })
  })

  it('extracts source links embedded directly in the AI Mode answer', () => {
    expect(sourcesFromAnswerHtml('<p>Answer <a href="/url?sa=i&amp;url=https%3A%2F%2Fgithub.com%2Fdeepseek-ai%2Fdeepseek-harness" aria-label="GitHub source"></a><a href="https://support.google.com/websearch?p=aimode">Learn more</a></p>'))
      .toEqual([{ title: 'GitHub source', url: 'https://github.com/deepseek-ai/deepseek-harness' }])
  })

  it('removes Google footer and image script noise from markdown', () => {
    expect(htmlToMarkdown(`<p>Answer</p>sn._setImageSrc('img','data:image/png;base64,aaa')<p>AI responses may include mistakes. Learn more</p>`))
      .toBe('Answer')
  })
})

describe('GoogleAiModeSearchProvider', () => {
  it('drives OpenCLI and returns the AI answer with citation sources', async () => {
    const calls: readonly string[][] = []
    const mutableCalls: string[][] = calls as string[][]
    const runner = vi.fn(async (request: OpenCliRunRequest): Promise<OpenCliRunResult> => {
      mutableCalls.push([...request.args])
      const command = request.args.join(' ')
      const js = String(request.args.at(-1))
      expect(request.env.OPENCLI_WINDOW).toBe('background')
      if (command.includes(' open ')) return ok({ page: 'tab-1' })
      if (command.includes('wait selector')) return ok('')
      if (js.includes('stable >= 4')) return ok(envelope({ ready: true, length: 100 }))
      if (js.includes('document.body.innerText.slice')) return ok(envelope({ u: 'https://www.google.com/search?udm=50&q=x', sample: 'answer' }))
      if (js.includes('mainCol.innerHTML')) return ok(envelope({
        html: '<p>AI answer <code>[CITE-0]</code></p>',
        citations: [{ marker_id: 0, sources: [{ title: 'Citation', url: 'https://citation.test/', source: 'citation.test' }] }],
      }))
      return fail('unexpected command ' + command)
    })
    const provider = new GoogleAiModeSearchProvider({ ...resolveGoogleAiModeOptions({}), runner })

    await expect(provider.search({ query: 'hello' })).resolves.toEqual({
      content: 'AI answer [1]',
      sources: [{ title: 'Citation', url: 'https://citation.test/' }],
      truncated: false,
    })
    expect(mutableCalls[0]?.at(-1)).toBe('https://www.google.com/search?udm=50&q=hello')
    expect(mutableCalls.every(call => call[0] === 'browser' && call[2] === '--window' && call[3] === 'background')).toBe(true)
    expect(mutableCalls.some(call => call.includes('close'))).toBe(false)
  })

  it('maps CAPTCHA to a provider-specific WebError code', async () => {
    const runner = vi.fn(async (request: OpenCliRunRequest): Promise<OpenCliRunResult> => {
      const command = request.args.join(' ')
      const js = String(request.args.at(-1))
      if (command.includes(' open ')) return ok({ targetId: 'tab-1' })
      if (command.includes('wait selector')) return ok('')
      if (js.includes('stable >= 4')) return ok(envelope({ ready: true, length: 100 }))
      if (js.includes('document.body.innerText.slice')) return ok(envelope({ u: 'https://www.google.com/sorry/index', sample: 'unusual traffic' }))
      return ok(envelope({}))
    })
    const provider = new GoogleAiModeSearchProvider({ ...resolveGoogleAiModeOptions({}), runner })
    await expect(provider.search({ query: 'captcha' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_SEARCH_OPENCLI_CAPTCHA' }))
    expect(runner.mock.calls.map(([request]) => request.args).some(args => args.includes('close'))).toBe(false)
  })

  it('maps AI Mode unavailability to a provider-specific WebError code', async () => {
    const runner = vi.fn(async (request: OpenCliRunRequest): Promise<OpenCliRunResult> => {
      const command = request.args.join(' ')
      const js = String(request.args.at(-1))
      if (command.includes(' open ')) return ok({ page: 'tab-1' })
      if (command.includes('wait selector')) return ok('')
      if (js.includes('stable >= 4')) return ok(envelope({ ready: true, length: 100 }))
      if (js.includes('document.body.innerText.slice')) return ok(envelope({ u: 'https://www.google.com/search', sample: 'normal' }))
      return ok(envelope({ error: 'AI_MODE_NOT_AVAILABLE' }))
    })
    const provider = new GoogleAiModeSearchProvider({ ...resolveGoogleAiModeOptions({}), runner })
    await expect(provider.search({ query: 'region' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_SEARCH_OPENCLI_AI_MODE_UNAVAILABLE' }))
  })

  it('maps non-zero OpenCLI commands to WEB_PROVIDER_ERROR', async () => {
    const runner = vi.fn(async (): Promise<OpenCliRunResult> => fail('opencli: command not found'))
    const provider = new GoogleAiModeSearchProvider({ ...resolveGoogleAiModeOptions({}), runner })
    await expect(provider.search({ query: 'missing opencli' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

describe('dsh-web-search-opencli plugin', () => {
  it('has no default export', () => {
    expect('default' in plugin).toBe(false)
  })

  it('registers the provider into ctx.web and disposes it with the plugin fiber', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: GOOGLE_AI_MODE_PROVIDER_ID })
    const fiber = await ctx.plugin(plugin, { opencliCommand: 'definitely-not-opencli' })
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })
})
