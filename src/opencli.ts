import { spawn } from 'node:child_process'
import type { OpenCliRunRequest, OpenCliRunResult } from './types.js'

/** Default executable name resolved from PATH. */
export const DEFAULT_OPENCLI_COMMAND = 'opencli'

/**
 * Run one OpenCLI command and capture stdout/stderr.
 * @param command - OpenCLI executable name or path.
 * @param request - command arguments, environment, timeout, and cancellation.
 * @returns the completed process result.
 */
export function runOpenCliProcess(command: string, request: OpenCliRunRequest): Promise<OpenCliRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...request.args], {
      env: { ...process.env, ...request.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const finish = (result: OpenCliRunResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', abort)
      resolve(result)
    }

    const abort = (): void => {
      child.kill('SIGTERM')
    }

    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, request.timeoutMs)

    request.signal?.addEventListener('abort', abort, { once: true })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', error => {
      finish({ code: 1, stdout, stderr: stderr + String(error.message), signal: null, timedOut })
    })
    child.on('close', (code, signal) => {
      finish({ code, stdout, stderr, signal, timedOut })
    })
  })
}
