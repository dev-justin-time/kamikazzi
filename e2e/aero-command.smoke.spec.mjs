import { test, expect } from '@playwright/test';

test.describe('Aero Command — smoke tests', () => {
  test('homepage loads and renders', async ({ page }) => {
    await page.goto('http://localhost:8765/');
    await expect(page.locator('html')).toBeAttached();
    // The page should have a canvas or game container
    await page.waitForLoadState('domcontentloaded');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('CSS and meta tags are present', async ({ page }) => {
    await page.goto('http://localhost:8765/');
    // Check that viewport meta exists
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toBeAttached();
  });

  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('http://localhost:8765/');
    await page.waitForTimeout(3000);
    // Allow WebGL errors (headless may not have GPU) but flag others
    const nonWebgl = errors.filter(e => !e.includes('WebGL') && !e.includes('webgl'));
    expect(nonWebgl.length).toBe(0);
  });
});
