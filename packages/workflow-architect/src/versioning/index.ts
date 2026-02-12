/**
 * Workflow Version Control System
 *
 * Provides comprehensive version control for n8n workflows including:
 * - Version storage (in-memory and Supabase)
 * - Diff generation between versions
 * - Three-way merge with conflict detection
 * - Safe rollback with preview and validation
 */

export * from './types';
export * from './store';
export * from './diff';
export * from './merge';
export * from './rollback';
