# Voice Interface Module

Production-ready voice command system for the workflow-architect package. Enables hands-free workflow creation and management through natural language commands.

## Features

- **Speech-to-Text**: OpenAI Whisper API integration for accurate transcription
- **Natural Language Processing**: Intent classification and entity extraction
- **Text-to-Speech**: Web Speech API for voice feedback
- **Session Management**: Command history, wake word detection, and timeout handling
- **Multi-language Support**: English, Spanish, German, French, and more
- **Real-time Streaming**: Continuous voice recognition with silence detection
- **Command Registry**: Extensible handler system for custom commands

## Architecture

```
voice/
├── types.ts              # Type definitions
├── transcriber.ts        # Speech-to-text (Whisper API)
├── parser.ts            # Command parsing and NLP
├── synthesizer.ts       # Text-to-speech (Web Speech API)
├── session.ts           # Session management
├── commands/
│   ├── index.ts         # Command registry
│   ├── workflow.ts      # Workflow commands
│   └── navigation.ts    # Navigation commands
└── index.ts             # Public exports
```

## Quick Start

### Basic Usage

```typescript
import { VoiceSessionManager } from '@n8n/workflow-architect/voice';

// Initialize voice session
const voiceManager = new VoiceSessionManager({
  openaiApiKey: process.env.OPENAI_API_KEY,
  defaultLanguage: 'en',
  enableWakeWord: true,
  wakeWord: 'hey n8n',
  enableFeedback: true,
});

// Start session
await voiceManager.startSession();

// The system is now listening for voice commands!
```

### With Workflow Context

```typescript
import { VoiceSessionManager } from '@n8n/workflow-architect/voice';
import type { WorkflowDefinition } from '@n8n/workflow-architect';

const voiceManager = new VoiceSessionManager({
  openaiApiKey: process.env.OPENAI_API_KEY,
});

// Set workflow context for better command understanding
voiceManager.setWorkflowContext({
  currentWorkflow: myWorkflow,
  onWorkflowCreate: async (name) => {
    // Handle workflow creation
    return createWorkflow(name);
  },
  onNodeAdd: async (node) => {
    // Handle node addition
    await addNodeToWorkflow(node);
  },
  onNodesConnect: async (sourceId, targetId) => {
    // Handle node connection
    await connectNodes(sourceId, targetId);
  },
  findNodeByName: (name) => {
    // Find node by name
    return workflow.nodes.find(n => n.name === name);
  },
});

await voiceManager.startSession();
```

## Supported Commands

### Workflow Management

- **Create Workflow**: "Create a new workflow called [name]"
- **Add Node**: "Add a [type] node"
  - Example: "Add a webhook node"
  - Example: "Add an HTTP request node"
- **Connect Nodes**: "Connect [source] to [target]"
  - Example: "Connect webhook to HTTP request"
- **Configure Node**: "Configure [node] to [parameters]"
- **Delete Node**: "Delete the [node] node"

### Navigation

- **Go to Node**: "Go to [node name]"
- **Zoom**: "Zoom in" / "Zoom out"
- **Fit View**: "Show all nodes" / "Fit to view"
- **Focus**: "Focus on trigger"

### Execution

- **Run Workflow**: "Run the workflow"
- **Test Workflow**: "Test the workflow"

### Other

- **Undo**: "Undo"
- **Redo**: "Redo"
- **Help**: "Help" / "What can you do?"

## Configuration

### VoiceSessionConfig

```typescript
interface VoiceSessionConfig {
  // OpenAI API key for Whisper
  openaiApiKey?: string;

  // Whisper model (default: 'whisper-1')
  whisperModel?: 'whisper-1';

  // Default language (default: 'en')
  defaultLanguage?: string;

  // Enable wake word detection (default: false)
  enableWakeWord?: boolean;

  // Wake word phrase (default: 'hey n8n')
  wakeWord?: string;

  // Auto-start listening (default: true)
  enableAutoListen?: boolean;

  // Enable voice feedback (default: true)
  enableFeedback?: boolean;

  // Session timeout in ms (default: 300000 = 5 min)
  sessionTimeout?: number;

  // Max commands to keep in history (default: 100)
  maxCommandHistory?: number;
}
```

## Advanced Usage

### Custom Command Handlers

```typescript
import { commandRegistry } from '@n8n/workflow-architect/voice';
import type { VoiceCommandHandler } from '@n8n/workflow-architect/voice';

// Define custom handler
const customHandler: VoiceCommandHandler = {
  type: 'custom_command',
  patterns: [
    'do\\s+something\\s+custom',
    'custom\\s+action',
  ],
  handler: async (command) => {
    // Your custom logic here
    return {
      success: true,
      message: 'Custom command executed',
      speak: 'Done!',
    };
  },
};

// Register handler
commandRegistry.registerCommand(customHandler);
```

### Manual Transcription

```typescript
const transcriber = voiceManager.getTranscriber();

// Transcribe audio file
const audioBlob = await fetch('/path/to/audio.mp3').then(r => r.blob());
const transcription = await transcriber.transcribe(audioBlob);

console.log(transcription.text);
```

### Direct Speech Synthesis

```typescript
const synthesizer = voiceManager.getSynthesizer();

// Speak text
await synthesizer.speak('Hello, workflow is ready!', {
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  language: 'en-US',
});

// Stop speaking
synthesizer.stop();

// Pause/Resume
synthesizer.pause();
synthesizer.resume();
```

### Command Parsing

```typescript
const parser = voiceManager.getParser();

// Set workflow context for better entity extraction
parser.setContext(workflow.nodes);

// Parse text manually
const command = parser.parse({
  text: 'Add a webhook node',
  confidence: 0.95,
  language: 'en',
  duration: 1.5,
});

console.log(command.type); // 'add_node'
console.log(command.entities); // { nodeType: 'n8n-nodes-base.webhook' }
```

## Performance Characteristics

- **Transcription Latency**: ~500ms - 2s (depends on audio length)
- **Command Parsing**: <50ms
- **Speech Synthesis**: <100ms to start
- **Wake Word Detection**: Real-time
- **Transcription Accuracy**: >95% (with clear speech)
- **Multi-language Support**: 12+ languages

## Browser Compatibility

- **Speech Recognition**: Requires OpenAI API key
- **Speech Synthesis**: Chrome 33+, Firefox 49+, Safari 7+, Edge 14+
- **MediaStream API**: Chrome 53+, Firefox 36+, Safari 11+, Edge 12+

## Error Handling

```typescript
try {
  await voiceManager.startSession();
} catch (error) {
  if (error.message.includes('getUserMedia')) {
    console.error('Microphone access denied');
  } else if (error.message.includes('API key')) {
    console.error('OpenAI API key missing or invalid');
  } else {
    console.error('Voice session error:', error);
  }
}
```

## Session Persistence

```typescript
// Persist current session
await voiceManager.persistSession();

// Load previous session
const session = await voiceManager.loadSession(sessionId);
```

## Testing

```typescript
// Test speech synthesis
await voiceManager.test();

// Check system availability
const synthesizer = voiceManager.getSynthesizer();
console.log(synthesizer.isAvailable()); // true/false

// Get session statistics
const stats = voiceManager.getSessionStats();
console.log(stats);
// {
//   sessionId: '...',
//   duration: 120000,
//   commandCount: 15,
//   isListening: true,
//   isWakeWordEnabled: true
// }
```

## Security Considerations

- **API Keys**: Never commit OpenAI API keys to version control
- **Microphone Access**: Always request user permission before accessing microphone
- **Data Privacy**: Transcriptions are sent to OpenAI; use with appropriate data policies
- **Command Validation**: All commands are validated before execution
- **Session Timeout**: Sessions auto-expire to prevent unauthorized access

## Troubleshooting

### No transcription results

1. Check microphone permissions
2. Verify OpenAI API key is valid
3. Check network connectivity
4. Ensure audio is being captured (check browser DevTools)

### Speech synthesis not working

1. Check browser compatibility
2. Ensure voices are loaded (may take a few seconds)
3. Check audio output settings
4. Try calling `synthesizer.test()`

### Commands not recognized

1. Verify wake word was detected (if enabled)
2. Check command patterns in handler definitions
3. Enable debug logging to see parsed commands
4. Improve microphone quality or reduce background noise

## License

Part of the @n8n/workflow-architect package.
