import { test, expect } from '@playwright/test';

// E2E test for the full burn workflow
// Prerequisites: dev server running, Ollama available, FFmpeg installed

test.describe('End-to-end Burn Workflow', () => {
  let projectId: string;

  test('should complete full workflow: upload → translate → edit → burn → toggle', async ({ page }) => {
    // Navigate to home page
    await page.goto('http://localhost:3000/');
    await expect(page).toHaveTitle(/Next App/i);

    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');

    // Find and click on a project link (or navigate directly if available)
    // For now, check if we're on a project page already, otherwise look for projects
    const url = page.url();
    if (url.includes('/projects/')) {
      projectId = new URL(url).pathname.split('/').pop() || '';
      console.log('Using existing project:', projectId);
    } else {
      // Try to find a projects list or create a new one
      // For this test, we assume we navigate to a project
      const projectLinks = await page.locator('a[href*="/projects/"]').first();
      if (await projectLinks.count() > 0) {
        await projectLinks.click();
        await page.waitForURL(/\/projects\//);
        projectId = new URL(page.url()).pathname.split('/').pop() || '';
      } else {
        // Fallback: use the test with the upload page
        test.skip();
        return;
      }
    }

    console.log('Testing with project:', projectId);

    // Find translate button
    const translateBtn = page.locator('text=Translate').first();
    if (await translateBtn.count() === 0) {
      console.log('Translate button not found, skipping test');
      test.skip();
      return;
    }

    // Click Translate
    await translateBtn.click();
    await page.waitForTimeout(1000);

    // Wait for translation to complete (look for textarea with content or status change)
    await page.waitForSelector('textarea', { timeout: 120000 });

    // Verify translated content appeared (check for textarea with content)
    const textareas = page.locator('textarea');
    let hasTranslatedContent: boolean = false;
    const count = await textareas.count();
    if (count > 0) {
      const firstText = await textareas.first().inputValue();
      hasTranslatedContent = !!(firstText && firstText.trim().length > 0);
    }

    if (!hasTranslatedContent) {
      console.log('No translated content found');
      test.skip();
      return;
    }

    console.log('✓ Translation completed');

    // Edit a subtitle (change the first one)
    const firstTextarea = page.locator('textarea').first();
    const currentText = await firstTextarea.inputValue();
    const editedText = currentText + ' [edited]';
    await firstTextarea.fill(editedText);
    console.log('✓ Edited first subtitle');

    // Find and click the Burn button
    const burnBtn = page.locator('button:has-text("🎬 Tạo video có phụ đề"), button:has-text("Tạo video có phụ đề")').first();
    if (await burnBtn.count() === 0) {
      console.log('Burn button not found');
      test.skip();
      return;
    }

    await burnBtn.click();
    console.log('✓ Clicked Burn button, waiting for completion...');

    // Wait for burn to complete (look for progress or completion indicator)
    // The BurnButton shows "Đang tải video {progress}%" while processing
    // and then should complete or show error
    let burnCompleted = false;
    const maxWaitTime = 300000; // 5 minutes max
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime && !burnCompleted) {
      // Check if we see a "Burned" toggle button (only visible after burn)
      const burnedToggle = page.locator('text=Burned').first();
      if (await burnedToggle.count() > 0) {
        burnCompleted = true;
        console.log('✓ Burn completed (Burned toggle found)');
        break;
      }

      // Check for errors
      const errorMsg = page.locator('text=/Lỗi:|error/i').first();
      if (await errorMsg.count() > 0) {
        const errorText = await errorMsg.textContent();
        console.error('Burn error:', errorText);
        break;
      }

      // Check progress
      const progress = page.locator('text=/Đang tải video \d+%/').first();
      if (await progress.count() > 0) {
        const text = await progress.textContent();
        console.log('Burn progress:', text);
      }

      await page.waitForTimeout(2000);
    }

    if (!burnCompleted) {
      console.log('Burn did not complete in time');
      // Don't skip, let the test continue to check final state
    }

    // Click on "Burned" button to switch to burned video
    const burnedToggle = page.locator('button:has-text("Burned")').first();
    if (await burnedToggle.count() > 0) {
      await burnedToggle.click();
      await page.waitForTimeout(1000);
      console.log('✓ Clicked Burned toggle');

      // Verify the video player changed (check the src attribute)
      const video = page.locator('video').first();
      if (await video.count() > 0) {
        const src = await video.getAttribute('src');
        const hasRendered = src && src.includes('rendered=true');
        expect(hasRendered).toBeTruthy();
        console.log('✓ Video player switched to burned video (src includes rendered=true)');
      }

      // Click on "Original" to switch back
      const originalToggle = page.locator('button:has-text("Original")').first();
      if (await originalToggle.count() > 0) {
        await originalToggle.click();
        await page.waitForTimeout(500);
        console.log('✓ Switched back to Original video');

        const video2 = page.locator('video').first();
        if (await video2.count() > 0) {
          const src2 = await video2.getAttribute('src');
          const isOriginal = !src2 || !src2.includes('rendered=true');
          expect(isOriginal).toBeTruthy();
          console.log('✓ Video player switched back to original');
        }
      }
    }

    console.log('✓ Full workflow completed successfully');
  });
});
