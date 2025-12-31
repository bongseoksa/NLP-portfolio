# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub repository analyzer that uses NLP/RAG to answer questions about code structure, commit history, and implementation details. The system collects repository data, generates embeddings, stores vectors, and provides a Q&A interface powered by OpenAI or Claude.

**Tech Stack:**
- Backend: Node.js + TypeScript + Express (ESM modules)
- Frontend: React 19 + TypeScript + Vite + PandaCSS
- State: Jotai (atoms) + TanStack Query (server state)
- Vector Storage: **File-based (Serverless)** / Supabase pgvector (Cloud) / ChromaDB (Local)
- LLM: OpenAI GPT-4o (primary) / Claude Sonnet 4 (fallback)
- Embeddings: OpenAI text-embedding-3-small (primary) / Chroma default (fallback)
- Storage: Supabase (Q&A history, embedding storage)

## Development Commands

### Backend (Root Directory)

```bash
# Setup & Infrastructure
pnpm install                    # Install dependencies
pnpm run chroma:setup          # One-time ChromaDB installation (creates .chroma_venv) - OPTIONAL for local dev
pnpm run chroma:start          # Start ChromaDB server (required for local ChromaDB mode) - OPTIONAL

# Data Pipeline
pnpm run dev                   # Full pipeline: fetch data → embed → store in Supabase/ChromaDB
pnpm run dev --reset           # Reset vector collection, then run full pipeline
pnpm run reindex               # Re-embed existing data without fetching (use when switching embedding providers)

# Export Embeddings to File (for serverless deployment)
pnpm tsx scripts/export-embeddings.ts --source supabase --upload vercel

# Q&A (CLI)
pnpm run ask "your question"   # Query via command line (auto-detects: File > Supabase > ChromaDB)

# Servers
pnpm run server                # Start API server (:3001) for Q&A and dashboard

# Build
pnpm run build                 # Compile TypeScript to dist/
pnpm run start                 # Run compiled JS from dist/
```

**Important zsh Note:** When using `pnpm run ask`, always quote questions containing special characters (`?`, `*`, etc.) to avoid shell glob expansion errors:
```bash
pnpm run ask "차트는 뭐로 만들어졌어?"  # Correct
pnpm run ask 차트는 뭐로 만들어졌어?   # ERROR: zsh glob pattern
```

### Frontend (frontend/)

```bash
cd frontend
pnpm install                   # Install frontend dependencies
pnpm run dev                   # Start dev server (:5173)
pnpm run build                 # Production build (includes PandaCSS codegen)
pnpm run panda                 # Generate PandaCSS utility classes
```

## System Architecture

### Vector Storage Modes (Priority: File > Supabase > ChromaDB)

The system supports **three vector storage modes** with automatic detection:

**1. File-Based (Serverless - Recommended for Production)** 🌟
   - Zero server cost ($0.11/month vs $20-50/month for ChromaDB)
   - Serverless compatible (Vercel, Lambda)
   - Static file delivery via CDN (Vercel Blob, S3 + CloudFront)
   - Memory cached with 5-minute TTL
   - Cold start: 150-380ms, Warm start: 51-151ms
   - Enabled by: `VECTOR_FILE_URL` environment variable
   - See [docs/architecture/FILE-BASED-VECTOR-STORE.md](docs/architecture/FILE-BASED-VECTOR-STORE.md) for details

**2. Supabase pgvector (Cloud)**
   - Managed PostgreSQL with pgvector extension
   - Read/write operations supported
   - $25-30/month for Pro plan
   - Good for write-heavy workloads
   - Enabled by: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

**3. ChromaDB (Local Development)**
   - Python-based vector database on port 8000
   - Requires persistent server process
   - Free for local development
   - Must run `pnpm run chroma:start` before use
   - Fallback when no file URL or Supabase credentials

### Required Services

**Minimal Setup (Serverless)**:
- Only API Server (port 3001)
- Static file hosting (Vercel Blob / S3)
- No persistent database servers required

**Local Development**:
- API Server (port 3001)
- ChromaDB Server (port 8000) - optional if using Supabase/File mode

### Data Flow

**Pipeline Mode (Offline - runs in GitHub Actions or locally):**
```
GitHub API → Fetch commits + files (with patch) + repository source code
         ↓
Data Refinement → Convert to NLP-friendly format (commit + diff + file types)
         ↓
Embedding Generation → OpenAI (primary) / Chroma (fallback)
         ↓
Vector Storage → Supabase pgvector (Cloud) or ChromaDB (Local)
         ↓
Export to File (optional) → embeddings.json.gz → Vercel Blob / S3
```

**Q&A Mode (Online - serverless API):**
```
User Question → Generate query embedding (OpenAI)
            ↓
Vector Search → File-based (primary) / Supabase (fallback) / ChromaDB (local dev)
            ↓
Retrieve Top-K similar documents (commits + files)
            ↓
LLM (OpenAI/Claude) → Generate answer with context
            ↓
Supabase → Store Q&A history (optional)
            ↓
Frontend → Display answer + sources
```

### API Fallback Strategy

The system implements graceful fallbacks for external APIs:

**Embeddings:**
- Primary: OpenAI `text-embedding-3-small` (1536 dimensions)
- Fallback: Chroma default embedding (local, no API key needed)
- Use `pnpm run reindex` when switching embedding providers

**Answer Generation (both required - at least one API key must be set):**
- Primary: OpenAI `gpt-4o`
- Fallback: Claude `claude-sonnet-4-20250514`
- If both fail or missing: Returns error message with status `"failed"`

### Environment Configuration

Required `.env` variables:
```bash
# GitHub data source (required for embedding pipeline)
GITHUB_TOKEN=ghp_xxx
TARGET_REPO_OWNER=username
TARGET_REPO_NAME=repo-name

# AI APIs (at least one required for Q&A)
OPENAI_API_KEY=sk-proj-xxx    # Primary for embeddings + answers
CLAUDE_API_KEY=sk-ant-xxx     # Fallback for answers only

# Vector Storage Mode (choose one):

# Option 1: File-based (Serverless - Recommended for production)
VECTOR_FILE_URL=https://xxx.vercel-storage.com/embeddings.json.gz
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx  # For export script

# Option 2: Supabase (Cloud - write-heavy workloads)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx    # For vector operations
SUPABASE_ANON_KEY=xxx            # For Q&A history only

# Option 3: ChromaDB (Local development - fallback)
CHROMA_HOST=localhost
CHROMA_PORT=8000
```

**Priority**: If `VECTOR_FILE_URL` is set, it takes precedence over Supabase and ChromaDB.

## Code Architecture

### Backend Structure (`src/`)

```
src/
├── index.ts                  # CLI entry point (commands: ask, reindex)
├── pipeline/
│   ├── runPipeline.ts        # Orchestrates full data pipeline
│   └── steps/
│       └── preprocessText.ts # Refines raw data for NLP
├── data_sources/
│   ├── github/               # GitHub API integrations
│   │   ├── fetchCommit.ts    # Fetch all commits
│   │   ├── fetchFiles.ts     # Fetch changed files per commit
│   │   └── fetchRepositoryFiles.ts  # Fetch all source code files
├── nlp/embedding/
│   └── openaiEmbedding.ts    # Embedding generation (OpenAI → Chroma fallback)
├── vector_store/
│   ├── saveVectors.ts        # Save to ChromaDB
│   └── searchVectors.ts      # Query ChromaDB
├── qa/
│   └── answer.ts             # LLM answer generation (OpenAI → Claude fallback)
└── server/                   # API Server (:3001)
    ├── index.ts              # Express server setup
    ├── routes/               # API endpoints
    │   ├── ask.ts            # POST /api/ask - Q&A endpoint
    │   ├── health.ts         # GET /api/health - Health checks & status
    │   └── history.ts        # GET /api/history - Q&A history
    └── services/
        └── supabase.ts       # Supabase client
```

**Key Pipeline Steps:**
1. `fetchAllCommits()` - Get commit list from GitHub
2. `fetchFiles()` - Get changed files per commit (includes patch/diff from GitHub API)
3. `fetchRepositoryFiles()` - Get all source code (for implementation questions)
4. `refineData()` - Convert to NLP format (separate commit/diff/file items)
5. `generateEmbeddings()` - Create vectors (OpenAI → Chroma fallback)
6. `saveVectors()` - Store in ChromaDB with metadata

**Repository File Collection:**
- Automatically fetches all source files from default branch (main/master auto-detected)
- Excludes: `node_modules`, `.git`, `dist`, `build`, binary files, files >500KB
- Splits large files (>5KB) into chunks to maintain context
- Metadata includes: path, type, size, extension, SHA, chunkIndex

### Frontend Structure (`frontend/src/`)

```
frontend/src/
├── api/
│   ├── client.ts             # Backend API wrapper (includes caching)
│   └── supabase.ts           # Direct Supabase client
├── components/
│   ├── common/
│   │   └── ServerStatus.tsx  # Header status indicator
│   ├── qa/                   # Q&A page components
│   └── dashboard/            # Dashboard components
├── pages/
│   ├── QAPage.tsx            # Main Q&A interface (/)
│   ├── DashboardPage.tsx     # Analytics dashboard (/dashboard)
│   └── SettingsPage.tsx      # Server control UI (/settings)
├── hooks/
│   └── useQueries.ts         # TanStack Query hooks
├── stores/
│   └── uiStore.ts            # Jotai atoms for UI state
├── types/
│   └── index.ts              # Shared TypeScript types
└── App.tsx                   # React Router setup
```

**State Management:**
- **TanStack Query** - Server state (Q&A history, dashboard stats, server status)
- **Jotai** - Client state (UI toggles, search filters)
- **Caching** - 1-minute cache for status checks, invalidated on server start/stop

**API Client Features:**
- Automatic retry with fallback
- Silent mode for health checks (returns null on error)
- Request deduplication and caching
- Environment-aware URLs (`VITE_API_URL`, `VITE_CONTROL_URL`)

### TypeScript Configuration

- **Module System:** ESM (`"type": "module"` in package.json, `module: "nodenext"`)
- **Imports:** All imports use `.js` extensions (required for ESM)
- **Strict Mode:** Enabled with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`

## Data Model

### Vector Store Items

ChromaDB stores two types of items:

**Type 1: Commit Items**
```typescript
{
  type: 'commit',
  id: 'commit-<sha>',
  content: '<message> | Files: <file1>, <file2>...',
  metadata: {
    type: 'commit',
    sha: string,
    author: string,
    date: string,
    message: string,
    fileCount: number
  }
}
```

**Type 2: File Items (Source Code)** ⭐ NEW
```typescript
{
  type: 'file',
  id: 'file-<sha>-<index>',
  content: '<path>: <file content or chunk>',
  metadata: {
    type: 'file',
    path: string,
    fileType: string,  // e.g., 'src', 'config', 'docs'
    size: number,
    extension: string,
    chunkIndex?: number,      // If file was split
    totalChunks?: number
  }
}
```

### API Response Types

**Q&A Response:**
```typescript
{
  answer: string,
  sources: Array<{
    type: 'commit' | 'file',
    content: string,
    metadata: Record<string, any>,
    score: number
  }>,
  category: string,        // Question type classification
  confidence: number,      // 0-1 confidence score
  processingTime: number,  // Milliseconds
  status: 'success' | 'partial' | 'failed'
}
```

## Common Development Patterns

### Adding a New API Endpoint

1. Define route in `src/server/routes/yourRoute.ts`
2. Register in `src/server/index.ts`: `app.use('/api/your-route', yourRouter)`
3. Add client method in `frontend/src/api/client.ts`
4. Add type definitions in `frontend/src/types/index.ts`
5. Create TanStack Query hook in `frontend/src/hooks/useQueries.ts`

### Adding a New Pipeline Step

1. Create processor in `src/pipeline/steps/yourStep.ts`
2. Import and call in `src/pipeline/runPipeline.ts` (mind the async execution order)
3. Update `PipelineOutput` type in `src/models/PipelineOutput.ts`
4. Update `refineData()` in `src/pipeline/steps/preprocessText.ts` if new data type

### Handling Embedding Provider Changes

When switching between OpenAI and Chroma embeddings (different dimensions):
```bash
pnpm run reindex  # Uses existing refined_data.json, regenerates embeddings
```
This avoids re-fetching data from GitHub/Git.

## Testing & Debugging

### Verify Server Status
```bash
# Check all services
curl http://localhost:8000/api/v1/heartbeat     # ChromaDB
curl http://localhost:3001/api/health           # API server
curl http://localhost:3001/api/health/chromadb  # API → ChromaDB check
curl http://localhost:3001/api/health/status    # All servers status
```

### Test Q&A Flow
```bash
# CLI mode (fastest)
pnpm run ask "프로젝트의 기술스택은?"

# Or via HTTP
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "프로젝트의 기술스택은?"}'
```

### Check Vector Collection
```bash
# View ChromaDB collections
curl http://localhost:8000/api/v1/collections
```

### Common Issues

**"Found 0 relevant documents"**
- Cause: Embedding dimension mismatch (switched between OpenAI ↔ Chroma)
- Fix: `pnpm run reindex`

**"API 서버에 연결할 수 없습니다"**
- Check if both servers are running (ChromaDB, API)
- Verify ports 8000, 3001 are available
- Check `.env` configuration

**"답변을 생성할 수 없습니다"**
- Verify at least one API key is set (`OPENAI_API_KEY` or `CLAUDE_API_KEY`)
- Check API quota/billing
- Review server logs for detailed error

## Deployment Notes

**Local Development:**
- ChromaDB and API servers running locally
- Settings page shows read-only server status

**Production (Vercel):**
- Only API server deployed
- ChromaDB must be hosted separately (e.g., via Docker on cloud VM)
- Settings page shows read-only status

**Environment Variables:**
- Set `VITE_API_URL` to point to deployed API server
- ChromaDB URL must be updated in API server config if not localhost

## Frontend Pages

### `/` - Q&A Page
ChatGPT-style interface with:
- Question input with natural language support
- Streaming-style response rendering
- Source citations (files + commits)
- Question history sidebar with search

### `/dashboard` - Dashboard
Analytics showing:
- Total questions, success rate, avg response time
- Daily query trends (line chart)
- Question category distribution (pie chart)
- Data source contributions

### `/settings` - Settings Page
Server status monitoring:
- Read-only status cards for ChromaDB, API Server, Supabase
- Environment information
- Connection diagnostics

## Update README.md
When all tasks described in claude.md are fully completed, update the root-level README.md to reflect the latest project state.

The README.md update must:

Accurately summarize the completed work (no planned or in-progress items).

Reflect any changes in architecture, setup steps, scripts, or workflows introduced by the completed tasks.

Keep existing sections unless they are no longer valid, in which case revise or remove them explicitly.

Ensure the content is consistent with the current repository structure and configuration.

Do not update README.md before all tasks in claude.md are finished.

## Documentation Structure Rule

The repository must keep only the following reference documents at the root level:

CLAUD.md

README.md

All other documentation files must be placed under the docs/ directory.

Documentation rules:

Do not create or keep any additional .md or documentation files in the root directory.

Organize documents inside docs/ by purpose or structure (e.g. docs/architecture/, docs/api/, docs/setup/).

Create new subdirectories under docs/ when necessary to maintain clear structural separation.

Ensure each document is placed in the most appropriate subdirectory based on its content.

If a document is mistakenly created outside docs/ (except CLAUD.md and README.md), it must be moved to the correct location under docs/.