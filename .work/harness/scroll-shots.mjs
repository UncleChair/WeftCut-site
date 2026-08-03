// Scroll-through capture: N viewport-height shots so IO reveals fire.
// usage: node scroll-shots.mjs <url> <outPrefix> [vhCount] [mobile]
import { chromium } from 'playwright'
const [url, prefix, vhCount = '8', mobile = '0'] = process.argv.slice(2)
const browser = await chromium.launch()
const isMobile = mobile === '1'
const ctx = await browser.newContext(
  isMobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
)
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text().slice(0, 160)) })
await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
await page.waitForTimeout(1800)
const vh = isMobile ? 844 : 900
const height = await page.evaluate(() => document.body.scrollHeight)
console.log('page height:', height)
const n = Math.min(parseInt(vhCount), Math.ceil(height / vh))
for (let i = 0; i < n; i++) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), i * vh)
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${prefix}-s${i}.png` })
}
console.log('done', n, 'shots')
await browser.close()
