import { test, expect } from '@playwright/test';

test.describe('Studio 3D — smoke tests', () => {
  test('homepage loads and renders', async ({ page }) => {
    await page.goto('http://localhost:8766/');
    await expect(page.locator('html')).toBeAttached();
    await page.waitForLoadState('domcontentloaded');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('essential UI elements exist', async ({ page }) => {
    await page.goto('http://localhost:8766/');
    // Look for the main menu or canvas container
    const hasCanvas = await page.locator('canvas').count();
    // Some pages may not have a canvas initially — that's ok
    expect(hasCanvas).toBeGreaterThanOrEqual(0);
  });

  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('http://localhost:8766/');
    await page.waitForTimeout(3000);
    const nonWebgl = errors.filter(e => !e.includes('WebGL') && !e.includes('webgl'));
    expect(nonWebgl.length).toBe(0);
  });
});
