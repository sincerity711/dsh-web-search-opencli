# dsh-web-search-opencli

OpenCLI-backed Google AI Mode provider for DeepSeek Harness `web_search`.

The plugin drives your normal Chrome or Edge through OpenCLI, opens Google Search with `udm=50`, waits for the AI Mode answer, extracts the answer and citation panel URLs, and registers the result as a DSH `ctx.web` search provider.

## Requirements

- Node.js `^22.19.0 || >=24.0.0`
- A DeepSeek Harness install that provides `@deepseek-ai/dsh-web`
- OpenCLI installed and connected to the browser extension
- Google AI Mode available for the browser account, region, and locale

The provider uses the current browser profile. It does not read or store Google cookies.

## Install

From this repository:

```sh
npm install
npm run build
```

Install the package into your DSH profile or link it from the checkout using the plugin path that your DSH setup supports.

## Configure DSH

Add the plugin to your profile patch and select its provider id in `@deepseek-ai/dsh-web`.

```yaml
- id: web
  plugin: "@deepseek-ai/dsh-web"
  config:
    searchProvider: google-ai-mode

- id: web-search-opencli
  plugin: "dsh-web-search-opencli"
  config:
    providerId: google-ai-mode
    opencliSession: dsh-google-ai-mode
    opencliWindow: background
    timeoutMs: 45000
```

If your profile already has a `@deepseek-ai/dsh-web` row, patch that existing row instead of adding a duplicate.

## Config

| Field | Default | Meaning |
|---|---:|---|
| `providerId` | `google-ai-mode` | Provider id registered into `ctx.web`. |
| `opencliCommand` | `opencli` | Executable name or path. |
| `opencliSession` | `dsh-google-ai-mode` | OpenCLI browser session used for Google tabs. |
| `opencliWindow` | `background` | Value passed as `OPENCLI_WINDOW`. |
| `timeoutMs` | `45000` | Per-search timeout budget in milliseconds. |

## Behavior

- `content` contains the Google AI Mode answer converted to markdown.
- `sources[]` contains only URLs from AI Mode citation panels.
- Duplicate citation URLs are collapsed in first-use order.
- Ordinary Google search results are not used as a fallback.
- DSH `ctx.web` enforces `maxResults` after the provider returns.

## Errors

The provider throws DSH `WebError` values:

- `WEB_SEARCH_OPENCLI_CAPTCHA`: Google showed a CAPTCHA or unusual-traffic page.
- `WEB_SEARCH_OPENCLI_AI_MODE_UNAVAILABLE`: AI Mode is unavailable for the current region or language.
- `WEB_SEARCH_OPENCLI_TIMEOUT`: the OpenCLI operation exceeded `timeoutMs`.
- `WEB_PROVIDER_ERROR`: OpenCLI failed or extraction returned an unexpected result.
- `WEB_ABORTED`: the DSH call was cancelled.

## Development

```sh
npm install
npm run check
```
