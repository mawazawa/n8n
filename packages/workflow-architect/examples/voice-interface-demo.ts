/**
 * Voice Interface Demo
 * Example demonstrating voice command functionality
 */

import { VoiceSessionManager } from '../src/voice/index.js';
import type { WorkflowDefinition, WorkflowNode } from '../src/types/workflow.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Demo: Basic voice session with workflow commands
 */
async function basicVoiceDemo() {
  console.log('🎤 Starting Basic Voice Demo...\n');

  // Initialize voice session manager
  const voiceManager = new VoiceSessionManager({
    openaiApiKey: process.env.OPENAI_API_KEY,
    defaultLanguage: 'en',
    enableWakeWord: false, // Disable wake word for demo
    enableFeedback: true,
    sessionTimeout: 600000, // 10 minutes
  });

  // Test speech synthesis
  console.log('Testing speech synthesis...');
  await voiceManager.test();

  // Start voice session
  console.log('\nStarting voice session...');
  const session = await voiceManager.startSession();
  console.log(`Session ID: ${session.id}`);
  console.log(`Language: ${session.language}`);
  console.log(`Listening: ${session.isListening}\n`);

  // Example: Process a voice command from audio file
  // In real usage, this would come from microphone input
  console.log('You can now speak commands like:');
  console.log('  - "Create a new workflow called Data Pipeline"');
  console.log('  - "Add a webhook node"');
  console.log('  - "Add an HTTP request node"');
  console.log('  - "Connect webhook to HTTP request"');
  console.log('  - "Help"\n');

  // Simulate waiting for user input
  console.log('Listening for commands... (Press Ctrl+C to exit)\n');

  // Keep session alive
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // End session
  await voiceManager.endSession();
  console.log('\n✓ Session ended');
}

/**
 * Demo: Voice session with workflow context
 */
async function workflowContextDemo() {
  console.log('🎤 Starting Workflow Context Demo...\n');

  // Create a sample workflow
  let currentWorkflow: WorkflowDefinition = {
    id: uuidv4(),
    name: 'Demo Workflow',
    active: false,
    nodes: [],
    connections: {},
    settings: {
      executionOrder: 'v1',
    },
  };

  console.log(`Initial workflow: ${currentWorkflow.name}`);
  console.log(`Nodes: ${currentWorkflow.nodes.length}\n`);

  // Initialize voice manager
  const voiceManager = new VoiceSessionManager({
    openaiApiKey: process.env.OPENAI_API_KEY,
    defaultLanguage: 'en',
    enableFeedback: true,
  });

  // Set workflow context with handlers
  voiceManager.setWorkflowContext({
    currentWorkflow,
    onWorkflowCreate: async (name: string) => {
      console.log(`\n📝 Creating workflow: ${name}`);
      currentWorkflow = {
        id: uuidv4(),
        name,
        active: false,
        nodes: [],
        connections: {},
        settings: { executionOrder: 'v1' },
      };
      return currentWorkflow;
    },
    onNodeAdd: async (node: WorkflowNode) => {
      console.log(`\n➕ Adding node: ${node.name} (${node.type})`);
      currentWorkflow.nodes.push(node);
      console.log(`Total nodes: ${currentWorkflow.nodes.length}`);
    },
    onNodeDelete: async (nodeId: string) => {
      console.log(`\n➖ Deleting node: ${nodeId}`);
      currentWorkflow.nodes = currentWorkflow.nodes.filter((n) => n.id !== nodeId);
      console.log(`Remaining nodes: ${currentWorkflow.nodes.length}`);
    },
    onNodeUpdate: async (nodeId: string, updates: Partial<WorkflowNode>) => {
      console.log(`\n✏️  Updating node: ${nodeId}`);
      const node = currentWorkflow.nodes.find((n) => n.id === nodeId);
      if (node) {
        Object.assign(node, updates);
        console.log(`Updated: ${JSON.stringify(updates)}`);
      }
    },
    onNodesConnect: async (sourceId: string, targetId: string) => {
      console.log(`\n🔗 Connecting nodes: ${sourceId} -> ${targetId}`);
      if (!currentWorkflow.connections[sourceId]) {
        currentWorkflow.connections[sourceId] = { main: [[]] };
      }
      currentWorkflow.connections[sourceId].main[0].push({
        node: targetId,
        type: 'main',
        index: 0,
      });
      console.log('Connection created');
    },
    findNodeByName: (name: string) => {
      return currentWorkflow.nodes.find(
        (n) => n.name.toLowerCase() === name.toLowerCase(),
      );
    },
  });

  // Set navigation context
  voiceManager.setNavigationContext({
    onNavigateToNode: async (nodeId: string) => {
      const node = currentWorkflow.nodes.find((n) => n.id === nodeId);
      console.log(`\n🧭 Navigating to: ${node?.name || nodeId}`);
    },
    onZoom: async (direction: 'in' | 'out') => {
      console.log(`\n🔍 Zoom ${direction}`);
    },
    onFitView: async () => {
      console.log('\n📐 Fit to view');
    },
    findNodeByName: (name: string) => {
      return currentWorkflow.nodes.find(
        (n) => n.name.toLowerCase() === name.toLowerCase(),
      );
    },
  });

  // Start session
  await voiceManager.startSession();

  console.log('\n📋 Example commands:');
  console.log('  1. "Create a new workflow called Email Pipeline"');
  console.log('  2. "Add a webhook node"');
  console.log('  3. "Add a Gmail node"');
  console.log('  4. "Connect webhook to Gmail"');
  console.log('  5. "Go to webhook"');
  console.log('  6. "Run the workflow"');
  console.log('  7. "Help"\n');

  // Wait for commands
  console.log('Listening for commands...\n');
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Show final workflow state
  console.log('\n📊 Final Workflow State:');
  console.log(`Name: ${currentWorkflow.name}`);
  console.log(`Nodes: ${currentWorkflow.nodes.length}`);
  console.log(
    `Connections: ${Object.keys(currentWorkflow.connections).length}`,
  );

  // End session
  await voiceManager.endSession();
  console.log('\n✓ Demo completed');
}

/**
 * Demo: Command history and session stats
 */
async function sessionStatsDemo() {
  console.log('🎤 Starting Session Stats Demo...\n');

  const voiceManager = new VoiceSessionManager({
    openaiApiKey: process.env.OPENAI_API_KEY,
    enableFeedback: false, // Disable for cleaner output
  });

  await voiceManager.startSession();

  // Simulate some command execution
  console.log('Simulating voice commands...\n');

  const parser = voiceManager.getParser();
  const registry = voiceManager.getCommandRegistry();

  // Parse and execute some sample commands
  const sampleCommands = [
    'Create a new workflow called Test Workflow',
    'Add a webhook node',
    'Add an HTTP request node',
    'Connect webhook to HTTP request',
    'Help',
  ];

  for (const text of sampleCommands) {
    console.log(`> "${text}"`);
    const command = parser.parse({
      text,
      confidence: 0.95,
      language: 'en',
      duration: 1.0,
    });

    const result = await registry.executeCommand(command);
    console.log(`  ${result.success ? '✓' : '✗'} ${result.message}\n`);

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Show session statistics
  const stats = voiceManager.getSessionStats();
  console.log('📊 Session Statistics:');
  console.log(`  Session ID: ${stats.sessionId}`);
  console.log(`  Duration: ${(stats.duration / 1000).toFixed(1)}s`);
  console.log(`  Commands: ${stats.commandCount}`);
  console.log(`  Listening: ${stats.isListening}`);
  console.log(`  Wake Word: ${stats.isWakeWordEnabled}\n`);

  // Show command history
  const history = voiceManager.getCommandHistory();
  console.log('📜 Command History:');
  history.forEach((cmd, i) => {
    console.log(
      `  ${i + 1}. [${cmd.type}] "${cmd.rawText}" (confidence: ${(cmd.confidence * 100).toFixed(0)}%)`,
    );
  });

  await voiceManager.endSession();
  console.log('\n✓ Demo completed');
}

/**
 * Demo: Multi-language support
 */
async function multiLanguageDemo() {
  console.log('🎤 Starting Multi-Language Demo...\n');

  const languages = [
    { code: 'en', name: 'English', sample: 'Add a webhook node' },
    { code: 'es', name: 'Spanish', sample: 'Agregar un nodo webhook' },
    { code: 'de', name: 'German', sample: 'Webhook-Knoten hinzufügen' },
  ];

  for (const lang of languages) {
    console.log(`\n🌍 Testing ${lang.name} (${lang.code})`);

    const voiceManager = new VoiceSessionManager({
      openaiApiKey: process.env.OPENAI_API_KEY,
      defaultLanguage: lang.code,
      enableFeedback: true,
    });

    await voiceManager.startSession(lang.code);

    const synthesizer = voiceManager.getSynthesizer();
    synthesizer.setDefaultConfig({ language: `${lang.code}-${lang.code.toUpperCase()}` });

    console.log(`  Sample command: "${lang.sample}"`);
    console.log(`  Available voices: ${synthesizer.getVoicesForLanguage(lang.code).length}`);

    await voiceManager.endSession();
  }

  console.log('\n✓ Multi-language demo completed');
}

/**
 * Main entry point
 */
async function main() {
  const demos = {
    basic: basicVoiceDemo,
    workflow: workflowContextDemo,
    stats: sessionStatsDemo,
    multilang: multiLanguageDemo,
  };

  const demoName = (process.argv[2] as keyof typeof demos) || 'basic';

  if (!demos[demoName]) {
    console.log('Usage: tsx voice-interface-demo.ts [demo]');
    console.log('\nAvailable demos:');
    console.log('  basic     - Basic voice session');
    console.log('  workflow  - Workflow context and handlers');
    console.log('  stats     - Command history and statistics');
    console.log('  multilang - Multi-language support');
    process.exit(1);
  }

  try {
    await demos[demoName]();
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run demo if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
