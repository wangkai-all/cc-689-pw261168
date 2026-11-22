import { chromium } from 'playwright';
import sparticuz from '@sparticuz/chromium';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';
const out = process.argv[3] ?? 'shots/app.png';
const theme = process.argv[4] ?? 'light';
const width = Number(process.argv[5] ?? 1600);
const height = Number(process.argv[6] ?? 1200);
const action = process.argv[7] ?? '';

const fontCss = fs.readFileSync('src/fonts.css', 'utf8');
const fontFaces = [...fontCss.matchAll(/src: url\('([^']+)'\)[^;]*;[\s\S]*?unicode-range: ([^;]+);/g)].map(
  (match) => ({
    data: fs
      .readFileSync(match[1].replace('../node_modules/', 'node_modules/'))
      .toString('base64'),
    range: match[2],
  }),
);

const executablePath = await sparticuz.executablePath();
const browser = await chromium.launch({
  executablePath,
  args: [...sparticuz.args, '--no-sandbox'],
  headless: true,
});
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 1.5,
  colorScheme: theme,
});
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));
await page.goto(url, { waitUntil: 'networkidle' });

// 该 headless shell 的字体加载器拒绝网络/样式表字体，用 data URI + FontFace 注入同一字体。
await page.evaluate(async (faces) => {
  for (const face of faces) {
    const font = new FontFace(
      'Noto Sans SC Variable',
      `url(data:font/woff2;base64,${face.data}) format('woff2')`,
      { weight: '100 900', unicodeRange: face.range },
    );
    try {
      await font.load();
      document.fonts.add(font);
    } catch {
      /* 单个分片失败不影响其余分片 */
    }
  }
  await document.fonts.ready;
}, fontFaces);

if (action === 'open-table') {
  await page.getByRole('button', { name: /展开表格/ }).click();
}
if (action === 'hover-point') {
  const point = page.locator('.point-hit').nth(3);
  await point.hover({ force: true });
}
if (action === 'infeasible') {
  await page.getByRole('button', { name: /恢复默认必检集合/ }).click().catch(() => {});
}
if (action === 'scroll-chart') {
  await page.locator('.chart-card').scrollIntoViewIfNeeded();
}

await page.waitForTimeout(700);
await page.screenshot({ path: out, fullPage: action === '' || action === 'open-table' });
console.log('saved', out, 'errors', JSON.stringify(errors));
await browser.close();
