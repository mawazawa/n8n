// Supabase Edge Function: Batch Embed
// Processes multiple workflows in parallel for initial import or re-embedding

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';

// Import shared config and retry logic from generate-embedding
import {
  EMBEDDING_CONFIG,
  ENV_KEYS,
  EMBEDDING_STATUS,
  ERROR_MESSAGES,
  OPENAI_CONFIG,
  validateEnvironment,
  getEmbeddingVersion,
} from '../generate-embedding/config.ts';
import { fetchWithRetry, sleep, processBatchWithRetry } from '../generate-embedding/retry.ts';

interface BatchRequest {
  status_filter?: 'pending' | 'failed';
  limit?: number;
  force?: boolean;
}

interface WorkflowRecord {
  id: string;
  name: string;
  description?: string;
  techniques?: string[];
  workflow_json: Record<string, unknown>;
}

// Generate embedding using OpenAI API with retry
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get(ENV_KEYS.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error(ERROR_MESSAGES.MISSING_API_KEY);
  }

  const response = await fetchWithRetry(
    OPENAI_CONFIG.endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...OPENAI_CONFIG.headers,
      },
      body: JSON.stringify({
        model: EMBEDDING_CONFIG.model,
        input: text,
        dimensions: EMBEDDING_CONFIG.dimensions,
      }),
    },
    {
      maxRetries: EMBEDDING_CONFIG.maxRetries,
      baseDelay: EMBEDDING_CONFIG.retryDelayMs,
    }
  );

  const data = await response.json();
  return data.data[0].embedding;
}

// Generate batch embeddings (more efficient) with retry
async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get(ENV_KEYS.OPENAI_API_KEY);
  if (!apiKey) {
    throw new Error(ERROR_MESSAGES.MISSING_API_KEY);
  }

  const response = await fetchWithRetry(
    OPENAI_CONFIG.endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...OPENAI_CONFIG.headers,
      },
      body: JSON.stringify({
        model: EMBEDDING_CONFIG.model,
        input: texts,
        dimensions: EMBEDDING_CONFIG.dimensions,
      }),
    },
    {
      maxRetries: EMBEDDING_CONFIG.maxRetries,
      baseDelay: EMBEDDING_CONFIG.retryDelayMs,
    }
  );

  const data = await response.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

// Generate semantic content from workflow
function generateSemanticContent(record: WorkflowRecord): string {
  const workflow = record.workflow_json;
  const nodes = (workflow.nodes as Array<{ type: string; name: string }>) || [];

  const parts: string[] = [
    `Workflow: ${record.name}`,
    record.description ? `Description: ${record.description}` : '',
    `Techniques: ${(record.techniques || []).join(', ')}`,
    `Nodes: ${nodes.map((n) => n.type).join(', ')}`,
    `Node count: ${nodes.length}`,
  ];

  for (const node of nodes.slice(0, 10)) {
    parts.push(`Node ${node.name}: ${node.type}`);
  }

  return parts.filter(Boolean).join('\n');
}

serve(async (req) => {
  try {
    // CORS handling
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });
    }

    // Validate environment
    const envValidation = validateEnvironment();
    if (!envValidation.valid) {
      throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get(ENV_KEYS.SUPABASE_URL)!;
    const supabaseKey = Deno.env.get(ENV_KEYS.SUPABASE_SERVICE_ROLE_KEY)!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = (await req.json()) as BatchRequest;

    const statusFilter = body.status_filter || 'pending';
    const limit = body.limit || 100;
    const embeddingVersion = getEmbeddingVersion();

    // Fetch workflows to process
    let query = supabase
      .from('workflow_examples')
      .select('id, name, description, techniques, workflow_json')
      .limit(limit);

    if (!body.force) {
      query = query.eq('embedding_status', statusFilter);
    }

    const { data: workflows, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch workflows: ${error.message}`);
    }

    if (!workflows || workflows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          message: 'No workflows to process',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process in batches
    for (let i = 0; i < workflows.length; i += EMBEDDING_CONFIG.batchSize) {
      const batch = workflows.slice(i, i + EMBEDDING_CONFIG.batchSize);

      // Mark all as processing using new function
      for (const workflow of batch) {
        await supabase.rpc('update_embedding_status', {
          p_workflow_id: workflow.id,
          p_status: EMBEDDING_STATUS.PROCESSING,
          p_model: EMBEDDING_CONFIG.model,
          p_version: embeddingVersion,
        });
      }

      try {
        // Generate semantic content for all
        const texts = batch.map((w) => generateSemanticContent(w));

        // Generate embeddings in batch with retry
        const embeddings = await generateBatchEmbeddings(texts);

        // Update each workflow
        for (let j = 0; j < batch.length; j++) {
          const workflow = batch[j];
          const embedding = embeddings[j];

          try {
            // Update with new function
            await supabase.rpc('update_embedding_status', {
              p_workflow_id: workflow.id,
              p_status: EMBEDDING_STATUS.COMPLETED,
              p_model: EMBEDDING_CONFIG.model,
              p_version: embeddingVersion,
            });

            // Update the actual embedding vector
            const { error: updateError } = await supabase
              .from('workflow_examples')
              .update({ embedding })
              .eq('id', workflow.id);

            if (updateError) {
              throw updateError;
            }

            results.processed++;
          } catch (error) {
            const err = error as Error;
            results.failed++;
            results.errors.push(`${workflow.id}: ${err.message}`);

            await supabase.rpc('update_embedding_status', {
              p_workflow_id: workflow.id,
              p_status: EMBEDDING_STATUS.FAILED,
              p_error: err.message,
              p_error_code: err.name || 'BATCH_UPDATE_ERROR',
            });
          }
        }
      } catch (batchError) {
        const batchErr = batchError as Error;
        console.error('Batch embedding failed, falling back to individual processing:', batchErr.message);

        // If batch fails, try individually with retry
        for (const workflow of batch) {
          try {
            const text = generateSemanticContent(workflow);
            const embedding = await generateEmbedding(text);

            await supabase.rpc('update_embedding_status', {
              p_workflow_id: workflow.id,
              p_status: EMBEDDING_STATUS.COMPLETED,
              p_model: EMBEDDING_CONFIG.model,
              p_version: embeddingVersion,
            });

            await supabase
              .from('workflow_examples')
              .update({ embedding })
              .eq('id', workflow.id);

            results.processed++;
          } catch (error) {
            const err = error as Error;
            results.failed++;
            results.errors.push(`${workflow.id}: ${err.message}`);

            await supabase.rpc('update_embedding_status', {
              p_workflow_id: workflow.id,
              p_status: EMBEDDING_STATUS.FAILED,
              p_error: err.message,
              p_error_code: err.name || 'INDIVIDUAL_ERROR',
            });
          }

          // Rate limit
          await sleep(EMBEDDING_CONFIG.rateLimitDelay);
        }
      }

      // Rate limit between batches
      await sleep(EMBEDDING_CONFIG.rateLimitDelay * 2);
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.processed,
        failed: results.failed,
        errors: results.errors.slice(0, 10), // Only return first 10 errors
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
