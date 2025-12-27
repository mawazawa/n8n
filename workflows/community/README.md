# Community Workflow Templates

Curated collection of production-ready n8n workflows from the community, verified for n8n 2.x compatibility.

## Sources

These workflows are sourced from verified community repositories:
- [lucaswalter/n8n-ai-automations](https://github.com/lucaswalter/n8n-ai-automations) - The Recap AI
- [enescingoz/awesome-n8n-templates](https://github.com/enescingoz/awesome-n8n-templates) - Awesome n8n Templates

## Workflow Catalog

### AI Agents

| Workflow | Description | Source |
|----------|-------------|--------|
| `marketing_team_agent.json` | AI voice agent for daily marketing tasks (newsletters, images, videos) | The Recap AI |
| `ai_gmail_agent.json` | Intelligent Gmail management with AI | The Recap AI |
| `web_developer_agent.json` | AI agent for web development tasks | The Recap AI |
| `AI Agent _ Google calendar assistant using OpenAI.json` | Calendar management with natural language | Awesome n8n |
| `Advanced AI Demo.json` | Comprehensive AI agent demo | Awesome n8n |

### RAG & Research

| Workflow | Description | Source |
|----------|-------------|--------|
| `Open Deep Research - AI-Powered Autonomous Research Workflow.json` | Autonomous research agent | Awesome n8n |
| `Host Your Own AI Deep Research Agent.json` | Self-hosted research with OpenAI o3 | Awesome n8n |
| `Building RAG Chatbot for Movie Recommendations.json` | RAG with Qdrant vector store | Awesome n8n |
| `AI-Powered Email Automation for Business.json` | Email summarization with RAG | Awesome n8n |

### Database & Storage

| Workflow | Description | Source |
|----------|-------------|--------|
| `Talk to your SQLite database with a LangChain AI Agent.json` | SQL database chat | Awesome n8n |
| `MongoDB AI Agent - Intelligent Movie Recommendations.json` | MongoDB with AI recommendations | Awesome n8n |

### Voice & Chat

| Workflow | Description | Source |
|----------|-------------|--------|
| `whatsapp_ai_chatbot_agent.json` | WhatsApp AI chatbot | The Recap AI |
| `AI Voice Chatbot with ElevenLabs & OpenAI.json` | Voice-enabled customer service | Awesome n8n |
| `Private & Local Ollama Self-Hosted AI Assistant.json` | Local LLM assistant | Awesome n8n |

### Scraping & Automation

| Workflow | Description | Source |
|----------|-------------|--------|
| `ai_scraping_pipeline.json` | AI-powered web scraping | The Recap AI |
| `Autonomous AI crawler.json` | Self-navigating web crawler | Awesome n8n |

## Usage

### Import Workflow

1. Open n8n (default: http://localhost:5678)
2. Go to **Workflows** → **Import from File**
3. Select the `.json` file
4. Configure required credentials
5. Activate the workflow

### Required Credentials (varies by workflow)

| Service | Credential Type |
|---------|-----------------|
| OpenAI | `openAiApi` |
| Google Gemini | `googlePalmApi` |
| ElevenLabs | `elevenLabsApi` |
| Qdrant | `qdrantApi` |
| Supabase | `supabaseApi` |
| MongoDB | `mongoDb` |

## n8n 2.0 Compatibility Notes

These workflows may require updates for n8n 2.0:

1. **Task Runners**: Code nodes now run in isolated environments
2. **Error Classes**: Replace `ApplicationError` with `UserError`/`OperationalError`
3. **Save/Publish**: Remember to Publish after saving activated workflows

## License

These workflows are shared under their original licenses. See source repositories for details.

## Contributing

To add verified workflows:
1. Test the workflow on n8n 2.x
2. Ensure all credentials are parameterized (no hardcoded secrets)
3. Add to this README with proper attribution
