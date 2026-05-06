import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TARGET_URL = process.env.TARGET_URL ?? 'http://localhost:3000';

test.describe('UI regression coverage', () => {
  test('page loads without critical runtime errors', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/.+/);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('mobile layout keeps primary actions reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

    // Replace this with the primary action found during exploratory testing.
    const primaryAction = page.getByRole('button').first();
    await expect(primaryAction).toBeVisible();

    const box = await primaryAction.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  });

  test('has no serious accessibility violations', async ({ page }) => {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''));
    expect(serious).toEqual([]);
  });

  test('stable visual checkpoint', async ({ page }) => {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

    // Mask dynamic regions before enabling this in CI:
    // await expect(page).toHaveScreenshot('page.png', {
    //   animations: 'disabled',
    //   mask: [page.locator('[data-dynamic]')],
    // });
  });
});
