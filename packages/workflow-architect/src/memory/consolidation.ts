/**
 * Memory Consolidator
 * Summarizes and consolidates old memories to optimize storage
 */

import { getSupabaseClient } from '../supabase/client.js';
import { MemoryStore } from './store.js';
import type {
  MemoryEntry,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  ConsolidationConfig,
} from './types.js';

const DEFAULT_CONFIG: ConsolidationConfig = {
  importanceDecayFactor: 0.9, // 10% decay per consolidation
  similarityThreshold: 0.85,
  minImportanceThreshold: 0.2,
  maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
};

/**
 * Consolidates and optimizes memory storage
 */
export class MemoryConsolidator {
  private store: MemoryStore;
  private config: ConsolidationConfig;

  constructor(store: MemoryStore, config: Partial<ConsolidationConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run full consolidation process
   */
  async consolidate(): Promise<{
    memoriesProcessed: number;
    memoriesMerged: number;
    memoriesDeleted: number;
    storageReduced: number;
  }> {
    const stats = {
      memoriesProcessed: 0,
      memoriesMerged: 0,
      memoriesDeleted: 0,
      storageReduced: 0,
    };

    // 1. Apply importance decay
    await this.applyImportanceDecay();

    // 2. Delete expired memories
    const deleted = await this.deleteExpiredMemories();
    stats.memoriesDeleted += deleted;

    // 3. Merge similar memories
    const merged = await this.mergeSimilarMemories();
    stats.memoriesMerged += merged.count;
    stats.storageReduced += merged.storageReduced;

    // 4. Delete low-importance memories
    const lowImpDeleted = await this.deleteLowImportanceMemories();
    stats.memoriesDeleted += lowImpDeleted;

    // 5. Consolidate old episodic memories
    const episodicStats = await this.consolidateEpisodicMemories();
    stats.memoriesProcessed += episodicStats.processed;
    stats.memoriesMerged += episodicStats.merged;

    return stats;
  }

  /**
   * Apply importance decay to old memories
   */
  async applyImportanceDecay(): Promise<number> {
    const supabase = getSupabaseClient();

    const ageThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days

    const { data, error } = await supabase
      .from('memory_entries')
      .select('id, importance, created_at')
      .lt('created_at', ageThreshold);

    if (error || !data) {
      return 0;
    }

    let updated = 0;

    for (const row of data) {
      const ageInDays = (Date.now() - new Date(row.created_at).getTime()) / (24 * 60 * 60 * 1000);
      const decayFactor = Math.pow(this.config.importanceDecayFactor, ageInDays / 30);
      const newImportance = row.importance * decayFactor;

      if (newImportance !== row.importance) {
        await supabase
          .from('memory_entries')
          .update({ importance: newImportance })
          .eq('id', row.id);
        updated++;
      }
    }

    return updated;
  }

  /**
   * Delete expired memories
   */
  async deleteExpiredMemories(): Promise<number> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('cleanup_expired_memories');

    if (error) {
      throw new Error(`Failed to delete expired memories: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete memories below importance threshold
   */
  async deleteLowImportanceMemories(): Promise<number> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('memory_entries')
      .select('id')
      .lt('importance', this.config.minImportanceThreshold);

    if (error || !data) {
      return 0;
    }

    if (data.length === 0) {
      return 0;
    }

    const ids = data.map(row => row.id);
    return await this.store.deleteBatch(ids);
  }

  /**
   * Merge similar memories to reduce duplication
   */
  async mergeSimilarMemories(): Promise<{ count: number; storageReduced: number }> {
    const supabase = getSupabaseClient();

    // Get all memories (we'll process in batches)
    const { data: allMemories, error } = await supabase
      .from('memory_entries')
      .select('id, type, embedding')
      .not('embedding', 'is', null);

    if (error || !allMemories) {
      return { count: 0, storageReduced: 0 };
    }

    let mergedCount = 0;
    let storageReduced = 0;
    const processed = new Set<string>();

    for (const memory of allMemories) {
      if (processed.has(memory.id)) {
        continue;
      }

      // Find similar memories
      const { data: similar, error: similarError } = await supabase.rpc(
        'find_similar_memories',
        {
          memory_id: memory.id,
          similarity_threshold: this.config.similarityThreshold,
          same_type_only: true,
        }
      );

      if (similarError || !similar || similar.length === 0) {
        continue;
      }

      // Merge similar memories
      for (const sim of similar) {
        if (processed.has(sim.id)) {
          continue;
        }

        // Merge based on memory type
        const merged = await this.mergeMemoryPair(memory.id, sim.id, memory.type);
        if (merged) {
          processed.add(sim.id);
          mergedCount++;
          storageReduced += this.estimateMemorySize(sim);
        }
      }

      processed.add(memory.id);
    }

    return { count: mergedCount, storageReduced };
  }

  /**
   * Merge two memory entries
   */
  private async mergeMemoryPair(
    id1: string,
    id2: string,
    type: string
  ): Promise<boolean> {
    const mem1 = await this.store.get(id1);
    const mem2 = await this.store.get(id2);

    if (!mem1 || !mem2) {
      return false;
    }

    // Type-specific merging
    if (type === 'episodic') {
      return await this.mergeEpisodicPair(mem1 as EpisodicMemory, mem2 as EpisodicMemory);
    } else if (type === 'semantic') {
      return await this.mergeSemanticPair(mem1 as SemanticMemory, mem2 as SemanticMemory);
    } else if (type === 'procedural') {
      return await this.mergeProceduralPair(
        mem1 as ProceduralMemory,
        mem2 as ProceduralMemory
      );
    }

    return false;
  }

  /**
   * Merge two episodic memories
   */
  private async mergeEpisodicPair(
    ep1: EpisodicMemory,
    ep2: EpisodicMemory
  ): Promise<boolean> {
    // Only merge if from same session
    if (ep1.sessionId !== ep2.sessionId) {
      return false;
    }

    // Combine content
    ep1.content = `${ep1.content}\n---\n${ep2.content}`;
    ep1.importance = Math.max(ep1.importance, ep2.importance);
    ep1.accessCount += ep2.accessCount;

    // Store merged metadata
    ep1.metadata.mergedFrom = ep1.metadata.mergedFrom || [];
    (ep1.metadata.mergedFrom as string[]).push(ep2.id);

    await this.store.save(ep1);
    await this.store.delete(ep2.id);

    return true;
  }

  /**
   * Merge two semantic memories
   */
  private async mergeSemanticPair(
    sem1: SemanticMemory,
    sem2: SemanticMemory
  ): Promise<boolean> {
    // Only merge if same category
    if (sem1.category !== sem2.category) {
      return false;
    }

    // Merge facts (remove duplicates)
    const allFacts = [...sem1.facts, ...sem2.facts];
    sem1.facts = [...new Set(allFacts)];

    // Merge relations (remove duplicates)
    const existingRelations = new Set(
      sem1.relations.map(r => `${r.subject}|${r.predicate}|${r.object}`)
    );
    for (const rel of sem2.relations) {
      const key = `${rel.subject}|${rel.predicate}|${rel.object}`;
      if (!existingRelations.has(key)) {
        sem1.relations.push(rel);
      }
    }

    // Update content
    sem1.content = sem1.facts.join('; ');
    sem1.importance = Math.max(sem1.importance, sem2.importance);

    await this.store.save(sem1);
    await this.store.delete(sem2.id);

    return true;
  }

  /**
   * Merge two procedural memories
   */
  private async mergeProceduralPair(
    proc1: ProceduralMemory,
    proc2: ProceduralMemory
  ): Promise<boolean> {
    // Only merge if same skill
    if (proc1.skill !== proc2.skill) {
      return false;
    }

    // Merge steps (keep unique)
    const allSteps = [...proc1.steps, ...proc2.steps];
    proc1.steps = [...new Set(allSteps)];

    // Merge trigger patterns
    proc1.triggerPatterns = [...new Set([...proc1.triggerPatterns, ...proc2.triggerPatterns])];

    // Combine statistics
    const totalUsage = proc1.usageCount + proc2.usageCount;
    proc1.successRate =
      (proc1.successRate * proc1.usageCount + proc2.successRate * proc2.usageCount) /
      (totalUsage || 1);
    proc1.usageCount = totalUsage;

    proc1.importance = Math.max(proc1.importance, proc2.importance);
    proc1.content = `Skill: ${proc1.skill}\nSteps:\n${proc1.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    await this.store.save(proc1);
    await this.store.delete(proc2.id);

    return true;
  }

  /**
   * Consolidate episodic memories by session
   */
  async consolidateEpisodicMemories(): Promise<{ processed: number; merged: number }> {
    const supabase = getSupabaseClient();

    // Get sessions older than threshold
    const ageThreshold = Date.now() - this.config.maxAge;

    const { data: sessions, error } = await supabase
      .from('memory_sessions')
      .select('id')
      .lt('started_at', ageThreshold)
      .is('summary', null);

    if (error || !sessions) {
      return { processed: 0, merged: 0 };
    }

    let processed = 0;
    let merged = 0;

    for (const session of sessions) {
      const result = await this.consolidateSession(session.id);
      processed += result.episodeCount;
      merged += result.merged;
    }

    return { processed, merged };
  }

  /**
   * Consolidate a single session
   */
  async consolidateSession(sessionId: string): Promise<{
    episodeCount: number;
    merged: number;
  }> {
    const supabase = getSupabaseClient();

    // Get all episodes in session
    const { data: episodes, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', 'episodic')
      .order('conversation_turn', { ascending: true });

    if (error || !episodes || episodes.length === 0) {
      return { episodeCount: 0, merged: 0 };
    }

    // Group episodes by importance
    const highImportance = episodes.filter(ep => ep.importance >= 0.7);
    const mediumImportance = episodes.filter(
      ep => ep.importance >= 0.4 && ep.importance < 0.7
    );
    const lowImportance = episodes.filter(ep => ep.importance < 0.4);

    let merged = 0;

    // Keep high importance episodes
    // Summarize medium importance episodes (merge every 3)
    for (let i = 0; i < mediumImportance.length; i += 3) {
      if (i + 2 < mediumImportance.length) {
        await this.mergeEpisodeGroup([
          mediumImportance[i].id,
          mediumImportance[i + 1].id,
          mediumImportance[i + 2].id,
        ]);
        merged += 2;
      }
    }

    // Delete low importance episodes
    const lowImportanceIds = lowImportance.map(ep => ep.id);
    if (lowImportanceIds.length > 0) {
      await this.store.deleteBatch(lowImportanceIds);
    }

    return { episodeCount: episodes.length, merged };
  }

  /**
   * Merge multiple episodes into summary
   */
  private async mergeEpisodeGroup(episodeIds: string[]): Promise<void> {
    const episodes = await Promise.all(
      episodeIds.map(id => this.store.get(id) as Promise<EpisodicMemory>)
    );

    const validEpisodes = episodes.filter(e => e !== null);
    if (validEpisodes.length === 0) {
      return;
    }

    // Create summary episode
    const summaryContent = validEpisodes
      .map(ep => `Turn ${ep.conversationTurn}: ${ep.userMessage} -> ${ep.agentResponse}`)
      .join('\n');

    const first = validEpisodes[0];
    first.content = `Summary of ${validEpisodes.length} episodes:\n${summaryContent}`;
    first.importance = Math.max(...validEpisodes.map(e => e.importance));
    first.metadata.consolidated = true;
    first.metadata.originalCount = validEpisodes.length;

    // Save summary and delete others
    await this.store.save(first);
    for (let i = 1; i < validEpisodes.length; i++) {
      await this.store.delete(validEpisodes[i].id);
    }
  }

  /**
   * Summarize session into single high-level memory
   */
  async summarizeSession(sessionId: string): Promise<string> {
    const supabase = getSupabaseClient();

    // Get session episodes
    const { data: episodes, error } = await supabase
      .from('memory_entries')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', 'episodic')
      .order('conversation_turn', { ascending: true });

    if (error || !episodes || episodes.length === 0) {
      return 'No episodes to summarize';
    }

    // Extract key information
    const topics = new Set<string>();
    const actions: string[] = [];
    const decisions: string[] = [];

    for (const ep of episodes) {
      const userMsg = ep.user_message.toLowerCase();
      const agentMsg = ep.agent_response.toLowerCase();

      // Extract workflow names
      if (ep.workflow_context?.workflowName) {
        topics.add(`workflow: ${ep.workflow_context.workflowName}`);
      }

      // Extract actions
      const actionVerbs = ['created', 'updated', 'configured', 'deleted', 'added', 'removed'];
      for (const verb of actionVerbs) {
        if (agentMsg.includes(verb)) {
          actions.push(`${verb} something`);
        }
      }

      // Extract decisions (questions and answers)
      if (userMsg.includes('?') && agentMsg.includes('yes') || agentMsg.includes('no')) {
        decisions.push('Made decision');
      }
    }

    const summary = [
      `Session summary (${episodes.length} episodes):`,
      topics.size > 0 ? `Topics: ${Array.from(topics).join(', ')}` : '',
      actions.length > 0 ? `Actions: ${actions.slice(0, 5).join(', ')}` : '',
      decisions.length > 0 ? `Decisions: ${decisions.length}` : '',
    ]
      .filter(s => s)
      .join('. ');

    // Update session
    await supabase.from('memory_sessions').update({ summary }).eq('id', sessionId);

    return summary;
  }

  /**
   * Estimate memory size for storage calculation
   */
  private estimateMemorySize(memory: Record<string, unknown>): number {
    // Rough estimate: content length + embedding size
    const contentSize = (memory.content as string)?.length || 0;
    const embeddingSize = (memory.embedding as number[])?.length ? 1536 * 4 : 0; // 4 bytes per float
    return contentSize + embeddingSize;
  }

  /**
   * Get consolidation recommendations
   */
  async getConsolidationRecommendations(): Promise<{
    candidatesForMerging: number;
    lowImportanceCount: number;
    expiredCount: number;
    oldSessionsCount: number;
    estimatedStorageSavings: number;
  }> {
    const supabase = getSupabaseClient();

    // Count low importance memories
    const { count: lowImpCount } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .lt('importance', this.config.minImportanceThreshold);

    // Count expired memories
    const { count: expiredCount } = await supabase
      .from('memory_entries')
      .select('*', { count: 'exact', head: true })
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null);

    // Count old sessions without summary
    const ageThreshold = Date.now() - this.config.maxAge;
    const { count: oldSessionsCount } = await supabase
      .from('memory_sessions')
      .select('*', { count: 'exact', head: true })
      .lt('started_at', ageThreshold)
      .is('summary', null);

    // Estimate storage savings (rough calculation)
    const estimatedStorageSavings =
      (lowImpCount || 0) * 2000 + // Avg 2KB per low importance memory
      (expiredCount || 0) * 2000 + // Avg 2KB per expired memory
      (oldSessionsCount || 0) * 10000; // Avg 10KB per old session

    return {
      candidatesForMerging: 0, // Would need complex query
      lowImportanceCount: lowImpCount || 0,
      expiredCount: expiredCount || 0,
      oldSessionsCount: oldSessionsCount || 0,
      estimatedStorageSavings,
    };
  }
}
