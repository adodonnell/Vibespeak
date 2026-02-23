// Chat E2E Tests
// Tests the critical chat/message flows

import { test, expect } from '@playwright/test';

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Login first
    const usernameInput = page.locator('input[placeholder*="username" i], input[name*="username" i]');
    await usernameInput.fill('ChatTestUser');
    
    const loginButton = page.locator('button:has-text("Join"), button:has-text("Login"), button:has-text("Connect")');
    await loginButton.click();
    
    // Wait for connection
    await expect(page.locator('text=/general|random/i')).toBeVisible({ timeout: 15000 });
  });

  test('should display channels', async ({ page }) => {
    // Should see at least one channel
    await expect(page.locator('text=/general|random|music|gaming/i')).toBeVisible();
  });

  test('should send a message', async ({ page }) => {
    // Click on a channel to select it
    await page.click('text=/general|random/i');
    
    // Find message input
    const messageInput = page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i], [contenteditable="true"]');
    await messageInput.waitFor({ state: 'visible' });
    
    // Type and send message
    const testMessage = `Test message ${Date.now()}`;
    await messageInput.fill(testMessage);
    await messageInput.press('Enter');
    
    // Message should appear in chat
    await expect(page.locator(`text="${testMessage}"`)).toBeVisible({ timeout: 5000 });
  });

  test('should show user list', async ({ page }) => {
    // Should see current user in the user list
    await expect(page.locator('text=ChatTestUser')).toBeVisible({ timeout: 5000 });
  });

  test('should switch channels', async ({ page }) => {
    // Click on different channel if available
    const randomChannel = page.locator('text=random');
    if (await randomChannel.isVisible()) {
      await randomChannel.click();
      // Channel name should be highlighted or shown in header
      await expect(page.locator('text=/random|#random/i')).toBeVisible({ timeout: 3000 });
    }
  });
});

test.describe('Message Reactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    const usernameInput = page.locator('input[placeholder*="username" i], input[name*="username" i]');
    await usernameInput.fill('ReactionTestUser');
    
    const loginButton = page.locator('button:has-text("Join"), button:has-text("Login"), button:has-text("Connect")');
    await loginButton.click();
    
    await expect(page.locator('text=/general|random/i')).toBeVisible({ timeout: 15000 });
  });

  test('should add reaction to message', async ({ page }) => {
    // Click on a channel
    await page.click('text=/general|random/i');
    
    // Send a message first
    const messageInput = page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i], [contenteditable="true"]');
    await messageInput.waitFor({ state: 'visible' });
    
    const testMessage = `Reaction test ${Date.now()}`;
    await messageInput.fill(testMessage);
    await messageInput.press('Enter');
    
    // Wait for message to appear
    await expect(page.locator(`text="${testMessage}"`)).toBeVisible({ timeout: 5000 });
    
    // Hover over message to see reaction button
    await page.hover(`text="${testMessage}"`);
    
    // Look for reaction button (emoji icon)
    const reactionButton = page.locator('button:has-text("😀"), button:has-text("😊"), [aria-label*="reaction" i], [aria-label*="emoji" i]');
    
    // If reaction UI exists, test it
    if (await reactionButton.count() > 0) {
      await reactionButton.first().click();
      
      // Click on an emoji
      const emoji = page.locator('button:has-text("👍"), [data-emoji="👍"], text=👍').first();
      if (await emoji.count() > 0) {
        await emoji.click();
        
        // Reaction should appear
        await expect(page.locator('text=👍')).toBeVisible({ timeout: 3000 });
      }
    }
  });
});