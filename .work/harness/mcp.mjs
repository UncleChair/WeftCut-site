// Minimal MCP client for WeftCut (Streamable HTTP transport).
// Reads <userDataDir>/mcp_auth.json for { port, token }.
import fs from 'node:fs'
import path from 'node:path'

export function readAuth(userDataDir) {
  const p = path.join(userDataDir, 'mcp_auth.json')
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function parseSse(text) {
  const msgs = []
  let eventType = null
  let dataLines = []
  const flush = () => {
    if (dataLines.length && (eventType === null || eventType === 'message')) {
      try {
        msgs.push(JSON.parse(dataLines.join('\n')))
      } catch {
        /* keep-alive junk */
      }
    }
  }
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line === '') {
      flush()
      eventType = null
      dataLines = []
      continue
    }
    if (line.startsWith(':')) continue
    if (line.startsWith('event:')) eventType = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  flush()
  return msgs
}

async function post(url, token, payload, { sessionId, protocolVersion } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId
  if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  const ct = resp.headers.get('content-type') || ''
  const text = await resp.text()
  const msgs = ct.includes('text/event-stream')
    ? parseSse(text)
    : text.trim()
      ? [JSON.parse(text)]
      : []
  return { status: resp.status, headers: resp.headers, msgs }
}

export class McpClient {
  constructor({ port, token }) {
    this.url = `http://127.0.0.1:${port}/mcp`
    this.token = token
    this.sessionId = null
    this.protocolVersion = '2024-11-05'
    this.nextId = 1
    this.calls = [] // log of every tool call for the demo script
  }

  static async connect(userDataDir) {
    const auth = readAuth(userDataDir)
    const c = new McpClient(auth)
    const { headers, msgs, status } = await post(c.url, c.token, {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: c.protocolVersion,
        capabilities: {},
        clientInfo: { name: 'weftcut-site-demo', version: '0.1.0' },
      },
    })
    const init = msgs.find((m) => m.id === 0)
    if (!init || init.error)
      throw new Error(`initialize failed (${status}): ${JSON.stringify(msgs)}`)
    c.sessionId = headers.get('mcp-session-id')
    c.protocolVersion = init.result?.protocolVersion || c.protocolVersion
    if (c.sessionId) {
      await post(
        c.url,
        c.token,
        { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
        c,
      )
    }
    return c
  }

  async request(method, params = {}) {
    const id = this.nextId++
    const { status, msgs } = await post(
      this.url,
      this.token,
      { jsonrpc: '2.0', id, method, params },
      this,
    )
    const resp = msgs.find((m) => m.id === id)
    if (!resp) throw new Error(`no response for ${method} (HTTP ${status})`)
    if (resp.error) throw new Error(`${method} error: ${JSON.stringify(resp.error)}`)
    return resp.result
  }

  // tools/call with logging; returns parsed JSON content when possible.
  async tool(name, args = {}) {
    const started = Date.now()
    const result = await this.request('tools/call', { name, arguments: args })
    const text = result?.content?.find((c) => c.type === 'text')?.text
    let parsed = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }
    this.calls.push({ t: started, name, args, ms: Date.now() - started, isError: !!result?.isError })
    if (result?.isError) throw new Error(`tool ${name} failed: ${text}`)
    return parsed
  }

  // Convenience: same as tool() but unwraps a bare UUID-string result.
  async toolId(name, args = {}) {
    const r = await this.tool(name, args)
    if (typeof r === 'string') return r
    return r?.id ?? r?.layer_id ?? r?.track_id ?? r?.media_id ?? r
  }

  async readResource(uri) {
    const result = await this.request('resources/read', { uri })
    const text = result?.contents?.[0]?.text
    try {
      return text ? JSON.parse(text) : null
    } catch {
      return text
    }
  }
}

export const us = (sec) => Math.round(sec * 1_000_000)
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
