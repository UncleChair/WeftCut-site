// WeftCut site — content negotiation for agents.
//
// The site is static assets and stays that way. This Worker exists for exactly
// one job: answer `Accept: text/markdown` with the pre-built Markdown copy of
// the page (build-md.mjs) instead of 30 KB of HTML an agent has to strip tags
// out of. Cloudflare's own Markdown for Agents would do this at the edge, but
// it does not cover Workers static assets, which is all this site is.
//
// `run_worker_first` in wrangler.jsonc scopes this to the two HTML routes, so
// every image, font and video still goes straight from the edge without ever
// entering the Worker — that's the property worth protecting here, since the
// media outweighs the markup by three orders of magnitude.

// serve.mjs imports MARKDOWN and wantsMarkdown so `npm start` negotiates the
// same way the edge does. One copy of the rule, two runtimes.

/** Where the Markdown twin of each HTML route lives. */
export const MARKDOWN = {
  '/': '/index.md',
  '/index.html': '/index.md',
  '/zh/': '/zh/index.md',
  '/zh/index.html': '/zh/index.md',
}

// Best q-value the client gave a media type, honouring the `text/*` and `*/*`
// wildcards. Returns 0 when the type isn't acceptable at all.
//
// (Line comments, not a /** block */: these media types contain the character
// pair that would close one early.)
function quality(accept, type) {
  const [group] = type.split('/')
  let best = 0
  for (const part of accept.split(',')) {
    const [raw, ...params] = part.trim().split(';')
    const candidate = raw.trim().toLowerCase()
    if (candidate !== type && candidate !== `${group}/*` && candidate !== '*/*') continue

    let q = 1
    for (const param of params) {
      const [key, value] = param.split('=')
      if (key && key.trim().toLowerCase() === 'q') q = parseFloat(value) || 0
    }
    // An exact match outranks a wildcard even when the wildcard scores higher,
    // which is what keeps `*/*;q=0.8` from deciding anything on its own.
    if (candidate === type) return q
    best = Math.max(best, q)
  }
  return best
}

// Markdown is served only when the client asked for it by name and rated it at
// least as highly as HTML. Browsers send `text/html,…,*/*;q=0.8` and never name
// text/markdown, so they always fall through to the page.
export function wantsMarkdown(accept) {
  if (!accept || !/\btext\/markdown\b/i.test(accept)) return false
  const markdown = quality(accept, 'text/markdown')
  return markdown > 0 && markdown >= quality(accept, 'text/html')
}

/**
 * Rough token count for the x-markdown-tokens hint, so an agent can budget
 * before it reads. CJK runs about one token per character where Latin text
 * runs about four characters per token; splitting on that boundary is far from
 * exact but it is honest about the order of magnitude, which is the point.
 */
export function estimateTokens(text) {
  let cjk = 0
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code >= 0x3000 && code <= 0x9fff) cjk++
    else if (code >= 0xf900 && code <= 0xfaff) cjk++
    else if (code >= 0x20000 && code <= 0x2ffff) cjk++
  }
  return Math.max(1, Math.round(cjk + (text.length - cjk) / 4))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const markdownPath = MARKDOWN[url.pathname]

    if (!markdownPath || !wantsMarkdown(request.headers.get('accept'))) {
      // Untouched: same request, same response the assets host would have
      // given on its own, `_headers` rules and all.
      return env.ASSETS.fetch(request)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return env.ASSETS.fetch(request)
    }

    const source = await env.ASSETS.fetch(new URL(markdownPath, url))
    if (!source.ok) return env.ASSETS.fetch(request)

    const text = await source.text()

    // Start from the asset response so `_headers` (Link, nosniff, referrer
    // policy) carries over, then say what this variant actually is.
    const headers = new Headers(source.headers)
    headers.set('Content-Type', 'text/markdown; charset=utf-8')
    headers.set('Content-Location', markdownPath)
    headers.set('x-markdown-tokens', String(estimateTokens(text)))
    // Two different bodies now live at one URL. Without this, a shared cache
    // will hand an agent's Markdown to the next browser that asks.
    headers.append('Vary', 'Accept')
    // Validators belong to the HTML, not to this.
    headers.delete('ETag')
    headers.delete('Last-Modified')

    return new Response(request.method === 'HEAD' ? null : text, {
      status: 200,
      headers,
    })
  },
}
