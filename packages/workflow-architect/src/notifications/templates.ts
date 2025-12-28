/**
 * Template Manager
 * Manages notification templates with variable substitution and localization
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdminClient } from '../supabase/client';
import type {
  NotificationTemplate,
  NotificationTemplateRow,
  NotificationChannel,
  TemplateContext,
} from './types';

export class TemplateManager {
  private templateCache: Map<string, NotificationTemplate> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Create a new template
   */
  async create(template: Omit<NotificationTemplate, 'id'>): Promise<NotificationTemplate> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('notification_templates')
      .insert({
        id: uuidv4(),
        name: template.name,
        channel: template.channel,
        subject: template.subject || null,
        body: template.body,
        body_html: template.bodyHtml || null,
        variables: template.variables,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create template: ${error?.message}`);
    }

    const created = this.rowToTemplate(data);
    this.templateCache.set(created.name, created);

    return created;
  }

  /**
   * Get template by name
   */
  async getByName(name: string): Promise<NotificationTemplate | null> {
    // Check cache first
    const cached = this.templateCache.get(name);
    if (cached) {
      return cached;
    }

    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('name', name)
      .single();

    if (error || !data) {
      return null;
    }

    const template = this.rowToTemplate(data);
    this.templateCache.set(name, template);

    return template;
  }

  /**
   * Get template by ID
   */
  async getById(id: string): Promise<NotificationTemplate | null> {
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return null;
    }

    return this.rowToTemplate(data);
  }

  /**
   * Update template
   */
  async update(
    id: string,
    updates: Partial<Omit<NotificationTemplate, 'id'>>,
  ): Promise<NotificationTemplate> {
    const supabase = getSupabaseAdminClient();

    const updateData: Partial<NotificationTemplateRow> = {};

    if (updates.name) updateData.name = updates.name;
    if (updates.channel) updateData.channel = updates.channel;
    if (updates.subject !== undefined) updateData.subject = updates.subject;
    if (updates.body) updateData.body = updates.body;
    if (updates.bodyHtml !== undefined) updateData.body_html = updates.bodyHtml;
    if (updates.variables) updateData.variables = updates.variables;

    const { data, error } = await supabase
      .from('notification_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update template: ${error?.message}`);
    }

    const updated = this.rowToTemplate(data);

    // Update cache
    this.templateCache.set(updated.name, updated);

    return updated;
  }

  /**
   * Delete template
   */
  async delete(id: string): Promise<boolean> {
    const supabase = getSupabaseAdminClient();

    // Get template name for cache invalidation
    const template = await this.getById(id);

    const { error } = await supabase
      .from('notification_templates')
      .delete()
      .eq('id', id);

    if (!error && template) {
      this.templateCache.delete(template.name);
    }

    return !error;
  }

  /**
   * List all templates
   */
  async list(channel?: NotificationChannel): Promise<NotificationTemplate[]> {
    const supabase = getSupabaseAdminClient();

    let query = supabase.from('notification_templates').select('*');

    if (channel) {
      query = query.eq('channel', channel);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    return data.map((row) => this.rowToTemplate(row));
  }

  /**
   * Render template with data
   */
  async render(
    templateName: string,
    data: Record<string, unknown>,
  ): Promise<{ subject?: string; body: string; html?: string }> {
    const template = await this.getByName(templateName);

    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Validate required variables
    const missingVars = template.variables.filter((variable) => !(variable in data));
    if (missingVars.length > 0) {
      console.warn(`Missing template variables: ${missingVars.join(', ')}`);
    }

    return {
      subject: template.subject
        ? this.substituteVariables(template.subject, data)
        : undefined,
      body: this.substituteVariables(template.body, data),
      html: template.bodyHtml
        ? this.substituteVariables(template.bodyHtml, data)
        : undefined,
    };
  }

  /**
   * Render template with full context
   */
  async renderWithContext(
    templateName: string,
    context: TemplateContext,
  ): Promise<{ subject?: string; body: string; html?: string }> {
    // Merge context data
    const data: Record<string, unknown> = {
      ...context.data,
      user: context.user,
      metadata: context.metadata,
    };

    return this.render(templateName, data);
  }

  /**
   * Substitute variables in text
   * Supports {{variable}} and {{nested.property}} syntax
   */
  private substituteVariables(text: string, data: Record<string, unknown>): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.getNestedValue(data, path.trim());
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Get nested object value by path
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Extract variables from template text
   */
  extractVariables(text: string): string[] {
    const matches = text.match(/\{\{([^}]+)\}\}/g);
    if (!matches) return [];

    return Array.from(
      new Set(matches.map((match) => match.replace(/\{\{|\}\}/g, '').trim())),
    );
  }

  /**
   * Validate template syntax
   */
  validateTemplate(template: Omit<NotificationTemplate, 'id'>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check required fields
    if (!template.name || template.name.length < 2) {
      errors.push('Template name must be at least 2 characters');
    }

    if (!template.body || template.body.length === 0) {
      errors.push('Template body is required');
    }

    // Check email-specific requirements
    if (template.channel === 'email' && !template.subject) {
      errors.push('Email templates require a subject');
    }

    // Extract and validate variables
    const bodyVars = this.extractVariables(template.body);
    const subjectVars = template.subject
      ? this.extractVariables(template.subject)
      : [];
    const htmlVars = template.bodyHtml
      ? this.extractVariables(template.bodyHtml)
      : [];

    const allVars = new Set([...bodyVars, ...subjectVars, ...htmlVars]);

    // Check if declared variables match extracted variables
    const declaredVars = new Set(template.variables);
    const undeclaredVars = Array.from(allVars).filter(
      (v) => !declaredVars.has(v),
    );

    if (undeclaredVars.length > 0) {
      errors.push(`Undeclared variables found: ${undeclaredVars.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clone template with new name
   */
  async clone(id: string, newName: string): Promise<NotificationTemplate> {
    const template = await this.getById(id);

    if (!template) {
      throw new Error('Template not found');
    }

    return this.create({
      name: newName,
      channel: template.channel,
      subject: template.subject,
      body: template.body,
      bodyHtml: template.bodyHtml,
      variables: template.variables,
    });
  }

  /**
   * Preview template with sample data
   */
  async preview(
    templateName: string,
    sampleData: Record<string, unknown>,
  ): Promise<{ subject?: string; body: string; html?: string }> {
    return this.render(templateName, sampleData);
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.templateCache.clear();
  }

  /**
   * Get template usage statistics
   */
  async getUsageStats(templateName: string): Promise<{
    totalSent: number;
    successRate: number;
    lastUsed?: string;
  }> {
    const supabase = getSupabaseAdminClient();

    const { count: totalSent } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('template', templateName)
      .neq('status', 'pending');

    const { count: successful } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('template', templateName)
      .in('status', ['sent', 'delivered', 'read']);

    const { data: lastUsedData } = await supabase
      .from('notifications')
      .select('created_at')
      .eq('template', templateName)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return {
      totalSent: totalSent || 0,
      successRate:
        totalSent && successful ? (successful / totalSent) * 100 : 0,
      lastUsed: lastUsedData?.created_at,
    };
  }

  /**
   * Convert database row to NotificationTemplate
   */
  private rowToTemplate(row: NotificationTemplateRow): NotificationTemplate {
    return {
      id: row.id,
      name: row.name,
      channel: row.channel,
      subject: row.subject || undefined,
      body: row.body,
      bodyHtml: row.body_html || undefined,
      variables: row.variables,
    };
  }

  /**
   * Import templates from JSON
   */
  async importTemplates(
    templates: Array<Omit<NotificationTemplate, 'id'>>,
  ): Promise<{ imported: number; failed: number; errors: string[] }> {
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const template of templates) {
      try {
        const validation = this.validateTemplate(template);
        if (!validation.valid) {
          failed++;
          errors.push(`${template.name}: ${validation.errors.join(', ')}`);
          continue;
        }

        await this.create(template);
        imported++;
      } catch (error) {
        failed++;
        errors.push(
          `${template.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return { imported, failed, errors };
  }

  /**
   * Export templates to JSON
   */
  async exportTemplates(channel?: NotificationChannel): Promise<NotificationTemplate[]> {
    return this.list(channel);
  }
}
