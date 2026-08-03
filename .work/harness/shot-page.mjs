// Screenshot a page URL at desktop + mobile sizes for design review.
// usage: node shot-page.mjs <url> <outPrefix> [scrollY]
import { chromium } from 'playwright'
const [url, prefix, scrollY = '0'] = process.argv.slice(2)
const browser = await chromium.launch()
const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
await page.waitForTimeout(1600)
if (scrollY !== 'full') {
  await page.evaluate((y) => window.scrollTo(0, +y), scrollY)
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${prefix}-desktop.png` })
} else {
  await page.screenshot({ path: `${prefix}-desktop-full.png`, fullPage: true })
}
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const mp = await mob.newPage()
await mp.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {})
await mp.waitForTimeout(1200)
await mp.screenshot({ path: `${prefix}-mobile.png` })
await browser.close()
console.log('done', prefix)
