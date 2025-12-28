/**
 * Procedural Memory Manager
 * Stores and retrieves learned procedures and skills
 */

import { v4 as uuidv4 } from 'uuid';
import { getSupabaseClient } from '../supabase/client.js';
import { MemoryStore } from './store.js';
import type { ProceduralMemory } from './types.js';

export interface ProcedureOptions {
  importance?: number;
  triggerPatterns?: string[];
}

export interface ProcedureMatch {
  procedure: ProceduralMemory;
  matchScore: number;
  confidence: number;
}

/**
 * Manages procedural memories (learned skills and procedures)
 */
export class ProceduralMemoryManager {
  private store: MemoryStore;

  constructor(store: MemoryStore) {
    this.store = store;
  }

  /**
   * Learn a new procedure
   */
  async learnProcedure(
    skill: string,
    steps: string[],
    options: ProcedureOptions = {}
  ): Promise<ProceduralMemory> {
    // Check if procedure already exists
    const existing = await this.findProcedureBySkill(skill);

    if (existing) {
      // Update existing procedure
      return await this.updateProcedure(existing.id, steps, options);
    }

    // Create new procedure
    const content = `Skill: ${skill}\nSteps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    const procedure: ProceduralMemory = {
      id: uuidv4(),
      type: 'procedural',
      content,
      metadata: {
        learnedAt: Date.now(),
        lastUsed: Date.now(),
      },
      importance: options.importance ?? 0.5,
      accessCount: 0,
      lastAccessed: Date.now(),
      createdAt: Date.now(),
      skill,
      steps,
      triggerPatterns: options.triggerPatterns || this.generateTriggerPatterns(skill, steps),
      successRate: 1.0, // Assume success initially
      usageCount: 0,
    };

    await this.store.save(procedure);
    return procedure;
  }

  /**
   * Update existing procedure
   */
  async updateProcedure(
    procedureId: string,
    newSteps?: string[],
    options: ProcedureOptions = {}
  ): Promise<ProceduralMemory> {
    const procedure = await this.store.get(procedureId) as ProceduralMemory | null;

    if (!procedure) {
      throw new Error(`Procedure not found: ${procedureId}`);
    }

    if (newSteps) {
      procedure.steps = newSteps;
      procedure.content = `Skill: ${procedure.skill}\nSteps:\n${newSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
    }

    if (options.importance !== undefined) {
      procedure.importance = options.importance;
    }

    if (options.triggerPatterns) {
      procedure.triggerPatterns = options.triggerPatterns;
    }

    await this.store.save(procedure);
    return procedure;
  }

  /**
   * Match procedures to a pattern or query
   */
  async matchProcedure(pattern: string, limit = 5): Promise<ProcedureMatch[]> {
    const supabase = getSupabaseClient();

    // Search using vector similarity
    const results = await this.store.search(pattern, {
      type: 'procedural',
      limit: limit * 2, // Get more for filtering
    });

    const matches: ProcedureMatch[] = [];

    for (const result of results) {
      const procedure = result.memory as ProceduralMemory;

      // Check trigger patterns
      const patternMatch = this.matchTriggerPatterns(
        pattern.toLowerCase(),
        procedure.triggerPatterns
      );

      if (patternMatch || result.score > 0.6) {
        const matchScore = patternMatch ? 1.0 : result.score;
        const confidence = this.calculateConfidence(
          procedure.successRate,
          procedure.usageCount,
          matchScore
        );

        matches.push({
          procedure,
          matchScore,
          confidence,
        });
      }
    }

    // Sort by confidence and limit
    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Record procedure usage and outcome
   */
  async recordUsage(
    procedureId: string,
    success: boolean
  ): Promise<ProceduralMemory> {
    const procedure = await this.store.get(procedureId) as ProceduralMemory | null;

    if (!procedure) {
      throw new Error(`Procedure not found: ${procedureId}`);
    }

    // Update usage statistics
    procedure.usageCount++;
    procedure.metadata.lastUsed = Date.now();

    // Update success rate using exponential moving average
    const alpha = 0.2; // Learning rate
    const newSuccessRate = success ? 1.0 : 0.0;
    procedure.successRate =
      alpha * newSuccessRate + (1 - alpha) * procedure.successRate;

    // Adjust importance based on success rate
    if (procedure.usageCount > 5) {
      procedure.importance = Math.min(
        procedure.importance + (procedure.successRate - 0.5) * 0.1,
        1.0
      );
    }

    await this.store.save(procedure);
    return procedure;
  }

  /**
   * Get procedure by skill name
   */
  async findProcedureBySkill(skill: string): Promise<ProceduralMemory | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('type', 'procedural')
      .eq('skill', skill)
      .single();

    if (error || !data) {
      return null;
    }

    return this.rowToProcedural(data);
  }

  /**
   * Get all procedures sorted by confidence
   */
  async getAllProcedures(limit = 20): Promise<ProceduralMemory[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('type', 'procedural')
      .order('success_rate', { ascending: false })
      .order('usage_count', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get procedures: ${error.message}`);
    }

    return data.map(row => this.rowToProcedural(row));
  }

  /**
   * Get procedures by success rate
   */
  async getTopProcedures(
    minSuccessRate = 0.7,
    minUsageCount = 3,
    limit = 10
  ): Promise<ProceduralMemory[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('type', 'procedural')
      .gte('success_rate', minSuccessRate)
      .gte('usage_count', minUsageCount)
      .order('success_rate', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get top procedures: ${error.message}`);
    }

    return data.map(row => this.rowToProcedural(row));
  }

  /**
   * Improve procedure by adding steps or refining existing ones
   */
  async improveProcedure(
    procedureId: string,
    improvements: {
      addSteps?: string[];
      replaceStep?: { index: number; newStep: string };
      removeStepIndex?: number;
    }
  ): Promise<ProceduralMemory> {
    const procedure = await this.store.get(procedureId) as ProceduralMemory | null;

    if (!procedure) {
      throw new Error(`Procedure not found: ${procedureId}`);
    }

    // Apply improvements
    const steps = [...procedure.steps];

    if (improvements.addSteps) {
      steps.push(...improvements.addSteps);
    }

    if (improvements.replaceStep) {
      const { index, newStep } = improvements.replaceStep;
      if (index >= 0 && index < steps.length) {
        steps[index] = newStep;
      }
    }

    if (improvements.removeStepIndex !== undefined) {
      if (improvements.removeStepIndex >= 0 && improvements.removeStepIndex < steps.length) {
        steps.splice(improvements.removeStepIndex, 1);
      }
    }

    return await this.updateProcedure(procedureId, steps);
  }

  /**
   * Merge similar procedures
   */
  async mergeProcedures(
    procedureId1: string,
    procedureId2: string
  ): Promise<ProceduralMemory> {
    const proc1 = await this.store.get(procedureId1) as ProceduralMemory | null;
    const proc2 = await this.store.get(procedureId2) as ProceduralMemory | null;

    if (!proc1 || !proc2) {
      throw new Error('One or both procedures not found');
    }

    // Merge steps (remove duplicates)
    const mergedSteps = [...proc1.steps];
    for (const step of proc2.steps) {
      if (!mergedSteps.includes(step)) {
        mergedSteps.push(step);
      }
    }

    // Merge trigger patterns
    const mergedPatterns = [...new Set([...proc1.triggerPatterns, ...proc2.triggerPatterns])];

    // Calculate merged statistics
    const totalUsage = proc1.usageCount + proc2.usageCount;
    const mergedSuccessRate =
      (proc1.successRate * proc1.usageCount + proc2.successRate * proc2.usageCount) /
      (totalUsage || 1);

    // Update first procedure with merged data
    proc1.steps = mergedSteps;
    proc1.triggerPatterns = mergedPatterns;
    proc1.successRate = mergedSuccessRate;
    proc1.usageCount = totalUsage;
    proc1.importance = Math.max(proc1.importance, proc2.importance);
    proc1.content = `Skill: ${proc1.skill}\nSteps:\n${mergedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    // Save merged procedure and delete second one
    await this.store.save(proc1);
    await this.store.delete(procedureId2);

    return proc1;
  }

  /**
   * Get procedure statistics
   */
  async getProcedureStats(procedureId: string): Promise<{
    skill: string;
    usageCount: number;
    successRate: number;
    avgImprovement: number;
    lastUsed: number;
  }> {
    const procedure = await this.store.get(procedureId) as ProceduralMemory | null;

    if (!procedure) {
      throw new Error(`Procedure not found: ${procedureId}`);
    }

    // Calculate improvement trend (comparing current success rate to initial)
    const avgImprovement = procedure.successRate - 0.5; // Assuming 0.5 initial baseline

    return {
      skill: procedure.skill,
      usageCount: procedure.usageCount,
      successRate: procedure.successRate,
      avgImprovement,
      lastUsed: procedure.metadata.lastUsed as number || procedure.createdAt,
    };
  }

  /**
   * Delete underperforming procedures
   */
  async pruneUnderperforming(
    minUsageCount = 5,
    maxSuccessRate = 0.3
  ): Promise<number> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_entries')
      .select('id')
      .eq('type', 'procedural')
      .gte('usage_count', minUsageCount)
      .lte('success_rate', maxSuccessRate);

    if (error) {
      throw new Error(`Failed to find underperforming procedures: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return 0;
    }

    const ids = data.map(row => row.id);
    return await this.store.deleteBatch(ids);
  }

  /**
   * Generate trigger patterns from skill and steps
   */
  private generateTriggerPatterns(skill: string, steps: string[]): string[] {
    const patterns: string[] = [];

    // Add skill name as pattern
    patterns.push(skill.toLowerCase());

    // Extract key action verbs from steps
    const actionVerbs = ['create', 'update', 'delete', 'configure', 'add', 'remove', 'set', 'get'];

    for (const step of steps) {
      const lower = step.toLowerCase();
      for (const verb of actionVerbs) {
        if (lower.includes(verb)) {
          patterns.push(verb);
        }
      }

      // Extract noun phrases (simple heuristic)
      const words = step.split(' ');
      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`.toLowerCase();
        if (!actionVerbs.includes(words[i].toLowerCase())) {
          patterns.push(bigram);
        }
      }
    }

    return [...new Set(patterns)]; // Remove duplicates
  }

  /**
   * Match pattern against trigger patterns
   */
  private matchTriggerPatterns(pattern: string, triggerPatterns: string[]): boolean {
    return triggerPatterns.some(trigger => pattern.includes(trigger));
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    successRate: number,
    usageCount: number,
    matchScore: number
  ): number {
    // Confidence increases with usage count (up to a point)
    const usageConfidence = Math.min(usageCount / 10, 1);

    // Combine factors
    return (
      successRate * 0.5 +
      matchScore * 0.3 +
      usageConfidence * 0.2
    );
  }

  /**
   * Convert database row to procedural memory
   */
  private rowToProcedural(row: Record<string, unknown>): ProceduralMemory {
    return {
      id: row.id as string,
      type: 'procedural',
      content: row.content as string,
      embedding: row.embedding as number[] | undefined,
      metadata: (row.metadata as Record<string, unknown>) || {},
      importance: row.importance as number,
      accessCount: row.access_count as number,
      lastAccessed: new Date(row.last_accessed as string).getTime(),
      createdAt: new Date(row.created_at as string).getTime(),
      expiresAt: row.expires_at ? new Date(row.expires_at as string).getTime() : undefined,
      skill: row.skill as string,
      steps: row.steps as string[],
      triggerPatterns: row.trigger_patterns as string[],
      successRate: row.success_rate as number,
      usageCount: row.usage_count as number,
    };
  }
}
