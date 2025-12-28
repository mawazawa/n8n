// Supabase Edge Function: Generate Embedding
// Automatically generates embeddings for workflow examples
// Triggered via database webhook or direct invocation

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.0';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface EmbeddingRequest {
  workflow_id: string;
  force?: boolean;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: {
    id: string;
    name: string;
    description?: string;
    techniques?: string[];
    workflow_json: Record<string, unknown>;
    embedding_status: string;
  };
  old_record?: Record<string, unknown>;
}

// Generate embedding using OpenAI API
async function generateEmbedding(text: string, retryCount = 0): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, retryCount)));
      return generateEmbedding(text, retryCount + 1);
    }
    throw error;
  }
}

// Generate semantic content from workflow
function generateSemanticContent(record: WebhookPayload['record']): string {
  const workflow = record.workflow_json;
  const nodes = (workflow.nodes as Array<{ type: string; name: string; parameters?: Record<string, unknown> }>) || [];

  const parts: string[] = [
    `Workflow: ${record.name}`,
    record.description ? `Description: ${record.description}` : '',
    `Techniques: ${(record.techniques || []).join(', ')}`,
    `Nodes: ${nodes.map((n) => n.type).join(', ')}`,
    `Node count: ${nodes.length}`,
  ];

  // Add node details
  for (const node of nodes.slice(0, 10)) {
    parts.push(`Node ${node.name}: ${node.type}`);
    if (node.parameters) {
      const paramKeys = Object.keys(node.parameters).slice(0, 3);
      if (paramKeys.length > 0) {
        parts.push(`  Parameters: ${paramKeys.join(', ')}`);
      }
    }
  }

  return parts.filter(Boolean).join('\n');
}

// Process a single workflow
async function processWorkflow(
  supabase: ReturnType<typeof createClient>,
  workflowId: string,
  record: WebhookPayload['record'],
): Promise<void> {
  try {
    // Update status to processing
    await supabase
      .from('workflow_examples')
      .update({ embedding_status: 'processing' })
      .eq('id', workflowId);

    // Generate semantic content
    const semanticContent = generateSemanticContent(record);

    // Generate embedding
    const embedding = await generateEmbedding(semanticContent);

    // Update workflow with embedding
    const { error } = await supabase
      .from('workflow_examples')
      .update({
        embedding,
        embedding_status: 'completed',
        embedding_model: EMBEDDING_MODEL,
      })
      .eq('id', workflowId);

    if (error) {
      throw new Error(`Failed to update workflow: ${error.message}`);
    }

    // Also generate node-level embeddings
    await generateNodeEmbeddings(supabase, workflowId, record.workflow_json);
  } catch (error) {
    // Update status to failed
    await supabase
      .from('workflow_examples')
      .update({ embedding_status: 'failed' })
      .eq('id', workflowId);

    throw error;
  }
}

// Generate embeddings for individual nodes
async function generateNodeEmbeddings(
  supabase: ReturnType<typeof createClient>,
  workflowId: string,
  workflowJson: Record<string, unknown>,
): Promise<void> {
  const nodes = (workflowJson.nodes as Array<{
    id?: string;
    name: string;
    type: string;
    parameters?: Record<string, unknown>;
  }>) || [];

  const connections = (workflowJson.connections as Record<string, Record<string, Array<Array<{ node: string }>>>>) || {};

  // Build connection map
  const connectedTo = new Map<string, string[]>();
  const connectedFrom = new Map<string, string[]>();

  for (const [sourceNode, targets] of Object.entries(connections)) {
    for (const connectionType of Object.values(targets)) {
      for (const connectionList of connectionType) {
        for (const target of connectionList) {
          const targetNode = target.node;
          if (!connectedTo.has(sourceNode)) connectedTo.set(sourceNode, []);
          connectedTo.get(sourceNode)!.push(targetNode);
          if (!connectedFrom.has(targetNode)) connectedFrom.set(targetNode, []);
          connectedFrom.get(targetNode)!.push(sourceNode);
        }
      }
    }
  }

  // Delete existing node chunks
  await supabase.from('workflow_node_chunks').delete().eq('workflow_id', workflowId);

  // Generate embeddings for each node
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nodeName = node.name || node.type;
    const nodeId = node.id || `node_${i}`;

    const semanticContent = [
      `Node: ${nodeName}`,
      `Type: ${node.type}`,
      connectedFrom.get(nodeName)?.length
        ? `Receives from: ${connectedFrom.get(nodeName)!.join(', ')}`
        : '',
      connectedTo.get(nodeName)?.length
        ? `Sends to: ${connectedTo.get(nodeName)!.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const embedding = await generateEmbedding(semanticContent);

      const isTrigger =
        node.type.includes('Trigger') ||
        node.type.includes('Webhook') ||
        node.type.includes('Schedule');
      const isAiNode =
        node.type.includes('Agent') ||
        node.type.includes('LangChain') ||
        node.type.includes('OpenAI');

      await supabase.from('workflow_node_chunks').insert({
        workflow_id: workflowId,
        node_id: nodeId,
        node_name: nodeName,
        node_type: node.type,
        node_index: i,
        semantic_content: semanticContent,
        embedding,
        embedding_status: 'completed',
        connected_to: connectedTo.get(nodeName) || [],
        connected_from: connectedFrom.get(nodeName) || [],
        is_trigger: isTrigger,
        is_ai_node: isAiNode,
      });
    } catch (error) {
      console.error(`Failed to embed node ${nodeName}:`, error);
    }
  }
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

    const body = await req.json();

    // Handle webhook payload (from database trigger)
    if (body.type && body.table === 'workflow_examples') {
      const payload = body as WebhookPayload;

      // Only process if embedding is pending
      if (payload.record.embedding_status !== 'pending') {
        return new Response(JSON.stringify({ skipped: true, reason: 'not pending' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await processWorkflow(supabase, payload.record.id, payload.record);

      return new Response(JSON.stringify({ success: true, workflow_id: payload.record.id }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle direct invocation
    const request = body as EmbeddingRequest;

    // Fetch the workflow
    const { data: workflow, error } = await supabase
      .from('workflow_examples')
      .select('*')
      .eq('id', request.workflow_id)
      .single();

    if (error || !workflow) {
      throw new Error(`Workflow not found: ${request.workflow_id}`);
    }

    // Skip if already processed (unless force)
    if (workflow.embedding_status === 'completed' && !request.force) {
      return new Response(JSON.stringify({ skipped: true, reason: 'already completed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await processWorkflow(supabase, request.workflow_id, workflow);

    return new Response(JSON.stringify({ success: true, workflow_id: request.workflow_id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
