# dsh-web-search-opencli

Use Google AI Mode as a DeepSeek Harness `web_search` provider through OpenCLI.

`dsh-web-search-opencli` registers a DSH `ctx.web` search provider. When an agent calls `web_search`, the plugin drives your existing Chrome or Edge browser through OpenCLI, opens Google Search AI Mode (`udm=50`), waits for the AI answer, extracts the answer and cited source URLs, and returns DSH's standard `WebSearchResult`.

## Features

- Google AI Mode answers exposed through DSH `web_search`.
- OpenCLI browser automation instead of a scraped HTTP endpoint.
- Source URL extraction from AI Mode citations and links.
- Markdown conversion for the AI answer body.
- Reuses the configured OpenCLI browser session tab by default.
- Configurable provider id, OpenCLI command/session/window mode, timeout, and best-effort tab cleanup.

## Requirements

- Node.js `^22.19.0 || >=24.0.0`.
- A DeepSeek Harness install that provides `@deepseek-ai/dsh-web`.
- OpenCLI installed and connected to its browser extension.
- Chrome or Edge signed in to a Google account that can use AI Mode.
- Google AI Mode available for the browser account, region, and locale.

The provider uses the current browser profile. It does not read or store Google cookies.

Verify OpenCLI first:

```sh
opencli doctor
```

## Install

Preferred npm install:

```sh
dsh plugin --profile web add dsh-web-search-opencli
```

From a DeepSeek Harness source checkout, use the checkout wrapper:

```sh
pnpm dsh plugin --profile web add dsh-web-search-opencli
```

Before npm publication, install from GitHub:

```sh
dsh plugin --profile web add github:sincerity711/dsh-web-search-opencli
```

For local development:

```sh
git clone https://github.com/sincerity711/dsh-web-search-opencli.git
cd dsh-web-search-opencli
npm install
npm run build

dsh plugin --profile web add /path/to/dsh-web-search-opencli
```

The package includes built `lib/` artifacts in npm releases. GitHub installs run the package `prepare` script to build them.

## Bundle patch

The package includes `cordis.patch.yml`, so the normal plugin install can apply this default web-profile patch:

```yaml
- id: web
  config:
    searchProvider: google-ai-mode

- insert:
    - id: web-search-opencli
      name: dsh-web-search-opencli
      config:
        providerId: google-ai-mode
        opencliSession: dsh-google-ai-mode
        opencliWindow: background
        timeoutMs: 45000
        closeTabAfterSearch: false
```

If you manually edit a profile patch, preserve any existing `web` config fields you still need. A patch replaces the targeted row's whole `config`.

## Verify

Dump the resolved web profile:

```sh
dsh --profile web --dump-config
```

The output should include:

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: google-ai-mode
```

and:

```yaml
- id: web-search-opencli
  name: dsh-web-search-opencli
  config:
    providerId: google-ai-mode
```

Restart DSH Web after changing the profile:

```sh
dsh web
```

## Architecture reference

See [docs/architecture.md](docs/architecture.md) for the runtime flow, provider registration, OpenCLI command sequence, extraction pipeline, and error mapping.

## Config

| Field | Default | Meaning |
|---|---:|---|
| `providerId` | `google-ai-mode` | Provider id registered into `ctx.web`. |
| `opencliCommand` | `opencli` | Executable name or path. |
| `opencliSession` | `dsh-google-ai-mode` | OpenCLI browser session used for Google tabs. |
| `opencliWindow` | `background` | Value passed as both `OPENCLI_WINDOW` and OpenCLI `--window` for browser commands. |
| `timeoutMs` | `45000` | Per-search timeout budget in milliseconds. |
| `closeTabAfterSearch` | `false` | Optional best-effort tab close after each search. Disabled by default because Chrome can replace the final tab in OpenCLI's automation window with `about:blank`. |

## Behavior

- `content` contains the Google AI Mode answer converted to markdown.
- `sources[]` contains URLs cited or linked by the AI Mode answer.
- Duplicate source URLs are collapsed in first-use order.
- Ordinary Google search results outside the AI Mode answer are not used as a fallback.
- DSH `ctx.web` enforces `maxResults` after the provider returns.
- The default `background` OpenCLI window mode avoids stealing focus.
- The provider reuses its OpenCLI automation tab by default. Set `closeTabAfterSearch: true` only if you prefer best-effort tab cleanup.

## Errors

The provider throws DSH `WebError` values:

- `WEB_SEARCH_OPENCLI_CAPTCHA`: Google showed a CAPTCHA or unusual-traffic page.
- `WEB_SEARCH_OPENCLI_AI_MODE_UNAVAILABLE`: AI Mode is unavailable for the current account, region, or language.
- `WEB_SEARCH_OPENCLI_TIMEOUT`: the OpenCLI operation exceeded `timeoutMs`.
- `WEB_PROVIDER_ERROR`: OpenCLI failed or extraction returned an unexpected result.
- `WEB_ABORTED`: the DSH call was cancelled.

## Troubleshooting

### Searches fail with OpenCLI errors

Run `opencli doctor`, then make sure Chrome or Edge is open and the OpenCLI browser extension is connected.

### Google asks for CAPTCHA

Open Google manually in the browser, solve the CAPTCHA, and retry the DSH search.

### AI Mode is unavailable

Google AI Mode availability depends on the account, region, and locale. Sign in with an account that can access AI Mode, or switch back to another DSH web search provider.

### Concurrent searches fail with detached browser errors

OpenCLI browser sessions are stateful. Avoid running concurrent searches against the same `opencliSession`. Use separate session names or serialize searches if you need parallelism.

## Community plugin discovery

This repository is prepared for the current DeepSeek Harness community plugin discovery flow. Add these GitHub topics to the public repository:

```text
dsh-plugin
deepseek-harness
dsh
web-search
opencli
```

The npm package carries matching `keywords` and declares the DSH bundle patch.

## Development

```sh
npm install
npm run check
```
