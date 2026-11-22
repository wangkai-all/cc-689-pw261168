import { chromium } from 'playwright';
import sparticuz from '@sparticuz/chromium';
import fs from 'node:fs';

const fontCss = fs.readFileSync('src/fonts.css', 'utf8');
const fontFaces = [...fontCss.matchAll(/src: url\('([^']+)'\)[^;]*;[\s\S]*?unicode-range: ([^;]+);/g)].map((m) => ({
  data: fs.readFileSync(m[1].replace('../node_modules/', 'node_modules/')).toString('base64'),
  range: m[2],
}));

const executablePath = await sparticuz.executablePath();
const browser = await chromium.launch({ executablePath, args: [...sparticuz.args, '--no-sandbox'], headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(async (faces) => {
  for (const face of faces) {
    const f = new FontFace('Noto Sans SC Variable', `url(data:font/woff2;base64,${face.data}) format('woff2')`, { weight: '100 900', unicodeRange: face.range });
    try { await f.load(); document.fonts.add(f); } catch {}
  }
  await document.fonts.ready;
}, fontFaces);
await page.waitForTimeout(500);

// hover a chart point
await page.locator('.point-hit').nth(5).hover({ force: true });
await page.waitForTimeout(400);
await page.locator('.chart-card').screenshot({ path: 'shots/tooltip.png' });

// open table
await page.getByRole('button', { name: /展开表格/ }).click();
await page.waitForTimeout(300);
await page.locator('.table-card').screenshot({ path: 'shots/table.png' });

// lock scenario
await page.getByRole('button', { name: /锁定南湖站/ }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/locked.png', fullPage: true });

// orphan scenario
await page.getByRole('button', { name: /孤立必检设备/ }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/infeasible.png', fullPage: true });

// tight scenario
await page.getByRole('button', { name: /提高最低覆盖/ }).click();
await page.waitForTimeout(600);
await page.locator('.chart-card').screenshot({ path: 'shots/tight.png' });

console.log('errors', JSON.stringify(errors));
await browser.close();
