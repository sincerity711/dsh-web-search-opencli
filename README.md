# dsh-web-search-opencli

OpenCLI-backed Google AI Mode provider for DeepSeek Harness `web_search`.

The plugin drives your normal Chrome or Edge through OpenCLI, opens Google Search with `udm=50`, waits for the AI Mode answer, extracts the answer and cited source URLs, and registers the result as a DSH `ctx.web` search provider.

## Requirements

- Node.js `^22.19.0 || >=24.0.0`
- A DeepSeek Harness install that provides `@deepseek-ai/dsh-web`
- OpenCLI installed and connected to the browser extension
- Chrome or Edge signed in to a Google account that can use AI Mode
- Google AI Mode available for the browser account, region, and locale

The provider uses the current browser profile. It does not read or store Google cookies.

Verify OpenCLI before configuring DSH:

```sh
opencli doctor
```

## Installation

Install the plugin into the DSH `web` profile.

For a normal DSH install:

```sh
dsh plugin --profile web add github:sincerity711/dsh-web-search-opencli
```

From a DeepSeek Harness source checkout, use the checkout's CLI wrapper:

```sh
pnpm dsh plugin --profile web add github:sincerity711/dsh-web-search-opencli
```

For local plugin development, clone and link the checkout instead:

```sh
git clone https://github.com/sincerity711/dsh-web-search-opencli.git
cd dsh-web-search-opencli
npm install
npm run build

dsh plugin --profile web add /path/to/dsh-web-search-opencli
```

From a DSH source checkout, replace the last command with:

```sh
pnpm dsh plugin --profile web add /path/to/dsh-web-search-opencli
```

The package has a `prepare` script so GitHub installs build `lib/` during installation.

## Configure DSH

Edit the `web` profile's `cordis.patch.yml`.

Find the profile directory:

```sh
dsh plugin --profile web root
```

The command prints the profile's `node_modules` path. The patch file is one directory above it:

```text
<profile>/cordis.patch.yml
```

From a DSH source checkout, use:

```sh
pnpm dsh plugin --profile web root
```

If the patch file contains only `[]`, replace it with:

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
```

If the patch file already contains entries, add the `web-search-opencli` insert entry and update the existing `id: web` patch instead of adding a duplicate `web` patch. A patch replaces the targeted row's whole `config`, so preserve any existing `web` fields that your profile needs.

Example with another `web` field preserved:

```yaml
- id: web
  config:
    searchProvider: google-ai-mode
    fetchProvider: some-provider
```

Restart DSH Web after changing the profile patch:

```sh
dsh web
```

or, from a source checkout:

```sh
pnpm dsh web --host 127.0.0.1 --port 3080
```

## Verify the active config

Dump the resolved profile:

```sh
dsh --profile web --dump-config
```

From a source checkout:

```sh
pnpm dsh --profile web --dump-config
```

The output should contain both rows:

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: google-ai-mode
```

```yaml
- id: web-search-opencli
  name: dsh-web-search-opencli
  config:
    providerId: google-ai-mode
```

## How it works

This package does not start a service. DSH loads it as a Cordis plugin inside the existing DSH process.

Runtime flow:

```text
model or agent
  -> web_search tool
  -> @deepseek-ai/dsh-web / ctx.web
  -> searchProvider: google-ai-mode
  -> dsh-web-search-opencli provider
  -> opencli browser dsh-google-ai-mode ...
  -> your Chrome or Edge Google AI Mode tab
```

At DSH startup, the plugin's `apply(ctx, config)` registers a search provider into `ctx.web`. The selected provider id comes from `@deepseek-ai/dsh-web`:

```yaml
searchProvider: google-ai-mode
```

The registered provider id comes from this plugin:

```yaml
providerId: google-ai-mode
```

Those two values must match. When a model calls `web_search`, DSH calls this provider, and the provider runs OpenCLI commands to drive Google AI Mode in the browser.

A search does the following work:

1. Open `https://www.google.com/search?udm=50&q=<query>` in the configured OpenCLI session.
2. Wait for the AI Mode main column to appear.
3. Wait for the answer text to stabilize.
4. Evaluate a DOM extraction script in the tab.
5. Convert the answer HTML to markdown.
6. Decode Google redirect URLs such as `/url?...&url=https%3A%2F%2Fexample.com`.
7. Return DSH's standard `WebSearchResult` with `content`, `sources[]`, and `truncated`.

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
- `sources[]` contains URLs cited or linked by the AI Mode answer.
- Duplicate source URLs are collapsed in first-use order.
- Ordinary Google search results outside the AI Mode answer are not used as a fallback.
- DSH `ctx.web` enforces `maxResults` after the provider returns.

## Errors

The provider throws DSH `WebError` values:

- `WEB_SEARCH_OPENCLI_CAPTCHA`: Google showed a CAPTCHA or unusual-traffic page.
- `WEB_SEARCH_OPENCLI_AI_MODE_UNAVAILABLE`: AI Mode is unavailable for the current region or language.
- `WEB_SEARCH_OPENCLI_TIMEOUT`: the OpenCLI operation exceeded `timeoutMs`.
- `WEB_PROVIDER_ERROR`: OpenCLI failed or extraction returned an unexpected result.
- `WEB_ABORTED`: the DSH call was cancelled.

## Troubleshooting

### The UI settings page looks empty

This plugin is usually enabled through the Cordis profile patch, not through a Web UI settings form. The resolved `--dump-config` output is the authority for which provider DSH loaded.

### Searches fail with OpenCLI errors

Run:

```sh
opencli doctor
```

Then make sure Chrome or Edge is open and the OpenCLI browser extension is connected.

### Google asks for CAPTCHA

Open the Google tab in the browser, solve the CAPTCHA, and retry the DSH search.

### AI Mode is unavailable

Google AI Mode availability depends on the account, region, and locale. Sign in with an account that can access AI Mode, or switch back to another DSH web search provider.

### Concurrent searches fail with detached browser errors

OpenCLI browser sessions are stateful. Avoid running concurrent searches against the same `opencliSession`. Use separate session names or serialize searches if you need parallelism.

## Development

```sh
npm install
npm run check
```
