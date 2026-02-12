/**
 * File Loader
 * Load workflow templates from filesystem with validation and watch support
 */

import { readFile, readdir, stat, watch } from 'fs/promises';
import { join, resolve } from 'path';
import { ErrorCode, WorkflowArchitectError } from '../../errors/index.js';
import type { WorkflowTemplate } from '../types.js';

interface LoadResult {
  templates: WorkflowTemplate[];
  errors: Array<{ file: string; error: string }>;
}

interface WatchCallback {
  (event: 'added' | 'changed' | 'removed', file: string, template?: WorkflowTemplate): void;
}

/**
 * Load a single template from a JSON file
 * @param filePath - Path to the template JSON file
 * @returns The loaded template or null if failed
 */
export async function loadFromFile(filePath: string): Promise<WorkflowTemplate> {
  try {
    // Resolve to absolute path
    const absolutePath = resolve(filePath);

    // Read file contents
    const content = await readFile(absolutePath, 'utf-8');

    // Parse JSON
    let template: WorkflowTemplate;
    try {
      template = JSON.parse(content) as WorkflowTemplate;
    } catch (error) {
      throw new WorkflowArchitectError(
        `Failed to parse JSON in file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
        ErrorCode.VALIDATION_ERROR,
        { filePath, error: String(error) },
      );
    }

    // Basic validation
    validateTemplateStructure(template, filePath);

    return template;
  } catch (error) {
    if (error instanceof WorkflowArchitectError) {
      throw error;
    }

    throw new WorkflowArchitectError(
      `Failed to load template from file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      ErrorCode.VALIDATION_ERROR,
      { filePath, error: String(error) },
    );
  }
}

/**
 * Load all templates from a directory
 * @param dirPath - Path to directory containing template JSON files
 * @returns Object with successfully loaded templates and errors
 */
export async function loadFromDirectory(dirPath: string): Promise<LoadResult> {
  const templates: WorkflowTemplate[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  try {
    // Resolve to absolute path
    const absolutePath = resolve(dirPath);

    // Check if directory exists
    try {
      const stats = await stat(absolutePath);
      if (!stats.isDirectory()) {
        throw new WorkflowArchitectError(
          `Path "${dirPath}" is not a directory`,
          ErrorCode.VALIDATION_ERROR,
          { dirPath },
        );
      }
    } catch (error) {
      throw new WorkflowArchitectError(
        `Directory "${dirPath}" does not exist or is not accessible`,
        ErrorCode.NOT_FOUND,
        { dirPath, error: String(error) },
      );
    }

    // Read all files in directory
    const entries = await readdir(absolutePath, { withFileTypes: true });

    // Process each JSON file
    for (const entry of entries) {
      // Skip non-files
      if (!entry.isFile()) {
        continue;
      }

      // Only process .json files
      if (!entry.name.endsWith('.json')) {
        continue;
      }

      const filePath = join(absolutePath, entry.name);

      try {
        const template = await loadFromFile(filePath);
        templates.push(template);
      } catch (error) {
        // Collect errors but continue processing other files
        errors.push({
          file: entry.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { templates, errors };
  } catch (error) {
    if (error instanceof WorkflowArchitectError) {
      throw error;
    }

    throw new WorkflowArchitectError(
      `Failed to load templates from directory "${dirPath}": ${error instanceof Error ? error.message : String(error)}`,
      ErrorCode.VALIDATION_ERROR,
      { dirPath, error: String(error) },
    );
  }
}

/**
 * Watch a directory for template changes
 * @param dirPath - Path to directory to watch
 * @param callback - Callback function called when files change
 * @returns Function to stop watching
 */
export async function watchDirectory(
  dirPath: string,
  callback: WatchCallback,
): Promise<() => void> {
  try {
    // Resolve to absolute path
    const absolutePath = resolve(dirPath);

    // Check if directory exists
    try {
      const stats = await stat(absolutePath);
      if (!stats.isDirectory()) {
        throw new WorkflowArchitectError(
          `Path "${dirPath}" is not a directory`,
          ErrorCode.VALIDATION_ERROR,
          { dirPath },
        );
      }
    } catch (error) {
      throw new WorkflowArchitectError(
        `Directory "${dirPath}" does not exist or is not accessible`,
        ErrorCode.NOT_FOUND,
        { dirPath, error: String(error) },
      );
    }

    // Track existing files
    const fileCache = new Map<string, string>();

    // Initial scan
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        const filePath = join(absolutePath, entry.name);
        try {
          const content = await readFile(filePath, 'utf-8');
          fileCache.set(entry.name, content);
        } catch {
          // Ignore read errors during initial scan
        }
      }
    }

    // Create watcher
    const watcher = watch(absolutePath, { recursive: false });

    // Handle watch events
    const processWatchEvent = async () => {
      try {
        for await (const event of watcher) {
          const filename = event.filename;
          if (!filename || !filename.endsWith('.json')) {
            continue;
          }

          const filePath = join(absolutePath, filename);

          try {
            // Check if file still exists
            const stats = await stat(filePath);

            if (stats.isFile()) {
              const content = await readFile(filePath, 'utf-8');
              const previousContent = fileCache.get(filename);

              if (previousContent === undefined) {
                // New file
                fileCache.set(filename, content);
                try {
                  const template = await loadFromFile(filePath);
                  callback('added', filename, template);
                } catch (error) {
                  callback('added', filename);
                }
              } else if (previousContent !== content) {
                // Modified file
                fileCache.set(filename, content);
                try {
                  const template = await loadFromFile(filePath);
                  callback('changed', filename, template);
                } catch (error) {
                  callback('changed', filename);
                }
              }
            }
          } catch (error) {
            // File was deleted or is not accessible
            if (fileCache.has(filename)) {
              fileCache.delete(filename);
              callback('removed', filename);
            }
          }
        }
      } catch (error) {
        // Watcher closed or error occurred
        // Stop processing events
      }
    };

    // Start processing events
    processWatchEvent().catch(() => {
      // Ignore errors - watcher was likely stopped
    });

    // Return stop function
    return async () => {
      watcher.return?.(undefined);
    };
  } catch (error) {
    if (error instanceof WorkflowArchitectError) {
      throw error;
    }

    throw new WorkflowArchitectError(
      `Failed to watch directory "${dirPath}": ${error instanceof Error ? error.message : String(error)}`,
      ErrorCode.VALIDATION_ERROR,
      { dirPath, error: String(error) },
    );
  }
}

/**
 * Validate basic template structure
 * @throws {WorkflowArchitectError} If structure is invalid
 */
function validateTemplateStructure(template: unknown, filePath: string): void {
  if (!template || typeof template !== 'object') {
    throw new WorkflowArchitectError(
      `Template must be an object`,
      ErrorCode.VALIDATION_ERROR,
      { filePath },
    );
  }

  const t = template as Record<string, unknown>;

  if (!t.metadata || typeof t.metadata !== 'object') {
    throw new WorkflowArchitectError(
      `Template must have a "metadata" object`,
      ErrorCode.VALIDATION_ERROR,
      { filePath },
    );
  }

  const metadata = t.metadata as Record<string, unknown>;

  if (!metadata.id || typeof metadata.id !== 'string') {
    throw new WorkflowArchitectError(
      `Template metadata must have an "id" string`,
      ErrorCode.VALIDATION_ERROR,
      { filePath },
    );
  }

  if (!metadata.name || typeof metadata.name !== 'string') {
    throw new WorkflowArchitectError(
      `Template metadata must have a "name" string`,
      ErrorCode.VALIDATION_ERROR,
      { filePath, templateId: metadata.id },
    );
  }

  if (!t.workflow || typeof t.workflow !== 'object') {
    throw new WorkflowArchitectError(
      `Template must have a "workflow" object`,
      ErrorCode.VALIDATION_ERROR,
      { filePath, templateId: metadata.id },
    );
  }

  if (!Array.isArray(t.variables)) {
    throw new WorkflowArchitectError(
      `Template must have a "variables" array`,
      ErrorCode.VALIDATION_ERROR,
      { filePath, templateId: metadata.id },
    );
  }

  if (!Array.isArray(t.prerequisites)) {
    throw new WorkflowArchitectError(
      `Template must have a "prerequisites" array`,
      ErrorCode.VALIDATION_ERROR,
      { filePath, templateId: metadata.id },
    );
  }
}

/**
 * Load templates from directory and return a Map for quick lookup
 */
export async function loadTemplatesAsMap(dirPath: string): Promise<Map<string, WorkflowTemplate>> {
  const result = await loadFromDirectory(dirPath);
  const templateMap = new Map<string, WorkflowTemplate>();

  for (const template of result.templates) {
    templateMap.set(template.metadata.id, template);
  }

  return templateMap;
}

/**
 * Check if a file is a valid template JSON file
 */
export async function isValidTemplateFile(filePath: string): Promise<boolean> {
  try {
    await loadFromFile(filePath);
    return true;
  } catch {
    return false;
  }
}
