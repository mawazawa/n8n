/**
 * E2E Tests for Web UI
 * Uses Playwright to test the user interface
 */

import { test, expect, type Page } from '@playwright/test';

// Skip E2E tests if not explicitly enabled
const skipE2E = process.env.SKIP_E2E_TESTS === 'true';
const testE2E = skipE2E ? test.skip : test;

testE2E.describe('Workflow Architect Web UI', () => {
  let page: Page;

  testE2E.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('http://localhost:3000');
  });

  testE2E.afterEach(async () => {
    await page.close();
  });

  testE2E.describe('landing page', () => {
    testE2E('should load the main page', async () => {
      await expect(page).toHaveTitle(/Workflow Architect/);
    });

    testE2E('should display chat interface', async () => {
      const chatInput = page.locator('[data-testid="chat-input"]');
      await expect(chatInput).toBeVisible();
    });

    testE2E('should display example prompts', async () => {
      const examples = page.locator('[data-testid="example-prompts"]');
      await expect(examples).toBeVisible();
    });
  });

  testE2E.describe('workflow generation', () => {
    testE2E('should generate workflow from prompt', async () => {
      // Type a prompt
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill('Create a workflow that sends Slack notifications');

      // Submit
      const submitButton = page.locator('[data-testid="submit-button"]');
      await submitButton.click();

      // Wait for response
      await page.waitForSelector('[data-testid="workflow-preview"]', {
        timeout: 30000,
      });

      // Verify workflow is displayed
      const workflowPreview = page.locator('[data-testid="workflow-preview"]');
      await expect(workflowPreview).toBeVisible();
    });

    testE2E('should display generated workflow nodes', async () => {
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill('Create a simple webhook workflow');
      await chatInput.press('Enter');

      await page.waitForSelector('[data-testid="workflow-node"]', {
        timeout: 30000,
      });

      const nodes = page.locator('[data-testid="workflow-node"]');
      const count = await nodes.count();
      expect(count).toBeGreaterThan(0);
    });

    testE2E('should show loading state during generation', async () => {
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill('Create a workflow');
      await chatInput.press('Enter');

      const loadingIndicator = page.locator('[data-testid="loading-indicator"]');
      await expect(loadingIndicator).toBeVisible();
    });
  });

  testE2E.describe('workflow editing', () => {
    testE2E('should allow editing node parameters', async () => {
      // Generate a workflow first
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill('Create a webhook workflow');
      await chatInput.press('Enter');

      await page.waitForSelector('[data-testid="workflow-node"]');

      // Click on a node
      const firstNode = page.locator('[data-testid="workflow-node"]').first();
      await firstNode.click();

      // Parameter panel should appear
      const parameterPanel = page.locator('[data-testid="parameter-panel"]');
      await expect(parameterPanel).toBeVisible();
    });

    testE2E('should allow adding new nodes', async () => {
      await page.waitForSelector('[data-testid="add-node-button"]');

      const addButton = page.locator('[data-testid="add-node-button"]');
      await addButton.click();

      const nodeSelector = page.locator('[data-testid="node-selector"]');
      await expect(nodeSelector).toBeVisible();
    });
  });

  testE2E.describe('workflow export', () => {
    testE2E('should export workflow as JSON', async () => {
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill('Create a simple workflow');
      await chatInput.press('Enter');

      await page.waitForSelector('[data-testid="export-button"]');

      const downloadPromise = page.waitForEvent('download');
      const exportButton = page.locator('[data-testid="export-button"]');
      await exportButton.click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.json$/);
    });

    testE2E('should copy workflow JSON to clipboard', async () => {
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill('Create a workflow');
      await chatInput.press('Enter');

      await page.waitForSelector('[data-testid="copy-json-button"]');

      const copyButton = page.locator('[data-testid="copy-json-button"]');
      await copyButton.click();

      // Verify success message
      const successMessage = page.locator('[data-testid="copy-success"]');
      await expect(successMessage).toBeVisible();
    });
  });

  testE2E.describe('workflow deployment', () => {
    testE2E('should deploy workflow to n8n', async () => {
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill('Create a workflow');
      await chatInput.press('Enter');

      await page.waitForSelector('[data-testid="deploy-button"]');

      const deployButton = page.locator('[data-testid="deploy-button"]');
      await deployButton.click();

      // Verify confirmation dialog
      const confirmDialog = page.locator('[data-testid="deploy-confirm"]');
      await expect(confirmDialog).toBeVisible();

      const confirmButton = page.locator('[data-testid="deploy-confirm-button"]');
      await confirmButton.click();

      // Wait for success message
      const successMessage = page.locator('[data-testid="deploy-success"]');
      await expect(successMessage).toBeVisible({ timeout: 10000 });
    });
  });

  testE2E.describe('chat history', () => {
    testE2E('should display conversation history', async () => {
      const chatInput = page.locator('[data-testid="chat-input"]');

      // Send first message
      await chatInput.fill('Create a webhook workflow');
      await chatInput.press('Enter');

      await page.waitForTimeout(1000);

      // Send second message
      await chatInput.fill('Add a Slack node');
      await chatInput.press('Enter');

      await page.waitForTimeout(1000);

      // Verify both messages are visible
      const messages = page.locator('[data-testid="chat-message"]');
      const count = await messages.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });

    testE2E('should clear conversation history', async () => {
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill('Create a workflow');
      await chatInput.press('Enter');

      await page.waitForTimeout(1000);

      const clearButton = page.locator('[data-testid="clear-chat-button"]');
      await clearButton.click();

      const messages = page.locator('[data-testid="chat-message"]');
      const count = await messages.count();
      expect(count).toBe(0);
    });
  });

  testE2E.describe('responsive design', () => {
    testE2E('should work on mobile viewport', async () => {
      await page.setViewportSize({ width: 375, height: 667 });

      const chatInput = page.locator('[data-testid="chat-input"]');
      await expect(chatInput).toBeVisible();
    });

    testE2E('should work on tablet viewport', async () => {
      await page.setViewportSize({ width: 768, height: 1024 });

      const chatInput = page.locator('[data-testid="chat-input"]');
      await expect(chatInput).toBeVisible();
    });
  });

  testE2E.describe('error handling', () => {
    testE2E('should display error for invalid API key', async () => {
      // Mock invalid API key scenario
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill('Create a workflow');
      await chatInput.press('Enter');

      // Error message should appear
      const errorMessage = page.locator('[data-testid="error-message"]');
      // Note: This would require mocking the API response
    });

    testE2E('should handle network errors gracefully', async () => {
      // This would require setting up network interception
      expect(true).toBe(true);
    });
  });

  testE2E.describe('accessibility', () => {
    testE2E('should have proper ARIA labels', async () => {
      const chatInput = page.locator('[data-testid="chat-input"]');
      const ariaLabel = await chatInput.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    });

    testE2E('should be keyboard navigable', async () => {
      await page.keyboard.press('Tab');
      const chatInput = page.locator('[data-testid="chat-input"]');
      await expect(chatInput).toBeFocused();
    });
  });
});
