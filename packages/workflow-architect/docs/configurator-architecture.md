# Configurator Agent Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WORKFLOW ARCHITECT GRAPH                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌───────────┐    ┌─────────┐    ┌──────────────┐         │
│  │          │    │           │    │         │    │              │         │
│  │  START   │───▶│Supervisor │───▶│Discovery│───▶│Process Ops   │         │
│  │          │    │           │    │         │    │              │         │
│  └──────────┘    └───────────┘    └───────────┘  └──────┬───────┘         │
│                        │                                  │                 │
│                        │                                  ▼                 │
│                        │                          ┌──────────────┐         │
│                        │                          │              │         │
│                        ├─────────────────────────▶│  BUILDER     │         │
│                        │                          │              │         │
│                        │                          └──────┬───────┘         │
│                        │                                  │                 │
│                        │                                  ▼                 │
│                        │                          ┌──────────────┐         │
│                        │                          │              │         │
│                        │                          │Process Ops   │         │
│                        │                          │              │         │
│                        │                          └──────┬───────┘         │
│                        │                                  │                 │
│                        │                                  ▼                 │
│                        │                    ╔═════════════════════════╗    │
│                        │                    ║                         ║    │
│                        ├───────────────────▶║   CONFIGURATOR AGENT    ║    │
│                        │                    ║                         ║    │
│                        │                    ╚═══════════╤═════════════╝    │
│                        │                                │                   │
│                        │                                ▼                   │
│                        │                          ┌──────────────┐         │
│                        │                          │              │         │
│                        ├─────────────────────────▶│  RESPONDER   │         │
│                        │                          │              │         │
│                        │                          └──────┬───────┘         │
│                        │                                  │                 │
│                        ▼                                  ▼                 │
│                   ┌────────┐                         ┌────────┐            │
│                   │  END   │◀────────────────────────│  END   │            │
│                   └────────┘                         └────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Configurator Agent Architecture

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                        CONFIGURATOR AGENT                                  ║
╚═══════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│                              INPUT STATE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  • workflowJSON: SimpleWorkflow                                             │
│  • messages: BaseMessage[]                                                  │
│  • discoveryContext: DiscoveryContext                                       │
│  • availableCredentials: AvailableCredential[]                              │
└─────────────────┬───────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AGENT INITIALIZATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Create Claude Sonnet 4 model (temp=0.2)                                │
│  2. Identify nodes needing configuration                                    │
│  3. Validate current workflow state                                         │
│  4. Format task prompt with context                                         │
└─────────────────┬───────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TOOL BINDING                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────┐      ┌──────────────────────┐                  │
│   │  get_node_parameters │      │ update_node_parameters│                  │
│   │                      │      │                       │                  │
│   │  • Retrieve current  │      │ • Set parameter values│                  │
│   │  • Include reference │      │ • Initialize if needed│                  │
│   │  • Check credentials │      │ • Validate types      │                  │
│   └──────────────────────┘      └──────────────────────┘                  │
│                                                                              │
│   ┌──────────────────────┐      ┌──────────────────────┐                  │
│   │ assign_credentials   │      │ validate_parameters   │                  │
│   │                      │      │                       │                  │
│   │ • Match by type      │      │ • Check types         │                  │
│   │ • Verify compatible  │      │ • Check credentials   │                  │
│   │ • Assign to node     │      │ • Report issues       │                  │
│   └──────────────────────┘      └──────────────────────┘                  │
│                                                                              │
└─────────────────┬───────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT LOOP (Max 10 iterations)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────┐                  │
│   │ 1. Model decides which tool to call                 │                  │
│   │    (based on current workflow state)                │                  │
│   └────────────────────┬────────────────────────────────┘                  │
│                        │                                                     │
│                        ▼                                                     │
│   ┌─────────────────────────────────────────────────────┐                  │
│   │ 2. Execute tool call(s)                             │                  │
│   │    • Run tool function                              │                  │
│   │    • Update workflow in-place                       │                  │
│   │    • Track what was configured                      │                  │
│   └────────────────────┬────────────────────────────────┘                  │
│                        │                                                     │
│                        ▼                                                     │
│   ┌─────────────────────────────────────────────────────┐                  │
│   │ 3. Return tool results to model                     │                  │
│   │    • JSON string output                             │                  │
│   │    • Success/error status                           │                  │
│   └────────────────────┬────────────────────────────────┘                  │
│                        │                                                     │
│                        ▼                                                     │
│   ┌─────────────────────────────────────────────────────┐                  │
│   │ 4. Model processes results                          │                  │
│   │    • Decides if more configuration needed           │                  │
│   │    • May call more tools or finish                  │                  │
│   └────────────────────┬────────────────────────────────┘                  │
│                        │                                                     │
│                        └─────────▶ Loop continues or exits                  │
│                                                                              │
└─────────────────┬───────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FINAL VALIDATION                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Validate all nodes in workflow                                           │
│  • Check for missing credentials                                            │
│  • Identify validation issues                                               │
│  • Generate summary message                                                 │
└─────────────────┬───────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OUTPUT STATE                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  • workflowJSON: SimpleWorkflow (updated with configs)                      │
│  • messages: BaseMessage[] (with AI summary message)                        │
│  • Tracking: configuredNodes[], assignedCredentials[]                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tool Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TOOL: get_node_parameters                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Input (Zod Schema):                                                        │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ • node_name: string                                │                    │
│  │ • include_reference: boolean (optional)            │                    │
│  └────────────────────────────────────────────────────┘                    │
│                            │                                                 │
│                            ▼                                                 │
│  Processing:                                                                │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ 1. Find node by name                               │                    │
│  │ 2. Extract current parameters                      │                    │
│  │ 3. Get parameter reference from prompt.ts          │                    │
│  │ 4. Check credential status                         │                    │
│  └────────────────────────────────────────────────────┘                    │
│                            │                                                 │
│                            ▼                                                 │
│  Output (JSON):                                                             │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ {                                                   │                    │
│  │   node_name: string,                               │                    │
│  │   node_type: string,                               │                    │
│  │   current_parameters: Record<string, unknown>,     │                    │
│  │   available_parameters?: string[],                 │                    │
│  │   required_credentials?: string[],                 │                    │
│  │   has_credentials: boolean                         │                    │
│  │ }                                                   │                    │
│  └────────────────────────────────────────────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     TOOL: update_node_parameters                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Input (Zod Schema):                                                        │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ • node_name: string                                │                    │
│  │ • parameters: Record<string, unknown>              │                    │
│  └────────────────────────────────────────────────────┘                    │
│                            │                                                 │
│                            ▼                                                 │
│  Processing:                                                                │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ 1. Find node by name                               │                    │
│  │ 2. Initialize parameters if needed                 │                    │
│  │ 3. Update each parameter                           │                    │
│  │ 4. Track updated parameter names                   │                    │
│  │ 5. Update workflow (side effect)                   │                    │
│  └────────────────────────────────────────────────────┘                    │
│                            │                                                 │
│                            ▼                                                 │
│  Output (JSON):                                                             │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ {                                                   │                    │
│  │   success: true,                                   │                    │
│  │   message: "Updated N parameters...",              │                    │
│  │   updated: string[]                                │                    │
│  │ }                                                   │                    │
│  └────────────────────────────────────────────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      TOOL: assign_credentials                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Input (Zod Schema):                                                        │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ • node_name: string                                │                    │
│  │ • credential_type: string                          │                    │
│  │ • credential_name: string                          │                    │
│  └────────────────────────────────────────────────────┘                    │
│                            │                                                 │
│                            ▼                                                 │
│  Processing:                                                                │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ 1. Find node by name                               │                    │
│  │ 2. Find credential in available list               │                    │
│  │ 3. Verify compatibility with node type             │                    │
│  │ 4. Assign credential to node                       │                    │
│  │ 5. Update workflow (side effect)                   │                    │
│  └────────────────────────────────────────────────────┘                    │
│                            │                                                 │
│                            ▼                                                 │
│  Output (JSON):                                                             │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ {                                                   │                    │
│  │   success: true,                                   │                    │
│  │   message: "Assigned credential..."                │                    │
│  │ }                                                   │                    │
│  └────────────────────────────────────────────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     TOOL: validate_parameters                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Input (Zod Schema):                                                        │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ • node_name: string                                │                    │
│  └────────────────────────────────────────────────────┘                    │
│                            │                                                 │
│                            ▼                                                 │
│  Processing:                                                                │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ 1. Find node by name                               │                    │
│  │ 2. Get validators for node type                    │                    │
│  │ 3. Validate each parameter                         │                    │
│  │ 4. Check credential requirements                   │                    │
│  │ 5. Collect issues (errors and warnings)            │                    │
│  └────────────────────────────────────────────────────┘                    │
│                            │                                                 │
│                            ▼                                                 │
│  Output (JSON):                                                             │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ {                                                   │                    │
│  │   node_name: string,                               │                    │
│  │   node_type: string,                               │                    │
│  │   is_valid: boolean,                               │                    │
│  │   issues: ValidationIssue[],                       │                    │
│  │   missing_credentials: boolean                     │                    │
│  │ }                                                   │                    │
│  └────────────────────────────────────────────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Credential Detection Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CREDENTIAL TYPE DETECTION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Input: Node Type (e.g., "n8n-nodes-base.slack")                           │
│           │                                                                  │
│           ▼                                                                  │
│  ┌────────────────────────────────────────────────┐                        │
│  │  NODE_CREDENTIAL_MAP lookup                    │                        │
│  │                                                 │                        │
│  │  "n8n-nodes-base.slack": [                     │                        │
│  │    "slackApi",                                  │                        │
│  │    "slackOAuth2Api"                             │                        │
│  │  ]                                              │                        │
│  └─────────────────┬──────────────────────────────┘                        │
│                    │                                                         │
│                    ▼                                                         │
│  Required Types: ["slackApi", "slackOAuth2Api"]                            │
│           │                                                                  │
│           ▼                                                                  │
│  ┌────────────────────────────────────────────────┐                        │
│  │  Match against available credentials:          │                        │
│  │                                                 │                        │
│  │  Available:                                     │                        │
│  │  - "Slack Bot" (slackApi)                      │                        │
│  │  - "Slack OAuth" (slackOAuth2Api)              │                        │
│  │  - "OpenAI Key" (openAiApi)                    │                        │
│  └─────────────────┬──────────────────────────────┘                        │
│                    │                                                         │
│                    ▼                                                         │
│  Matching: ["Slack Bot", "Slack OAuth"]                                    │
│           │                                                                  │
│           ▼                                                                  │
│  ┌────────────────────────────────────────────────┐                        │
│  │  Suggestion Logic:                              │                        │
│  │                                                 │                        │
│  │  1. Prefer OAuth2 over API key                 │                        │
│  │  2. If no OAuth2, use most recent              │                        │
│  │  3. If only one match, use it                  │                        │
│  └─────────────────┬──────────────────────────────┘                        │
│                    │                                                         │
│                    ▼                                                         │
│  Suggested: "Slack OAuth" (slackOAuth2Api)                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Validation Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MULTI-LEVEL VALIDATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Level 1: Schema Validation (Zod)                                          │
│  ┌────────────────────────────────────────────────┐                        │
│  │ • Validate input types                          │                        │
│  │ • Check required fields                         │                        │
│  │ • Enforce constraints                           │                        │
│  └────────────────────────────────────────────────┘                        │
│                    │                                                         │
│                    ▼                                                         │
│  Level 2: Parameter Type Validation                                        │
│  ┌────────────────────────────────────────────────┐                        │
│  │ • Enum values (e.g., method: GET|POST|...)     │                        │
│  │ • URL format (with expression support)          │                        │
│  │ • String patterns                               │                        │
│  │ • Number ranges                                 │                        │
│  └────────────────────────────────────────────────┘                        │
│                    │                                                         │
│                    ▼                                                         │
│  Level 3: Business Logic Validation                                        │
│  ┌────────────────────────────────────────────────┐                        │
│  │ • Credential compatibility                      │                        │
│  │ • Required vs optional parameters               │                        │
│  │ • Empty value checks                            │                        │
│  └────────────────────────────────────────────────┘                        │
│                    │                                                         │
│                    ▼                                                         │
│  Level 4: Workflow-Level Validation                                        │
│  ┌────────────────────────────────────────────────┐                        │
│  │ • All nodes validated                           │                        │
│  │ • Missing credentials identified                │                        │
│  │ • Deployment readiness check                    │                        │
│  │ • Blockers vs warnings classification           │                        │
│  └────────────────────────────────────────────────┘                        │
│                    │                                                         │
│                    ▼                                                         │
│  Result: ValidationResult with issues categorized by severity              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## State Flow

```
START STATE
├─ workflowJSON: { nodes: [], connections: {} }
├─ messages: [HumanMessage("Create workflow")]
└─ availableCredentials: []

        │
        ▼ Discovery Agent

├─ discoveryContext: { nodesFound: [...] }
└─ messages: [..., AIMessage("Found nodes")]

        │
        ▼ Builder Agent

├─ workflowJSON: { nodes: [Slack, OpenAI], connections: {...} }
└─ messages: [..., AIMessage("Built workflow")]

        │
        ▼ Process Operations

├─ workflowJSON: (operations applied)
└─ workflowOperations: null

        │
        ▼ CONFIGURATOR AGENT

├─ workflowJSON: {
│    nodes: [
│      { name: "Slack", parameters: {...}, credentials: {...} },
│      { name: "OpenAI", parameters: {...}, credentials: {...} }
│    ]
│  }
└─ messages: [..., AIMessage("Configured 2 nodes")]

        │
        ▼ Responder Agent

└─ messages: [..., AIMessage("Your workflow is ready!")]

END STATE
```

## Error Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ERROR HANDLING                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Tool Execution Errors:                                                     │
│  ┌────────────────────────────────────────────────┐                        │
│  │ try {                                           │                        │
│  │   const result = await tool.invoke(args);      │                        │
│  │ } catch (error) {                              │                        │
│  │   return {                                      │                        │
│  │     tool_call_id: id,                          │                        │
│  │     output: JSON.stringify({ error: String(e) })│                        │
│  │   };                                            │                        │
│  │ }                                               │                        │
│  └────────────────────────────────────────────────┘                        │
│                                                                              │
│  Validation Errors:                                                         │
│  ┌────────────────────────────────────────────────┐                        │
│  │ • Non-existent node: error message              │                        │
│  │ • Missing credential: error message             │                        │
│  │ • Incompatible type: error message              │                        │
│  │ • Invalid parameter: validation issue           │                        │
│  └────────────────────────────────────────────────┘                        │
│                                                                              │
│  Agent Loop Protection:                                                     │
│  ┌────────────────────────────────────────────────┐                        │
│  │ • Max 10 iterations                             │                        │
│  │ • Prevents infinite loops                       │                        │
│  │ • Returns partial results if max reached        │                        │
│  └────────────────────────────────────────────────┘                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Immutability**: State updates create new objects, never mutate existing
2. **Type Safety**: TypeScript strict mode + Zod validation on all inputs
3. **Tool Pattern**: Consistent input/output format across all tools
4. **Agent Loop**: Maximum iterations prevent infinite loops
5. **OAuth2 Preference**: Smart credential suggestion prioritizes OAuth2
6. **Multi-Level Validation**: Schema → Type → Business Logic → Workflow
7. **Error Recovery**: Graceful degradation with partial results
8. **Caching**: Credential provider caches for 1 minute
9. **Side Effects**: Tools update workflow in-place for simplicity
10. **JSON Output**: Tools return JSON strings for LLM consumption
