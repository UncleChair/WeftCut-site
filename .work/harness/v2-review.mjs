import path from 'node:path'
import { chromium } from 'playwright'
import { REVIEW_OUTPUT, REVIEW_URL, ensureDirectories } from './config.mjs'

const url = REVIEW_URL
const out = REVIEW_OUTPUT
ensureDirectories(path.dirname(out))
const browser = await chromium.launch()
const errors = []

const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
await page.waitForTimeout(800)

// scroll step-by-step to trigger all reveals
const height = await page.evaluate(() => document.body.scrollHeight)
for (let y = 0; y <= height; y += 700) {
  await page.evaluate((v) => window.scrollTo(0, v), y)
  await page.waitForTimeout(60)
}
await page.waitForTimeout(900)

// play the demo video a bit so the log syncs, then shoot the demo section
await page.evaluate(() => {
  const v = document.getElementById('demoVideo')
  const sec = document.getElementById('demo')
  sec.scrollIntoView({ block: 'center' })
  v.currentTime = 19
  return v.play().catch(() => {})
})
await page.waitForTimeout(1400)
await page.screenshot({ path: `${out}-demo.png` })
await page.evaluate(() => document.getElementById('demoVideo').pause())

// editor + how + oss + faq sections
for (const id of ['editor', 'how', 'oss', 'faq']) {
  await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: 'start' }), id)
  await page.waitForTimeout(650)
  await page.screenshot({ path: `${out}-${id}.png` })
}

// agent section
await page.evaluate(() => document.getElementById('agent').scrollIntoView({ block: 'start' }))
await page.waitForTimeout(650)
await page.screenshot({ path: `${out}-agent.png` })

// back to top, then full page
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(700)
await page.screenshot({ path: `${out}-desktop-full.png`, fullPage: true })

// mobile
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const mp = await mob.newPage()
mp.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message))
await mp.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
await mp.waitForTimeout(700)
const mh = await mp.evaluate(() => document.body.scrollHeight)
for (let y = 0; y <= mh; y += 600) {
  await mp.evaluate((v) => window.scrollTo(0, v), y)
  await mp.waitForTimeout(50)
}
await mp.waitForTimeout(800)
await mp.evaluate(() => window.scrollTo(0, 0))
await mp.waitForTimeout(500)
await mp.screenshot({ path: `${out}-mobile.png` })
await mp.screenshot({ path: `${out}-mobile-full.png`, fullPage: true })
// horizontal overflow check
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
console.log('mobile horizontal overflow:', overflow)
const dOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
console.log('desktop horizontal overflow:', dOverflow)

await browser.close()

// mid-size viewports: 1024 and 768
const browser2 = await chromium.launch()
for (const w of [1024, 768]) {
  const c = await browser2.newContext({ deviceScaleFactor: 2, viewport: { width: w, height: 900 } })
  const p = await c.newPage()
  p.on('pageerror', (e) => errors.push(`pageerror@${w}: ` + e.message))
  await p.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
  await p.waitForTimeout(700)
  const h = await p.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y <= h; y += 700) {
    await p.evaluate((v) => window.scrollTo(0, v), y)
    await p.waitForTimeout(50)
  }
  await p.waitForTimeout(800)
  await p.evaluate(() => window.scrollTo(0, 0))
  await p.waitForTimeout(500)
  await p.screenshot({ path: `${out}-${w}.png`, fullPage: true })
  const of = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  console.log(`${w}px horizontal overflow:`, of)
  await c.close()
}
await browser2.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no js errors')
console.log('done')
