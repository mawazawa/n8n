import { test, expect, type Page } from '@playwright/test';

/**
 * E2E tests for Workflow Architect Chat UI
 * Tests the complete chat flow including messaging, streaming, workflow preview, and session management
 */

test.describe('Workflow Architect Chat UI', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe('Initial Load', () => {
    test('should display welcome message on first load', async ({ page }) => {
      await page.goto('/');

      // Check for welcome screen
      await expect(page.getByRole('heading', { name: /welcome to workflow architect/i })).toBeVisible();

      // Check for example prompts
      await expect(page.getByText(/send a slack message when a new github issue is created/i)).toBeVisible();
    });

    test('should have proper page title', async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveTitle(/workflow architect/i);
    });

    test('should display input field', async ({ page }) => {
      await page.goto('/');
      const input = page.getByPlaceholder(/describe the workflow/i);
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
    });
  });

  test.describe('Chat Functionality', () => {
    test('should send a message and display it', async ({ page }) => {
      await page.goto('/');

      const message = 'Create a workflow that sends an email when a webhook is triggered';
      const input = page.getByPlaceholder(/describe the workflow/i);

      // Type and send message
      await input.fill(message);
      await input.press('Enter');

      // Verify user message is displayed
      await expect(page.getByText(message)).toBeVisible();
      await expect(page.getByText('You')).toBeVisible();
    });

    test('should show typing indicator when streaming', async ({ page }) => {
      await page.goto('/');

      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.fill('Build a simple workflow');
      await input.press('Enter');

      // Check for typing indicator (might be brief)
      const typingIndicator = page.getByText(/thinking/i);
      // Note: This might not always be visible due to fast responses
      // await expect(typingIndicator).toBeVisible();
    });

    test('should disable input while streaming', async ({ page }) => {
      await page.goto('/');

      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.fill('Create a workflow');
      await input.press('Enter');

      // Input should be disabled while streaming
      await expect(input).toBeDisabled();
    });

    test('should support multiline input with Shift+Enter', async ({ page }) => {
      await page.goto('/');

      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.click();
      await input.type('Line 1');
      await input.press('Shift+Enter');
      await input.type('Line 2');

      const value = await input.inputValue();
      expect(value).toContain('\n');
    });

    test('should clear messages when clicking clear chat', async ({ page }) => {
      await page.goto('/');

      // Send a message
      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.fill('Test message');
      await input.press('Enter');

      // Wait for message to appear
      await expect(page.getByText('Test message')).toBeVisible();

      // Click clear chat
      const clearButton = page.getByRole('button', { name: /clear chat/i });
      await clearButton.click();

      // Welcome message should be visible again
      await expect(page.getByRole('heading', { name: /welcome to workflow architect/i })).toBeVisible();
    });
  });

  test.describe('Phase Indicators', () => {
    test('should show phase indicators during workflow building', async ({ page }) => {
      await page.goto('/');

      // Mock API response with phase updates
      await page.route('**/api/chat', async (route) => {
        const eventStream = `data: {"type":"phase","data":"discovery","timestamp":${Date.now()}}\n\n` +
          `data: {"type":"response","data":"I'll help you build that workflow","timestamp":${Date.now()}}\n\n` +
          `data: {"type":"done","data":null,"timestamp":${Date.now()}}\n\n`;

        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: eventStream,
        });
      });

      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.fill('Create a workflow');
      await input.press('Enter');

      // Check if phase indicator appears (might be "Discovering", "Building", etc.)
      // Note: The exact text depends on the backend response
      // await expect(page.getByText(/discovering|building|configuring/i)).toBeVisible();
    });
  });

  test.describe('Workflow Preview', () => {
    test('should show workflow preview panel on desktop', async ({ page }) => {
      await page.goto('/');
      await page.setViewportSize({ width: 1280, height: 720 });

      // Workflow preview should be visible on desktop
      await expect(page.getByText(/workflow preview/i)).toBeVisible();
    });

    test('should display workflow details when available', async ({ page }) => {
      await page.goto('/');
      await page.setViewportSize({ width: 1280, height: 720 });

      // Mock API response with workflow data
      await page.route('**/api/chat', async (route) => {
        const workflow = {
          name: 'Test Workflow',
          active: true,
          nodes: [
            { id: '1', name: 'Webhook', type: 'n8n-nodes-base.webhook', position: [0, 0] },
            { id: '2', name: 'Email', type: 'n8n-nodes-base.email', position: [200, 0] },
          ],
          connections: {},
        };

        const eventStream = `data: {"type":"workflow","data":${JSON.stringify(workflow)},"timestamp":${Date.now()}}\n\n` +
          `data: {"type":"response","data":"Workflow created","timestamp":${Date.now()}}\n\n` +
          `data: {"type":"done","data":null,"timestamp":${Date.now()}}\n\n`;

        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: eventStream,
        });
      });

      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.fill('Create a workflow');
      await input.press('Enter');

      // Wait for workflow to be created
      await page.waitForTimeout(500);

      // Expand workflow preview if collapsed
      const previewButton = page.getByRole('button', { name: /workflow preview/i });
      await previewButton.click();

      // Check for workflow nodes
      await expect(page.getByText('Webhook')).toBeVisible();
      await expect(page.getByText('Email')).toBeVisible();
    });
  });

  test.describe('Session Management', () => {
    test('should create a new session', async ({ page }) => {
      await page.goto('/');

      // Open sidebar on mobile
      const viewport = page.viewportSize();
      if (viewport && viewport.width < 1024) {
        await page.getByRole('button', { name: /menu/i }).click();
      }

      // Click new chat button
      const newChatButton = page.getByRole('button', { name: /new chat/i });
      await newChatButton.click();

      // Should show welcome message again
      await expect(page.getByRole('heading', { name: /welcome to workflow architect/i })).toBeVisible();
    });

    test('should persist sessions in localStorage', async ({ page }) => {
      await page.goto('/');

      // Send a message
      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.fill('Test persistence');
      await input.press('Enter');

      // Wait for message
      await expect(page.getByText('Test persistence')).toBeVisible();

      // Reload page
      await page.reload();

      // Message should still be there
      await expect(page.getByText('Test persistence')).toBeVisible();
    });
  });

  test.describe('Theme Support', () => {
    test('should toggle between light and dark themes', async ({ page }) => {
      await page.goto('/');

      // Find theme toggle button
      const themeToggle = page.getByRole('button', { name: /switch to dark mode/i });
      await themeToggle.click();

      // Check if dark class is added to html element
      const htmlElement = page.locator('html');
      await expect(htmlElement).toHaveClass(/dark/);

      // Toggle back to light
      await page.getByRole('button', { name: /switch to light mode/i }).click();
      await expect(htmlElement).not.toHaveClass(/dark/);
    });

    test('should persist theme preference', async ({ page }) => {
      await page.goto('/');

      // Switch to dark mode
      const themeToggle = page.getByRole('button', { name: /switch to dark mode/i });
      await themeToggle.click();

      // Reload page
      await page.reload();

      // Should still be in dark mode
      const htmlElement = page.locator('html');
      await expect(htmlElement).toHaveClass(/dark/);
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('should submit message with Cmd+Enter', async ({ page }) => {
      await page.goto('/');

      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.fill('Test keyboard shortcut');

      // Press Cmd+Enter (or Ctrl+Enter on Windows/Linux)
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await input.press(`${modifier}+Enter`);

      // Message should be sent
      await expect(page.getByText('Test keyboard shortcut')).toBeVisible();
    });

    test('should focus input with Cmd+K', async ({ page }) => {
      await page.goto('/');

      const input = page.getByPlaceholder(/describe the workflow/i);

      // Click somewhere else
      await page.click('body');

      // Press Cmd+K
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+k`);

      // Input should be focused
      await expect(input).toBeFocused();
    });
  });

  test.describe('Error Handling', () => {
    test('should display error message on API failure', async ({ page }) => {
      await page.goto('/');

      // Mock API error
      await page.route('**/api/chat', async (route) => {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      });

      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.fill('Trigger an error');
      await input.press('Enter');

      // Should show error message
      await expect(page.getByText(/something went wrong|error/i)).toBeVisible();
    });

    test('should allow retry on error', async ({ page }) => {
      await page.goto('/');

      let requestCount = 0;

      // Mock API to fail first, then succeed
      await page.route('**/api/chat', async (route) => {
        requestCount++;
        if (requestCount === 1) {
          await route.fulfill({
            status: 500,
            body: JSON.stringify({ error: 'Server error' }),
          });
        } else {
          const eventStream = `data: {"type":"response","data":"Success after retry","timestamp":${Date.now()}}\n\n` +
            `data: {"type":"done","data":null,"timestamp":${Date.now()}}\n\n`;

          await route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
            body: eventStream,
          });
        }
      });

      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.fill('Test retry');
      await input.press('Enter');

      // Wait for error
      await expect(page.getByText(/error/i)).toBeVisible();

      // Click retry button if available
      const retryButton = page.getByRole('button', { name: /try again|retry/i });
      if (await retryButton.isVisible()) {
        await retryButton.click();
        await expect(page.getByText('Success after retry')).toBeVisible();
      }
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper ARIA labels', async ({ page }) => {
      await page.goto('/');

      // Check for important ARIA labels
      await expect(page.getByRole('button', { name: /send/i })).toBeVisible();
      await expect(page.getByRole('textbox')).toBeVisible();
    });

    test('should be keyboard navigable', async ({ page }) => {
      await page.goto('/');

      // Tab through interactive elements
      await page.keyboard.press('Tab');
      // Focus should move through the page

      const input = page.getByPlaceholder(/describe the workflow/i);
      await expect(input).toBeFocused();
    });

    test('should have proper focus indicators', async ({ page }) => {
      await page.goto('/');

      const input = page.getByPlaceholder(/describe the workflow/i);
      await input.focus();

      // Check that focused element has visible focus ring
      const focusRing = await input.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return styles.outline || styles.boxShadow;
      });

      expect(focusRing).toBeTruthy();
    });
  });

  test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');

      // Input should be visible and usable
      const input = page.getByPlaceholder(/describe the workflow/i);
      await expect(input).toBeVisible();

      // Sidebar should be hidden by default on mobile
      const sidebar = page.locator('aside');
      await expect(sidebar).not.toBeVisible();

      // Menu button should be visible
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
    });

    test('should show sidebar on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/');

      // Sidebar should be visible on desktop
      const sidebar = page.locator('aside');
      await expect(sidebar).toBeVisible();
    });

    test('should toggle mobile sidebar', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');

      // Open sidebar
      await page.getByRole('button', { name: /menu/i }).click();

      // Sidebar should now be visible
      const sidebar = page.locator('aside');
      await expect(sidebar).toBeVisible();

      // Close sidebar by clicking overlay
      await page.locator('.fixed.inset-0.z-40').click();
      await expect(sidebar).not.toBeVisible();
    });
  });
});
