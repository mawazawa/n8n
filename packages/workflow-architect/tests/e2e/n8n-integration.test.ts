/**
 * E2E Integration Tests for Workflow Architect in n8n Editor
 *
 * These tests verify the full integration of the Workflow Architect
 * feature within the n8n editor environment.
 *
 * NOTE: These tests are designed for Playwright and should be run
 * within the n8n-playwright package.
 */

import { test, expect } from '@playwright/test';

/**
 * Test suite for Workflow Architect integration
 */
test.describe('Workflow Architect - n8n Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to n8n editor
    await page.goto('/workflow/new');

    // Wait for editor to load
    await page.waitForSelector('[data-test-id="canvas"]');
  });

  test('should open architect panel with keyboard shortcut', async ({ page }) => {
    // Press Cmd+Shift+A (or Ctrl+Shift+A on Windows/Linux)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Panel should open
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Should show welcome message
    await expect(page.locator('.workflow-architect-welcome__title')).toBeVisible();
  });

  test('should close architect panel with close button', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel to open
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Click close button
    await page.locator('[title="Close AI Architect"]').click();

    // Panel should close
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).not.toBeVisible();
  });

  test('should display example prompts', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Check for example prompts
    await expect(page.locator('.workflow-architect-examples__title')).toBeVisible();
    await expect(page.locator('.workflow-architect-examples__item').first()).toBeVisible();

    // Should have at least 3 examples
    const examples = await page.locator('.workflow-architect-examples__item').count();
    expect(examples).toBeGreaterThanOrEqual(3);
  });

  test('should populate input when clicking example prompt', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Click first example
    const firstExample = page.locator('.workflow-architect-examples__item').first();
    const exampleText = await firstExample.textContent();
    await firstExample.click();

    // Input should be populated
    const input = page.locator('[data-test-id="architect-input"]');
    await expect(input).toHaveValue(exampleText || '');
  });

  test('should send message when clicking send button', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Type message
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Create a simple workflow that sends a Slack message');

    // Click send button
    await page.locator('[data-test-id="architect-send-button"]').click();

    // Should show processing indicator
    await expect(page.locator('.workflow-architect-status--processing')).toBeVisible({
      timeout: 5000,
    });

    // Should show user message
    await expect(page.locator('.workflow-architect-message--user').last()).toContainText(
      'Create a simple workflow',
    );
  });

  test('should send message with keyboard shortcut', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Type message
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Create a webhook workflow');

    // Press Cmd+Enter (or Ctrl+Enter)
    await input.press(`${modifier}+Enter`);

    // Should show processing indicator
    await expect(page.locator('.workflow-architect-status--processing')).toBeVisible({
      timeout: 5000,
    });

    // Should show user message
    await expect(page.locator('.workflow-architect-message--user').last()).toContainText(
      'Create a webhook workflow',
    );
  });

  test('should display assistant response', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Send a message
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Create a simple workflow');
    await page.locator('[data-test-id="architect-send-button"]').click();

    // Wait for assistant response (with longer timeout for AI)
    await expect(page.locator('.workflow-architect-message--assistant')).toBeVisible({
      timeout: 60000,
    });

    // Should have response text
    const response = page.locator('.workflow-architect-message--assistant').last();
    await expect(response).not.toBeEmpty();
  });

  test('should display workflow preview when workflow is generated', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Send a message requesting workflow generation
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Create a workflow that sends a Slack message');
    await page.locator('[data-test-id="architect-send-button"]').click();

    // Wait for workflow preview (with longer timeout for AI)
    await expect(page.locator('.workflow-architect-message__workflow-preview')).toBeVisible({
      timeout: 90000,
    });

    // Should show workflow info
    await expect(
      page.locator('.workflow-architect-message__workflow-preview__info'),
    ).toContainText(/\d+ node/);

    // Should have apply button
    await expect(
      page.locator('.workflow-architect-message__workflow-preview button').first(),
    ).toBeVisible();
  });

  test('should apply workflow to canvas', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Send a message
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Create a workflow with a webhook and HTTP request node');
    await page.locator('[data-test-id="architect-send-button"]').click();

    // Wait for workflow preview
    await expect(page.locator('.workflow-architect-message__workflow-preview')).toBeVisible({
      timeout: 90000,
    });

    // Click apply button
    const applyButton = page
      .locator('.workflow-architect-message__workflow-preview button')
      .first();
    await applyButton.click();

    // Should see nodes on canvas
    await expect(page.locator('[data-test-id="canvas-node"]')).toHaveCount(
      { minimum: 1 },
      { timeout: 10000 },
    );
  });

  test('should start new conversation', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Send a message
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Test message');
    await page.locator('[data-test-id="architect-send-button"]').click();

    // Wait for response
    await expect(page.locator('.workflow-architect-message--user')).toBeVisible();

    // Click new conversation button
    await page.locator('[title*="new conversation"]').click();

    // Should only show welcome message
    const messages = await page.locator('.workflow-architect-message').count();
    expect(messages).toBe(0); // Only welcome screen, no messages
  });

  test('should abort request when clicking stop button', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Send a message
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Create a complex workflow');
    await page.locator('[data-test-id="architect-send-button"]').click();

    // Wait for processing
    await expect(page.locator('.workflow-architect-status--processing')).toBeVisible({
      timeout: 5000,
    });

    // Click stop button (if visible)
    const stopButton = page.locator('[title*="abort"]');
    if (await stopButton.isVisible()) {
      await stopButton.click();

      // Processing indicator should disappear
      await expect(page.locator('.workflow-architect-status--processing')).not.toBeVisible({
        timeout: 5000,
      });
    }
  });

  test('should show phase indicators during processing', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Send a message
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Create a workflow');
    await page.locator('[data-test-id="architect-send-button"]').click();

    // Wait for processing
    await expect(page.locator('.workflow-architect-status--processing')).toBeVisible({
      timeout: 5000,
    });

    // Should show phase information
    const statusText = await page.locator('.workflow-architect-status--processing').textContent();
    expect(statusText).toBeTruthy();
  });

  test('should handle feature flag disabled', async ({ page }) => {
    // Mock feature flag as disabled
    await page.addInitScript(() => {
      (window as { featureFlags?: Record<string, boolean> }).featureFlags = {
        aiArchitectEnabled: false,
      };
    });

    // Navigate to editor
    await page.goto('/workflow/new');
    await page.waitForSelector('[data-test-id="canvas"]');

    // Try to open panel with keyboard shortcut
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Panel should NOT open
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).not.toBeVisible({
      timeout: 2000,
    });
  });

  test('should copy workflow JSON to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Send a message
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Create a simple workflow');
    await page.locator('[data-test-id="architect-send-button"]').click();

    // Wait for workflow preview
    await expect(page.locator('.workflow-architect-message__workflow-preview')).toBeVisible({
      timeout: 90000,
    });

    // Click copy button
    const copyButton = page
      .locator('.workflow-architect-message__workflow-preview button[title*="Copy"]')
      .first();
    await copyButton.click();

    // Verify clipboard content (this requires clipboard API support)
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('nodes');
  });
});

/**
 * Test suite for error handling
 */
test.describe('Workflow Architect - Error Handling', () => {
  test('should handle network errors gracefully', async ({ page }) => {
    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Block network requests to architect API
    await page.route('**/api/architect/**', (route) => route.abort());

    // Send a message
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Create a workflow');
    await page.locator('[data-test-id="architect-send-button"]').click();

    // Should show error status
    await expect(page.locator('.workflow-architect-status--error')).toBeVisible({
      timeout: 10000,
    });
  });

  test('should handle backend service unavailable', async ({ page }) => {
    // Mock backend returning 503
    await page.route('**/api/architect/chat/stream', (route) => {
      void route.fulfill({
        status: 503,
        body: JSON.stringify({ error: 'Service unavailable' }),
      });
    });

    // Open panel
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Shift+A`);

    // Wait for panel
    await expect(page.locator('[data-test-id="workflow-architect-panel"]')).toBeVisible();

    // Send a message
    const input = page.locator('[data-test-id="architect-input"]');
    await input.fill('Create a workflow');
    await page.locator('[data-test-id="architect-send-button"]').click();

    // Should show error
    await expect(page.locator('.workflow-architect-status--error')).toBeVisible({
      timeout: 10000,
    });
  });
});
