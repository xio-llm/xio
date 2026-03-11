# Xio

Self-hosted workspace for interacting with your own data through local LLMs.

Upload documents, transcribe audio, scrape webpages, and ask questions directly against your content. Everything runs on your machine.

## Features

- **Document processing** - PDF, DOCX, TXT, CSV, Markdown, JSON
- **Web scraping** - Extract and index content from any URL
- **Audio transcription** - Whisper integration (local or OpenAI)
- **Multiple LLM providers** - Ollama, OpenAI, Anthropic, LM Studio
- **Vector backends** - ChromaDB, Pinecone, LanceDB
- **Workspaces** - Organize content into separate searchable collections
- **Streaming chat** - Real-time responses with source citations
- **Agent wallet** - Autonomous Solana wallet for payments and on-chain actions
- **Credits system** - Pay-per-query with SOL deposits

## Quick Start

```bash
docker compose up --build
```

Open http://localhost:3001

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

Requires Node.js 20+ and a running Ollama instance (or configure an API key for OpenAI/Anthropic).

## Configuration

All settings are managed through environment variables. See `.env.example` for the full list.

### LLM Providers

| Provider | Model | Local |
|----------|-------|-------|
| Ollama | llama3.2, mistral, etc. | Yes |
| OpenAI | gpt-4o, gpt-4o-mini | No |
| Anthropic | claude-3.5-sonnet | No |
| LM Studio | any GGUF model | Yes |

### Vector Databases

| Backend | Persistent | Cloud |
|---------|-----------|-------|
| ChromaDB | Yes | No |
| Pinecone | Yes | Yes |
| LanceDB | Yes | No |

## API

### Workspaces
- `GET /api/v1/workspaces` - List all workspaces
- `POST /api/v1/workspaces` - Create workspace
- `GET /api/v1/workspaces/:id` - Get workspace with documents and conversations
- `PUT /api/v1/workspaces/:id` - Update workspace
- `DELETE /api/v1/workspaces/:id` - Delete workspace

### Documents
- `POST /api/v1/documents/upload/:workspaceId` - Upload file (multipart)
- `POST /api/v1/documents/scrape/:workspaceId` - Scrape URL
- `GET /api/v1/documents/:workspaceId` - List documents
- `DELETE /api/v1/documents/:docId` - Delete document

### Chat
- `POST /api/v1/chat/:workspaceId` - Send message (returns full response)
- `POST /api/v1/chat/:workspaceId/stream` - Send message (SSE stream)
- `GET /api/v1/chat/conversations/:workspaceId` - List conversations
- `GET /api/v1/chat/messages/:conversationId` - Get conversation messages

### Wallet
- `GET /api/v1/wallet/info` - Wallet address and balance
- `GET /api/v1/wallet/transactions` - Recent transactions
- `POST /api/v1/wallet/send` - Send SOL or SPL tokens
- `GET /api/v1/wallet/credits` - Credit balance
- `POST /api/v1/wallet/credits/deposit` - Deposit SOL for credits

## Architecture

```
ui/               Web interface (vanilla HTML/CSS/JS)
server/
  index.ts        Entry point
  app.ts          Express application
  routes/         API endpoints
  llm/            LLM provider abstraction
  vectordb/       Vector database abstraction
  documents/      Document parsing and chunking
  wallet/         Solana wallet and credits
  db/             SQLite database
  utils/          Config and logging
```

## Agent Wallet

`6XCQ1vtasaudCXQBAtwyyaextAnwMMb99gKjZ6KBhV56`

Xio includes an autonomous Solana wallet that can:
- Hold and send SOL and SPL tokens
- Process credit deposits (SOL to credits conversion)
- Track all on-chain transactions
- Interact with any Solana program

The wallet keypair is stored locally and encrypted at rest when `WALLET_ENCRYPTION_KEY` is set.

## License

MIT
