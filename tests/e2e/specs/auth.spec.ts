// Authentication E2E Tests
// Tests the critical authentication flows

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login screen', async ({ page }) => {
    // Should show the login form
    await expect(page.locator('input[placeholder*="username" i], input[name*="username" i]')).toBeVisible();
  });

  test('should allow guest login with username', async ({ page }) => {
    // Enter a username
    const usernameInput = page.locator('input[placeholder*="username" i], input[name*="username" i]');
    await usernameInput.fill('TestUser123');
    
    // Click login/join button
    const loginButton = page.locator('button:has-text("Join"), button:has-text("Login"), button:has-text("Connect")');
    await loginButton.click();
    
    // Should navigate to main app or show success
    await expect(page.locator('text=TestUser123')).toBeVisible({ timeout: 10000 });
  });

  test('should reject invalid username', async ({ page }) => {
    const usernameInput = page.locator('input[placeholder*="username" i], input[name*="username" i]');
    
    // Try with special characters
    await usernameInput.fill('test@user!');
    
    const loginButton = page.locator('button:has-text("Join"), button:has-text("Login"), button:has-text("Connect")');
    await loginButton.click();
    
    // Should show error message
    await expect(page.locator('text=/invalid|error|failed/i')).toBeVisible({ timeout: 5000 });
  });

  test('should reject empty username', async ({ page }) => {
    const loginButton = page.locator('button:has-text("Join"), button:has-text("Login"), button:has-text("Connect")');
    await loginButton.click();
    
    // Button should be disabled or show validation error
    await expect(page.locator('text=/required|empty|invalid/i')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Server Connection', () => {
  test('should connect to local server', async ({ page }) => {
    await page.goto('/');
    
    // Enter username
    const usernameInput = page.locator('input[placeholder*="username" i], input[name*="username" i]');
    await usernameInput.fill('E2ETestUser');
    
    // Click login
    const loginButton = page.locator('button:has-text("Join"), button:has-text("Login"), button:has-text("Connect")');
    await loginButton.click();
    
    // Wait for connection - should see server or channels
    await expect(page.locator('text=/general|random|channel/i')).toBeVisible({ timeout: 15000 });
  });
});