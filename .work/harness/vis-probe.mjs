// Visibility probe: launch fitted, then screencapture the whole screen.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PROJECTS, SHOTS, launchFitted } from './recorder.mjs'
import { sleep } from './mcp.mjs'
import fs from 'node:fs'
import path from 'node:path'

const run = promisify(execFile)
fs.rmSync(path.join(PROJECTS, 'VisProbe'), { recursive: true, force: true })
const { app, page, bounds } = await launchFitted({ project: 'VisProbe' })
console.log('bounds:', JSON.stringify(bounds))
await sleep(1500)
const win = await app.browserWindow(page)
const info = await win.evaluate((bw) => ({
  visible: bw.isVisible(),
  focused: bw.isFocused(),
  bounds: bw.getBounds(),
  contentBounds: bw.getContentBounds(),
}))
console.log('window:', JSON.stringify(info))
await run('screencapture', ['-x', path.join(SHOTS, 'vis-full.png')])
console.log('captured')
await app.close()
console.log('DONE')
