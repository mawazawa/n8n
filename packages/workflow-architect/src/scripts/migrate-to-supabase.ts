#!/usr/bin/env tsx
/**
 * Migration script: Local RAG store to Supabase
 *
 * This script migrates existing workflow examples from the local
 * file-based store to Supabase with proper embeddings.
 *
 * Usage: pnpm run migrate-supabase
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { SupabaseVectorStore } from '../rag/supabase-store';
import { initializeSupabase } from '../supabase/client';
import type { WorkflowDefinition } from '../types/workflow';
import type { WorkflowCategory } from '../supabase/types';

// Load environment variables
config();

interface LocalWorkflowEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  techniques: string[];
  workflow: WorkflowDefinition;
}

// OpenAI embedding function
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for embedding generation');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function loadLocalWorkflows(): Promise<LocalWorkflowEntry[]> {
  const workflowDirs = [
    path.join(process.cwd(), 'workflows'),
    path.join(process.cwd(), 'workflow-templates'),
  ];

  const workflows: LocalWorkflowEntry[] = [];

  for (const dir of workflowDirs) {
    if (!fs.existsSync(dir)) {
      console.log(`Directory not found: ${dir}`);
      continue;
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const workflow = JSON.parse(content) as WorkflowDefinition;

        // Infer metadata from workflow
        const name = workflow.name || file.replace('.json', '');
        const description = inferDescription(workflow);
        const category = inferCategory(workflow);
        const techniques = extractTechniques(workflow);

        workflows.push({
          id: file.replace('.json', ''),
          name,
          description,
          category,
          techniques,
          workflow,
        });
      } catch (error) {
        console.error(`Failed to load ${file}:`, error);
      }
    }
  }

  return workflows;
}

function inferDescription(workflow: WorkflowDefinition): string {
  const nodeTypes = (workflow.nodes || []).map((n) => n.type);
  const triggers = nodeTypes.filter((t) => t.includes('Trigger') || t.includes('Webhook'));

  const parts: string[] = [];

  if (triggers.length > 0) {
    parts.push(`Triggered by ${triggers.join(' or ')}`);
  }

  const aiNodes = nodeTypes.filter(
    (t) => t.includes('Agent') || t.includes('OpenAI') || t.includes('Anthropic'),
  );
  if (aiNodes.length > 0) {
    parts.push(`Uses AI: ${aiNodes.join(', ')}`);
  }

  parts.push(`${workflow.nodes?.length || 0} nodes total`);

  return parts.join('. ');
}

function inferCategory(workflow: WorkflowDefinition): WorkflowCategory {
  const nodeTypes = (workflow.nodes || []).map((n) => n.type.toLowerCase());
  const nodeTypesStr = nodeTypes.join(' ');

  if (nodeTypesStr.includes('agent')) return 'ai-agent';
  if (nodeTypesStr.includes('vector') || nodeTypesStr.includes('embedding')) return 'rag-pipeline';
  if (nodeTypesStr.includes('database') || nodeTypesStr.includes('postgres'))
    return 'data-pipeline';
  if (nodeTypesStr.includes('slack') || nodeTypesStr.includes('email') || nodeTypesStr.includes('discord'))
    return 'integration';
  if (nodeTypesStr.includes('error') || nodeTypesStr.includes('catch')) return 'error-handling';
  if (nodeTypesStr.includes('wait') || nodeTypesStr.includes('approval')) return 'approval-flow';
  if (nodeTypesStr.includes('batch') || nodeTypesStr.includes('loop')) return 'batch-processing';

  return 'automation';
}

function extractTechniques(workflow: WorkflowDefinition): string[] {
  const techniques: Set<string> = new Set();
  const nodeTypes = (workflow.nodes || []).map((n) => n.type);

  // Detect patterns
  if (nodeTypes.some((t) => t.includes('Agent'))) techniques.add('ai-agent');
  if (nodeTypes.some((t) => t.includes('Vector'))) techniques.add('vector-search');
  if (nodeTypes.some((t) => t.includes('Embedding'))) techniques.add('embeddings');
  if (nodeTypes.some((t) => t.includes('Tool'))) techniques.add('tool-use');
  if (nodeTypes.some((t) => t.includes('Memory'))) techniques.add('memory');
  if (nodeTypes.some((t) => t.includes('Webhook'))) techniques.add('webhook');
  if (nodeTypes.some((t) => t.includes('Schedule'))) techniques.add('scheduled');
  if (nodeTypes.some((t) => t.includes('HTTP'))) techniques.add('api-integration');
  if (nodeTypes.some((t) => t.includes('Postgres') || t.includes('MySQL'))) techniques.add('database');
  if (nodeTypes.some((t) => t.includes('Split'))) techniques.add('branching');
  if (nodeTypes.some((t) => t.includes('Merge'))) techniques.add('merge');
  if (nodeTypes.some((t) => t.includes('Loop'))) techniques.add('iteration');
  if (nodeTypes.some((t) => t.includes('Error'))) techniques.add('error-handling');

  return Array.from(techniques);
}

async function main() {
  console.log('Starting migration to Supabase...\n');

  // Validate environment
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  // Initialize Supabase
  initializeSupabase({
    url: supabaseUrl,
    anonKey: process.env.SUPABASE_ANON_KEY || supabaseKey,
    serviceRoleKey: supabaseKey,
  });

  // Create vector store
  const store = new SupabaseVectorStore({}, generateEmbedding);

  // Load local workflows
  console.log('Loading local workflows...');
  const workflows = await loadLocalWorkflows();
  console.log(`Found ${workflows.length} workflows to migrate\n`);

  // Migrate each workflow
  let successCount = 0;
  let errorCount = 0;

  for (const entry of workflows) {
    try {
      process.stdout.write(`Migrating: ${entry.name}... `);

      const id = await store.addWorkflow(entry.workflow, {
        name: entry.name,
        description: entry.description,
        category: entry.category as WorkflowCategory,
        techniques: entry.techniques,
        isPublic: true,
      });

      console.log(`✓ (${id})`);
      successCount++;

      // Rate limit to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`✗ (${error instanceof Error ? error.message : 'Unknown error'})`);
      errorCount++;
    }
  }

  // Print summary
  console.log('\n--- Migration Complete ---');
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${errorCount}`);

  // Get stats
  const stats = await store.getStats();
  console.log(`\nStore Statistics:`);
  console.log(`  Total Workflows: ${stats.totalWorkflows}`);
  console.log(`  Total Node Chunks: ${stats.totalNodeChunks}`);
  console.log(`  Pending Embeddings: ${stats.pendingEmbeddings}`);
  console.log(`  Failed Embeddings: ${stats.failedEmbeddings}`);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
