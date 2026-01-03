# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub repository analyzer that uses NLP/RAG to answer questions about code structure, commit history, and implementation details. The system collects repository data, generates embeddings, stores vectors, and provides a Q&A interface powered by OpenAI or Claude.

**Tech Stack:**
- Backend: Node.js + TypeScript + Vercel Serverless Functions (ESM modules)
- Frontend: React 19 + TypeScript + Vite + PandaCSS
- State: Jotai (atoms) + TanStack Query (server state)
- Vector Storage: **File-based (Serverless)** / Supabase pgvector (Cloud)
- LLM: Claude Sonnet 4 (primary) / Gemini 1.5 Flash (fallback 1) / Mistral-7B (fallback 2)
- Embeddings: Hugging Face all-MiniLM-L6-v2 (384 dimensions)
- Storage: Supabase (Q&A history, embedding storage)

## Development Commands

### Backend (Root Directory)

```bash
# Setup & Infrastructure
pnpm install                    # Install dependencies
# Note: ChromaDB is deprecated and not used in the architecture

# Embedding Pipeline (Local)
pnpm run embed                  # Run embedding pipeline (incremental update)
pnpm run embed:reset            # Run embedding pipeline (full reset, re-process all commits)

# Export Embeddings
pnpm run local_export          # Export embeddings from Supabase to file (for serverless deployment)

# Servers
pnpm run server                # Start Vercel dev server (:3001) for Q&A and dashboard
pnpm run vercel:dev            # Alternative: Start Vercel dev server (auto port)

# Build
pnpm run build                 # Compile TypeScript to dist/
pnpm run start                 # Run compiled JS from dist/
```

**Embedding Pipeline Commands:**
- `pnpm run embed`: Fetches commits and files from GitHub repositories (defined in `target-repos.json`), generates embeddings using Hugging Face all-MiniLM-L6-v2, and stores them in Supabase. Only processes new commits since last run (incremental update).
- `pnpm run embed:reset`: Same as above but resets commit state and re-processes all commits from scratch.
- `pnpm run local_export`: Exports all embeddings from Supabase to `output/embeddings.json.gz` file for serverless deployment.


### Frontend (Root Directory)

```bash
pnpm install                   # Install all dependencies (backend + frontend)
pnpm run dev:frontend          # Start dev server (:5173)
pnpm run build:frontend         # Production build (includes PandaCSS codegen)
pnpm run preview:frontend       # Preview production build
pnpm run panda                 # Generate PandaCSS utility classes
```

## System Architecture

### Vector Storage Modes (Priority: File > Supabase)

The system supports **two vector storage modes** with automatic detection:

**1. File-Based (Local/GitHub - Recommended for Production)** 🌟
   - Zero server cost (completely free)
   - Serverless compatible (Vercel, Lambda)
   - Static file stored in Git repository (`output/embeddings.json.gz`)
   - Delivered via GitHub Raw URL (no CDN cost)
   - Memory cached with 5-minute TTL
   - Cold start: 150-380ms, Warm start: 51-151ms
   - Enabled by: `VECTOR_FILE_URL` environment variable (or defaults to `output/embeddings.json.gz`)

**2. Supabase pgvector (Cloud - For Embedding Pipeline)**
   - Managed PostgreSQL with pgvector extension
   - Used during embedding generation (write operations)
   - $25-30/month for Pro plan
   - Enabled by: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
   - **Note**: Not used for Q&A queries (file-based is used instead)

### Required Services

**Production (Serverless)**:
- Vercel Serverless Functions (15 API endpoints in `api/` directory)
- GitHub repository (for hosting `output/embeddings.json.gz`)
- No persistent database servers required
- No CDN costs

**Local Development**:
- Vercel Dev Server (port 3001) - runs serverless functions locally
- Supabase connection (for embedding pipeline only)
- Local embeddings file (`output/embeddings.json.gz`)

### Data Flow

**Pipeline Mode (Offline - runs in GitHub Actions weekly):**
```
GitHub API → Fetch commits + files (with patch) + repository source code
         ↓
Data Refinement → Convert to NLP-friendly format (commit + diff + file types)
         ↓
Embedding Generation → OpenAI text-embedding-3-small
         ↓
Vector Storage → Supabase pgvector (Cloud)
         ↓
Export to File → embeddings.json.gz → output/ directory
         ↓
Git Commit → Push to repository (automated via GitHub Actions)
```

**Q&A Mode (Online - serverless API):**
```
User Question → Generate query embedding (OpenAI)
            ↓
Load Vector File → output/embeddings.json.gz (local file or GitHub Raw URL)
            ↓
Vector Search → Brute-force cosine similarity (in-memory)
            ↓
Retrieve Top-K similar documents (commits + files + Q&A history)
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
- OpenAI `text-embedding-3-small` (1536 dimensions)
- No fallback (OpenAI API key required for embedding generation)

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

# Vector Storage Mode:

# Option 1: Local file (Default - Zero cost)
# No configuration needed - uses output/embeddings.json.gz by default

# Option 2: Remote file (GitHub Raw URL or custom CDN)
VECTOR_FILE_URL=https://raw.githubusercontent.com/owner/repo/main/output/embeddings.json.gz

# Supabase (Required for embedding pipeline, optional for Q&A history)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx    # For embedding pipeline
SUPABASE_ANON_KEY=xxx            # For Q&A history only
```

**Note**:
- Q&A queries **always** use file-based vector search (local or remote)
- Supabase is **only** used for embedding generation pipeline and Q&A history storage

## Code Architecture

### Backend Structure

```
api/                                    # Vercel serverless functions
├── ask.ts                             # POST /api/ask - Q&A endpoint
├── health/
│   ├── index.ts                       # GET /api/health
│   ├── chromadb.ts                    # GET /api/health/chromadb
│   └── status.ts                      # GET /api/health/status
├── history/
│   ├── index.ts                       # GET /api/history
│   ├── [id].ts                        # GET /api/history/:id
│   └── session/
│       └── [sessionId].ts             # GET /api/history/session/:sessionId
├── dashboard/
│   ├── summary.ts                     # GET /api/dashboard/summary
│   ├── daily.ts                       # GET /api/dashboard/daily
│   ├── categories.ts                  # GET /api/dashboard/categories
│   └── sources.ts                     # GET /api/dashboard/sources
├── migration/
│   ├── status.ts                      # GET /api/migration/status
│   ├── run.ts                         # POST /api/migration/run
│   ├── ensure.ts                      # POST /api/migration/ensure
│   └── schema.ts                      # GET /api/migration/schema
└── _lib/                              # Shared utilities (not exposed as endpoints)
    ├── cors.ts                        # CORS configuration
    ├── errorHandler.ts                # Error handling
    ├── responseFormatter.ts           # Response formatting
    └── healthCheck.ts                 # Health check logic

shared/                                # Shared libraries (API)
├── lib/                              # Business logic
│   ├── supabase.ts                   # Supabase client & operations
│   └── supabaseMigration.ts          # Database migrations
├── services/
│   ├── qa/
│   │   ├── answer.ts                 # LLM answer generation (shared)
│   │   └── classifier.ts             # Question classification
│   └── vector-store/
│       ├── fileVectorStore.ts        # File-based search (serverless)
│       ├── embeddingService.ts       # Query embedding generation
│       └── qaHistoryVectorStore.ts   # Q&A history vector management
└── models/                           # Type definitions (shared)
    ├── EmbeddingItem.ts
    ├── SearchResult.ts
    └── ...
```

**Key Pipeline Steps:**
1. `fetchAllCommits()` - Get commit list from GitHub
2. `fetchFiles()` - Get changed files per commit (includes patch/diff from GitHub API)
3. `fetchRepositoryFiles()` - Get all source code (for implementation questions)
4. `refineData()` - Convert to NLP format (separate commit/diff/file items)
5. `generateEmbeddings()` - Create vectors (OpenAI text-embedding-3-small)
6. `saveVectors()` - Store in Supabase pgvector
7. `exportEmbeddings()` - Export to embeddings.json.gz (GitHub Actions)

**Repository File Collection:**
- Automatically fetches all source files from default branch (main/master auto-detected)
- Excludes: `node_modules`, `.git`, `dist`, `build`, binary files, files >500KB
- Splits large files (>5KB) into chunks to maintain context
- Metadata includes: path, type, size, extension, SHA, chunkIndex

### Frontend Structure (`src/`)

```
src/
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

File-based vector store contains two types of items:

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

### Adding a New Serverless Endpoint

1. Create serverless function in `api/your-endpoint.ts` or `api/your-category/endpoint.ts`
2. Use file-based routing (Vercel convention):
   - `api/endpoint.ts` → `/api/endpoint`
   - `api/category/endpoint.ts` → `/api/category/endpoint`
   - `api/category/[id].ts` → `/api/category/:id` (dynamic route)
3. Import shared utilities from `api/_lib/` (CORS, error handling, etc.)
4. Import business logic from `src/lib/` (Supabase, migrations, etc.)
5. Add client method in `frontend/src/api/client.ts`
6. Add type definitions in `frontend/src/types/index.ts`
7. Create TanStack Query hook in `frontend/src/hooks/useQueries.ts`

**Example:**
```typescript
// api/example.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders, handleOptionsRequest } from './_lib/cors.js';
import { handleError } from './_lib/errorHandler.js';
import { getSupabaseClient } from '../src/lib/supabase.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return handleOptionsRequest(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Your logic here
    res.json({ success: true });
  } catch (error) {
    handleError(res, error, 'Operation failed');
  }
}
```

### Adding a New Pipeline Step

1. Create processor in `src/pipeline/steps/yourStep.ts`
2. Import and call in `src/pipeline/runPipeline.ts` (mind the async execution order)
3. Update `PipelineOutput` type in `src/models/PipelineOutput.ts`
4. Update `refineData()` in `src/pipeline/steps/preprocessText.ts` if new data type

## Testing & Debugging

### Verify Server Status
```bash
# Check API server
curl http://localhost:3001/api/health           # API server health
curl http://localhost:3001/api/health/status    # All services status
```

### Test Q&A Flow
```bash
# Via HTTP API
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "프로젝트의 기술스택은?"}'
```

### Check Vector File
```bash
# Verify local embeddings file
ls -lh output/embeddings.json.gz

# Inspect contents
zcat output/embeddings.json.gz | jq '.statistics'
zcat output/embeddings.json.gz | jq '.vectors | length'
```

### Common Issues

**"Failed to load vector file"**
- Cause: embeddings.json.gz not found
- Fix: Run export workflow or generate locally: `pnpm tsx scripts/export-embeddings.ts --source supabase --output output/embeddings.json.gz`

**"Found 0 relevant documents"**
- Cause: Empty or corrupted embeddings file
- Fix: Re-export embeddings from Supabase

**"API 서버에 연결할 수 없습니다"**
- Check if API server is running: `pnpm run server`
- Verify port 3001 is available
- Check `.env` configuration

**"답변을 생성할 수 없습니다"**
- Verify at least one API key is set (`OPENAI_API_KEY` or `CLAUDE_API_KEY`)
- Check API quota/billing
- Review server logs for detailed error

## Deployment Notes

**Local Development:**
- Vercel Dev Server running on port 3001 (`pnpm run server`)
- Runs serverless functions locally with same environment as production
- Uses local embeddings file (`output/embeddings.json.gz`)
- Settings page shows read-only server status

**Production (Vercel Serverless):**
- 15 serverless functions in `api/` directory deployed to Vercel
- File-based routing: `api/health/status.ts` → `/api/health/status`
- Uses GitHub Raw URL for embeddings:
  `VECTOR_FILE_URL=https://raw.githubusercontent.com/owner/repo/main/output/embeddings.json.gz`
- No persistent database servers required
- No Express server or Node.js runtime needed
- Total cost: $0/month (GitHub Free + Vercel Hobby)
- **Automatic deployment**: Pushes to `main` branch trigger automatic deployment via Vercel GitHub integration

**Environment Variables:**
- Frontend: Set `VITE_API_URL` to point to deployed API server
- Backend: Set `VECTOR_FILE_URL` to GitHub Raw URL or leave empty for local file

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
- Read-only status cards for API Server, Supabase
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

- `CLAUDE.md` (project instructions for Claude Code)
- `README.md` (project overview and setup)

All other documentation files must be placed under the `docs/` directory.

### Documentation Directory Structure

```
docs/
├── README.md                    # Documentation guide
├── 01_planning/                 # Planning documents
│   ├── 00_Product_Plan.md      # Final PRD (Product Requirements Document)
│   └── 01_Project_Specification_Archive.md  # Archived specifications
├── 02_architecture/             # Architecture design
│   ├── 01_System_Architecture.md
│   └── 02_Environment_Variables.md
├── 03_database/                 # Database schemas and docs
│   ├── 00_Schema_Documentation.md
│   └── [subdirectories for table-specific SQL files]
├── 04_ci-cd/                    # CI/CD workflows
│   └── 01_Workflows.md
├── 05_api/                      # API specifications and tests
│   └── ADR-*.md, TEST-*.md
└── 06_milestones/               # Project milestones
    └── 00_Project_Milestones.md
```

### Documentation Rules

1. **Root-level restrictions**
   - Do not create or keep any additional `.md` or documentation files in the root directory
   - Only `CLAUDE.md` and `README.md` are allowed at root level

2. **Directory organization**
   - Organize documents inside `docs/` by category using numbered prefixes (01_, 02_, etc.)
   - Create new subdirectories under `docs/` when necessary to maintain clear structural separation
   - Ensure each document is placed in the most appropriate subdirectory based on its content

3. **File naming convention**
   - Use numbered prefixes for ordered documents: `01_`, `02_`, etc.
   - Use descriptive names with underscores: `01_System_Architecture.md`
   - Archive files use higher numbers: `99_*_backup.md` or `01_*_Archive.md`

4. **Primary reference document**
   - The final PRD is always `docs/01_planning/00_Product_Plan.md`
   - Never rename this file to maintain consistency
   - Always keep it up-to-date with latest project specifications

5. **Moving misplaced files**
   - If a document is mistakenly created outside `docs/` (except CLAUDE.md and README.md), move it to the correct location under `docs/`
   - Update all internal references when moving files