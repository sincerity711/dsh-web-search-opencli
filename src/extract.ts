import type { WebSearchSource } from '@deepseek-ai/dsh-web'
import type { GoogleAiModeExtraction, GoogleAiModeRawCitation, GoogleAiModeRawSource, GoogleAiModeSearchDocument } from './types.js'

/** Google AI Mode search endpoint. */
export const GOOGLE_AI_MODE_URL = 'https://www.google.com/search?udm=50'

/** Build the Google AI Mode URL for a query. */
export function buildGoogleAiModeUrl(query: string): string {
  const url = new URL(GOOGLE_AI_MODE_URL)
  url.searchParams.set('q', query)
  return url.toString()
}

/** Browser-side wait script that resolves after the answer text stabilizes. */
export const WAIT_FOR_GOOGLE_AI_MODE_JS = "(async () => { const main = document.querySelector('[data-container-id=\"main-col\"]'); if (!main) return JSON.stringify({ ready: false, reason: 'main-col missing' }); let last = ''; let stable = 0; const start = Date.now(); while (Date.now() - start < 30000) { const text = main.innerText || ''; if (text.length > 30 && text === last) stable += 1; else stable = 0; if (stable >= 4) return JSON.stringify({ ready: true, length: text.length }); last = text; await new Promise(r => setTimeout(r, 500)); } return JSON.stringify({ ready: (main.innerText || '').length > 30, length: (main.innerText || '').length, timedOut: true }); })()"

/** Browser-side extraction script evaluated in the Google AI Mode tab. */
export const EXTRACT_GOOGLE_AI_MODE_JS = ["(async () => {","  const isVisible = el => {","    if (!el) return false;","    const s = getComputedStyle(el); const r = el.getBoundingClientRect();","    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && el.offsetParent != null && r.width > 0 && r.height > 0;","  };","  if (location.href.includes('/sorry/index')) return JSON.stringify({ error: 'CAPTCHA' });","  const noAvail = ['AI Mode is not available','KI-Modus ist nicht verfügbar','Mode IA n\\'est pas disponible','El modo de IA no está disponible','La modalità IA non è disponibile','AI-modus is niet beschikbaar'];","  if (noAvail.some(s => document.body.innerText.includes(s))) return JSON.stringify({ error: 'AI_MODE_NOT_AVAILABLE' });","  const mainCol = document.querySelector('[data-container-id=\\\"main-col\\\"]');","  if (!mainCol) return JSON.stringify({ error: 'main-col not found — AI overview missing' });","  for (const btn of mainCol.querySelectorAll('[aria-expanded=\\\"false\\\"]')) {","    if (isVisible(btn) && /Show more|Mehr anzeigen|Meer weergeven/i.test(btn.innerText)) { btn.click(); await new Promise(r => setTimeout(r, 200)); }","  }","  const citationSelectors = ['[aria-label=\\\"View related links\\\"]','[aria-label*=\\\"Related links\\\"]','[aria-label*=\\\"Zugehörige Links\\\"]','[aria-label*=\\\"Gerelateerde links\\\"]','[aria-label*=\\\"查看相关链接\\\"]','[aria-label*=\\\"检视相关链接\\\"]','[aria-label*=\\\"関連リンク\\\"]','[aria-label*=\\\"enlaces relacionados\\\" i]','[aria-label*=\\\"liens associés\\\" i]','[aria-label*=\\\"link correlati\\\" i]','button[aria-label*=\\\"links\\\" i]','button[aria-label*=\\\"链接\\\"]'];","  let buttons = [];","  for (const sel of citationSelectors) { const found = Array.from(mainCol.querySelectorAll(sel)); if (found.filter(isVisible).length) { buttons = found; break; } }","  const allCitations = []; let markerIndex = 0;","  for (const btn of buttons) {","    if (!isVisible(btn)) continue;","    const markerId = markerIndex++;","    const marker = document.createElement('span'); marker.innerHTML = '<code>[CITE-' + markerId + ']</code>';","    if (btn.nextSibling) btn.parentNode.insertBefore(marker, btn.nextSibling); else btn.parentNode.appendChild(marker);","    try {","      btn.scrollIntoView({ behavior: 'instant', block: 'center' });","      const countLinks = () => { const r = document.querySelector('[data-container-id=\\\"rhs-col\\\"]'); return r ? Array.from(r.querySelectorAll('a[href]')).filter(isVisible).length : 0; };","      const before = countLinks(); btn.click(); const start = Date.now();","      while (Date.now() - start < 300) { await new Promise(r => setTimeout(r, 10)); if (countLinks() !== before) break; }","      await new Promise(r => setTimeout(r, 50));","    } catch {}","    const sources = []; const seen = new Set(); const rhs = document.querySelector('[data-container-id=\\\"rhs-col\\\"]');","    if (rhs) {","      const skip = ['google.com','google.de','gstatic.com','support.google.com','googleusercontent.com'];","      const unwrap = u => { try { const p = new URL(u); const real = p.searchParams.get('url'); return real || u; } catch { return u; } };","      const titleOf = a => {","        let t = (a.innerText || '').trim() || a.getAttribute('aria-label') || '';","        if (!t) { const parent = a.closest('[role=\\\"listitem\\\"], li, div, article') || a.parentElement; if (parent) { const h = parent.querySelector('h3, h4, [role=\\\"heading\\\"]'); if (h) t = h.innerText.trim(); } }","        if (!t) { const parent = a.parentElement; if (parent) t = (parent.innerText || '').trim().split('\\\\n')[0].slice(0, 120); }","        return t;","      };","      for (const link of rhs.querySelectorAll('a[href]')) {","        if (!isVisible(link)) continue; const realUrl = unwrap(link.href);","        if (!realUrl || !realUrl.startsWith('http')) continue; if (skip.some(d => realUrl.includes(d))) continue; if (seen.has(realUrl)) continue;","        seen.add(realUrl); let host = ''; try { host = new URL(realUrl).hostname; } catch {}","        sources.push({ title: titleOf(link), url: realUrl, source: host });","      }","    }","    allCitations.push({ marker_id: markerId, sources });","  }","  return JSON.stringify({ html: mainCol.innerHTML, citations: allCitations });","})()"].join('\n')

/** Convert the subset of Google AI Mode HTML used in answers to markdown. */
export function htmlToMarkdown(html: string): string {
  let text = html.replace(/<a([^>]*?)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi, (_match: string, before: string, href: string, after: string, label: string) => {
    const real = normalizeGoogleHref(href) ?? decodeHtmlEntities(href)
    return '<a' + before + 'href="' + real + '"' + after + '>' + label + '</a>'
  })
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
    .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<\/(?:div|section|article|aside)[^>]*>/gi, '\n')
    .replace(/<(?:div|section|article|aside)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_match: string, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_match: string, n: string) => String.fromCharCode(Number.parseInt(n, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
  return cleanupMarkdown(text)
}

function cleanupMarkdown(markdown: string): string {
  let text = markdown.replace(/sn\._setImageSrc\([^)]*\)/g, '')
  const footer = text.indexOf('AI responses may include mistakes.')
  if (footer >= 0) text = text.slice(0, footer)
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/** Remove browser chrome labels from citation titles. */
export function cleanTitle(title: string): string {
  return title
    .replace(/[.。]?\s*(?:在新标签页中打开|Open in new tab|Im neuen Tab öffnen|Ouvrir dans un nouvel onglet|Abrir en una nueva pestaña|Apri in una nuova scheda)。?\s*$/i, '')
    .trim()
}

/** Build answer markdown and sources from a Google AI Mode extraction result. */
export function extractionToDocument(extraction: GoogleAiModeExtraction): GoogleAiModeSearchDocument {
  const html = extraction.html ?? ''
  const document = embedCitations(htmlToMarkdown(html), extraction.citations ?? [])
  return appendSources(document, sourcesFromAnswerHtml(html))
}

/** Extract citeable links embedded directly in the AI Mode answer column. */
export function sourcesFromAnswerHtml(html: string): readonly WebSearchSource[] {
  const sources: WebSearchSource[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<a([^>]*)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const url = normalizeGoogleHref(match[2] ?? '')
    if (url === undefined || seen.has(url)) continue
    const attrs = (match[1] ?? '') + ' ' + (match[3] ?? '')
    const title = cleanTitle(stripHtml(match[4] ?? '') || readAttribute(attrs, 'aria-label'))
    seen.add(url)
    sources.push({ url, ...(title.length > 0 ? { title } : {}) })
  }
  return sources
}

/** Replace citation markers with footnote indices and return deduplicated sources. */
export function embedCitations(markdownWithMarkers: string, citations: readonly GoogleAiModeRawCitation[]): GoogleAiModeSearchDocument {
  let markdown = markdownWithMarkers.replace(/`\[CITE-(\d+)\]`/g, '[CITE-$1]')
  const urlToIndex = new Map<string, number>()
  const sources: WebSearchSource[] = []
  const sorted = [...citations].sort((left, right) => left.marker_id - right.marker_id)
  for (const citation of sorted) {
    const refs: string[] = []
    for (const source of citation.sources) {
      const normalized = normalizeSource(source)
      if (normalized === undefined) continue
      let index = urlToIndex.get(normalized.url)
      if (index === undefined) {
        index = sources.length + 1
        urlToIndex.set(normalized.url, index)
        sources.push(normalized)
      }
      refs.push('[' + index + ']')
    }
    markdown = markdown.replace('[CITE-' + citation.marker_id + ']', refs.join(''))
  }
  return { markdown: markdown.replace(/\[CITE-\d+\]/g, '').trim(), sources }
}

function appendSources(document: GoogleAiModeSearchDocument, extraSources: readonly WebSearchSource[]): GoogleAiModeSearchDocument {
  const seen = new Set(document.sources.map(source => source.url))
  const sources = [...document.sources]
  for (const source of extraSources) {
    if (seen.has(source.url)) continue
    seen.add(source.url)
    sources.push(source)
  }
  return { markdown: document.markdown, sources }
}

function normalizeSource(source: GoogleAiModeRawSource): WebSearchSource | undefined {
  const url = normalizeGoogleHref(source.url)
  if (url === undefined) return undefined
  const title = cleanTitle(source.title)
  const fallbackTitle = source.source.trim()
  return {
    url,
    ...(title.length > 0 ? { title } : fallbackTitle.length > 0 ? { title: fallbackTitle } : {}),
  }
}

function normalizeGoogleHref(href: string): string | undefined {
  let url: URL
  try {
    url = new URL(decodeHtmlEntities(href), 'https://www.google.com')
  } catch {
    return undefined
  }
  const real = url.searchParams.get('url') ?? url.href
  let normalized: URL
  try {
    normalized = new URL(real)
  } catch {
    return undefined
  }
  if (normalized.protocol !== 'http:' && normalized.protocol !== 'https:') return undefined
  if (isGoogleInternalHost(normalized.hostname)) return undefined
  return normalized.href
}

function isGoogleInternalHost(hostname: string): boolean {
  return hostname === 'google.com'
    || hostname.endsWith('.google.com')
    || hostname === 'google.de'
    || hostname.endsWith('.google.de')
    || hostname === 'gstatic.com'
    || hostname.endsWith('.gstatic.com')
    || hostname === 'googleusercontent.com'
    || hostname.endsWith('.googleusercontent.com')
}

function readAttribute(attrs: string, name: string): string {
  const match = new RegExp(name + '="([^"]*)"', 'i').exec(attrs)
  return match === null ? '' : decodeHtmlEntities(match[1] ?? '')
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Parse the JSON envelope returned by OpenCLI eval. */
export function unwrapOpenCliEval(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (trimmed.length === 0) return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (isRecord(parsed) && typeof parsed.result === 'string') {
    return JSON.parse(parsed.result) as unknown
  }
  return parsed
}

/** Narrow an unknown value to a Google AI Mode extraction result. */
export function asGoogleAiModeExtraction(value: unknown): GoogleAiModeExtraction | undefined {
  if (!isRecord(value)) return undefined
  const html = typeof value.html === 'string' ? value.html : undefined
  const error = typeof value.error === 'string' ? value.error : undefined
  const citations = Array.isArray(value.citations) ? value.citations.flatMap(asCitation) : undefined
  return {
    ...(html !== undefined ? { html } : {}),
    ...(citations !== undefined ? { citations } : {}),
    ...(error !== undefined ? { error } : {}),
  }
}

function asCitation(value: unknown): GoogleAiModeRawCitation[] {
  if (!isRecord(value) || typeof value.marker_id !== 'number' || !Array.isArray(value.sources)) return []
  return [{ marker_id: value.marker_id, sources: value.sources.flatMap(asSource) }]
}

function asSource(value: unknown): GoogleAiModeRawSource[] {
  if (!isRecord(value) || typeof value.url !== 'string') return []
  return [{
    title: typeof value.title === 'string' ? value.title : '',
    url: value.url,
    source: typeof value.source === 'string' ? value.source : '',
  }]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
