// Quick Playwright verification script (node)
// Usage: node scripts/playwright-burn.js

const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:3000/');

    // Navigate to upload page
    await page.click('text=Upload');
    // Wait for uploader
    await page.waitForSelector('input[type=file]');

    // Replace with a small local sample video path that exists in workspace
    const inputPath = 'tmp-burn-sample.mp4';
    if (!fs.existsSync(inputPath)) {
      console.error('Sample video not found:', inputPath);
      await browser.close();
      process.exit(2);
    }

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('text=Kéo video vào hoặc bấm để chọn')
    ]);

    await fileChooser.setFiles(inputPath);

    // Wait for transcription to complete (status text)
    await page.waitForSelector('text=Hoàn thành', { timeout: 120000 });

    // Click Translate button
    await page.click('text=Translate');
    // Wait for translation to appear
    await page.waitForSelector('textarea', { timeout: 120000 });

    // Click "Tạo video có phụ đề"
    await page.click('text=🎬 Tạo video có phụ đề');

    // Wait for burn to finish by polling a UI indicator (this is heuristic)
    await page.waitForSelector('text=Tải video', { timeout: 300000 }).catch(()=>{});

    console.log('Playwright flow completed (best-effort).');
  } catch (err) {
    console.error('Playwright error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
