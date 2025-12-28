// Supabase Edge Function: Batch Embed
// Processes multiple workflows in parallel for initial import or re-embedding

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 10; // Process 10 workflows at a time
const RATE_LIMIT_DELAY_MS = 100; // Delay between API calls

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

// Generate embedding using OpenAI API
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Generate batch embeddings (more efficient)
async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = (await req.json()) as BatchRequest;

    const statusFilter = body.status_filter || 'pending';
    const limit = body.limit || 100;

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
    for (let i = 0; i < workflows.length; i += BATCH_SIZE) {
      const batch = workflows.slice(i, i + BATCH_SIZE);

      // Mark all as processing
      await supabase
        .from('workflow_examples')
        .update({ embedding_status: 'processing' })
        .in(
          'id',
          batch.map((w) => w.id),
        );

      try {
        // Generate semantic content for all
        const texts = batch.map((w) => generateSemanticContent(w));

        // Generate embeddings in batch
        const embeddings = await generateBatchEmbeddings(texts);

        // Update each workflow
        for (let j = 0; j < batch.length; j++) {
          const workflow = batch[j];
          const embedding = embeddings[j];

          const { error: updateError } = await supabase
            .from('workflow_examples')
            .update({
              embedding,
              embedding_status: 'completed',
              embedding_model: EMBEDDING_MODEL,
            })
            .eq('id', workflow.id);

          if (updateError) {
            results.failed++;
            results.errors.push(`${workflow.id}: ${updateError.message}`);

            await supabase
              .from('workflow_examples')
              .update({ embedding_status: 'failed' })
              .eq('id', workflow.id);
          } else {
            results.processed++;
          }
        }
      } catch (batchError) {
        // If batch fails, try individually
        for (const workflow of batch) {
          try {
            const text = generateSemanticContent(workflow);
            const embedding = await generateEmbedding(text);

            await supabase
              .from('workflow_examples')
              .update({
                embedding,
                embedding_status: 'completed',
                embedding_model: EMBEDDING_MODEL,
              })
              .eq('id', workflow.id);

            results.processed++;
          } catch (error) {
            results.failed++;
            results.errors.push(`${workflow.id}: ${error.message}`);

            await supabase
              .from('workflow_examples')
              .update({ embedding_status: 'failed' })
              .eq('id', workflow.id);
          }

          // Rate limit
          await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }
      }

      // Rate limit between batches
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS * 2));
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
