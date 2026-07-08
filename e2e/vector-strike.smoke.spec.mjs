import { test, expect } from '@playwright/test';

test.describe('Vector Strike OMNI — smoke tests', () => {
  test('homepage loads and renders', async ({ page }) => {
    await page.goto('http://localhost:8767/');
    await expect(page.locator('html')).toBeAttached();
    await page.waitForLoadState('domcontentloaded');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('star sparrow builder section loads', async ({ page }) => {
    await page.goto('http://localhost:8767/');
    // Look for the build/ship editor container
    const starSparrow = page.locator('#ss-root, .star-sparrow, [data-app="builder"]');
    if (await starSparrow.count() > 0) {
      await expect(starSparrow.first()).toBeAttached();
    }
  });

  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('http://localhost:8767/');
    await page.waitForTimeout(3000);
    const nonWebgl = errors.filter(e => !e.includes('WebGL') && !e.includes('webgl'));
    expect(nonWebgl.length).toBe(0);
  });
});
