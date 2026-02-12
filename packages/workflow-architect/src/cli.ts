#!/usr/bin/env node
/**
 * Workflow Architect CLI
 * Interactive chat interface for building n8n workflows
 */

import { createInterface } from 'readline';
import { config } from 'dotenv';
import ora from 'ora';

import { streamChat, getRAGStore } from './graph/index.js';
import { createN8nClient } from './n8n/client.js';

// Load environment variables
config();

const WELCOME_MESSAGE = `
╔══════════════════════════════════════════════════════════════════╗
║                     WORKFLOW ARCHITECT                            ║
║            AI-Powered n8n Workflow Builder                        ║
╚══════════════════════════════════════════════════════════════════╝

Describe what you want to automate, and I'll build the workflow for you.

Commands:
  /deploy  - Deploy current workflow to n8n
  /save    - Save workflow to file
  /clear   - Start a new workflow
  /status  - Show current workflow status
  /quit    - Exit

`;

interface Session {
  threadId: string;
  workflow: {
    name: string;
    nodes: unknown[];
    connections: Record<string, unknown>;
  } | null;
}

async function main() {
  console.log(WELCOME_MESSAGE);

  // Initialize RAG store
  const ragSpinner = ora('Loading workflow examples...').start();
  try {
    const ragStore = await getRAGStore();
    const stats = ragStore.getStats();
    ragSpinner.succeed(`Loaded ${stats.total} workflow examples (${stats.techniques.length} techniques)`);
  } catch (error) {
    ragSpinner.warn('Could not load workflow examples (RAG disabled)');
  }

  // Check n8n connection
  const n8nSpinner = ora('Connecting to n8n...').start();
  let n8nClient;
  try {
    n8nClient = createN8nClient();
    const healthy = await n8nClient.healthCheck();
    if (healthy) {
      n8nSpinner.succeed(`Connected to n8n at ${process.env.N8N_BASE_URL}`);
    } else {
      n8nSpinner.warn('n8n connection failed - deploy disabled');
      n8nClient = null;
    }
  } catch (error) {
    n8nSpinner.warn('n8n not configured - deploy disabled');
    n8nClient = null;
  }

  console.log('\n');

  // Create readline interface
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  // Session state
  const session: Session = {
    threadId: `cli-${Date.now()}`,
    workflow: null,
  };

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith('/')) {
      await handleCommand(input, session, n8nClient, rl);
      return;
    }

    // Process chat message
    const spinner = ora('Thinking...').start();

    try {
      let lastResponse = '';

      for await (const event of streamChat({
        message: input,
        threadId: session.threadId,
      })) {
        switch (event.type) {
          case 'thinking':
            spinner.text = event.data as string;
            break;

          case 'phase':
            spinner.text = `Running ${event.data}...`;
            break;

          case 'workflow':
            session.workflow = event.data as Session['workflow'];
            spinner.text = `Updated workflow: ${session.workflow?.nodes?.length || 0} nodes`;
            break;

          case 'response':
            lastResponse = event.data as string;
            break;

          case 'done':
            spinner.succeed('Done');
            break;
        }
      }

      // Print response
      if (lastResponse) {
        console.log('\n' + formatResponse(lastResponse) + '\n');
      }

      // Show workflow summary
      if (session.workflow && session.workflow.nodes.length > 0) {
        console.log(`📋 Workflow: ${session.workflow.name}`);
        console.log(`   Nodes: ${session.workflow.nodes.length}`);
        console.log(`   Connections: ${Object.keys(session.workflow.connections).length}`);
        console.log('');
      }

    } catch (error) {
      spinner.fail('Error');
      console.error('Error:', (error as Error).message);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
  });
}

async function handleCommand(
  input: string,
  session: Session,
  n8nClient: ReturnType<typeof createN8nClient> | null,
  rl: ReturnType<typeof createInterface>
) {
  const command = input.toLowerCase();

  switch (command) {
    case '/deploy':
      if (!n8nClient) {
        console.log('❌ n8n not configured. Set N8N_BASE_URL and N8N_API_KEY.');
      } else if (!session.workflow) {
        console.log('❌ No workflow to deploy. Create one first.');
      } else {
        const spinner = ora('Deploying workflow...').start();
        try {
          const result = await n8nClient.createWorkflow({
            name: session.workflow.name,
            active: false,
            nodes: session.workflow.nodes as Parameters<typeof n8nClient.createWorkflow>[0]['nodes'],
            connections: session.workflow.connections as Parameters<typeof n8nClient.createWorkflow>[0]['connections'],
          });
          spinner.succeed(`Deployed! ID: ${result.id}`);
          console.log(`   URL: ${process.env.N8N_BASE_URL}/workflow/${result.id}`);
        } catch (error) {
          spinner.fail('Deploy failed');
          console.error('Error:', (error as Error).message);
        }
      }
      break;

    case '/save':
      if (!session.workflow) {
        console.log('❌ No workflow to save.');
      } else {
        const filename = `${session.workflow.name.replace(/\s+/g, '-').toLowerCase()}.workflow.json`;
        const fs = await import('fs/promises');
        await fs.writeFile(filename, JSON.stringify(session.workflow, null, 2));
        console.log(`✅ Saved to ${filename}`);
      }
      break;

    case '/clear':
      session.workflow = null;
      session.threadId = `cli-${Date.now()}`;
      console.log('✅ Started new session');
      break;

    case '/status':
      if (!session.workflow) {
        console.log('📋 No workflow created yet');
      } else {
        console.log(`📋 Workflow: ${session.workflow.name}`);
        console.log(`   Nodes: ${session.workflow.nodes.length}`);
        console.log(`   Connections: ${Object.keys(session.workflow.connections).length}`);
        if (session.workflow.nodes.length > 0) {
          console.log('   Node list:');
          for (const node of session.workflow.nodes as Array<{ name: string; type: string }>) {
            console.log(`     - ${node.name} (${node.type.split('.').pop()})`);
          }
        }
      }
      break;

    case '/quit':
    case '/exit':
      rl.close();
      return;

    default:
      console.log('Unknown command. Available: /deploy, /save, /clear, /status, /quit');
  }

  console.log('');
  rl.prompt();
}

function formatResponse(response: string): string {
  // Simple markdown-like formatting for terminal
  return response
    .replace(/\*\*(.*?)\*\*/g, '\x1b[1m$1\x1b[0m')  // Bold
    .replace(/\*(.*?)\*/g, '\x1b[3m$1\x1b[0m')       // Italic
    .replace(/`(.*?)`/g, '\x1b[36m$1\x1b[0m');       // Code (cyan)
}

// Run main
main().catch(console.error);
