# File-Based Vector Store for Serverless Deployment

This document explains the file-based vector store architecture that enables **zero-cost serverless deployment** by eliminating the need for a persistent ChromaDB server.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Cost Comparison](#cost-comparison)
- [Performance](#performance)
- [Setup Guide](#setup-guide)
- [Usage](#usage)
- [Deployment](#deployment)

---

## Overview

### Problem

Traditional vector databases like ChromaDB require a persistent server running 24/7:
- **Cost**: $20-50/month for managed hosting or cloud VM
- **Serverless Incompatibility**: Cannot run in stateless Lambda/Vercel functions
- **Cold Start Overhead**: Connection initialization adds 200-500ms

### Solution

File-based vector store with static file delivery:
- **Zero Server Cost**: Embeddings stored as static files on CDN
- **Serverless Compatible**: Pure read-only operations, no database connection
- **Fast Cold Starts**: File download + decompression in 100-300ms
- **Warm Start Optimization**: Memory caching with 5-minute TTL

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     OFFLINE (GitHub Actions)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Embedding Pipeline → Supabase pgvector (cloud storage)     │
│                                                                 │
│  2. Export Script → embeddings.json.gz (7.7MB → 2-3MB)         │
│                                                                 │
│  3. Upload to Vercel Blob or AWS S3 with CDN                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     ONLINE (Serverless API)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. User Query → Generate query embedding (OpenAI API)         │
│                                                                 │
│  2. Download embeddings.json.gz from CDN (cached in memory)    │
│                                                                 │
│  3. Brute-force cosine similarity search (50-150ms for 1250)   │
│                                                                 │
│  4. Return Top-K results → LLM generates answer                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### File Format

**embeddings.json.gz** structure:

```json
{
  "version": "1.0",
  "dimension": 1536,
  "count": 1250,
  "createdAt": "2025-12-31T12:00:00Z",
  "metadata": {
    "owner": "username",
    "repo": "repository-name"
  },
  "vectors": [
    {
      "id": "commit-abc123",
      "embedding": [0.123, -0.456, ...],  // 1536 dimensions
      "content": "feat: Add user authentication",
      "metadata": {
        "type": "commit",
        "sha": "abc123",
        "author": "user",
        "date": "2025-12-31"
      }
    },
    {
      "id": "file-def456-0",
      "embedding": [0.789, 0.012, ...],
      "content": "src/auth/login.ts: ...",
      "metadata": {
        "type": "file",
        "path": "src/auth/login.ts",
        "fileType": "src",
        "extension": "ts"
      }
    }
  ]
}
```

---

## Cost Comparison

### Option 1: ChromaDB Server (Traditional)

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| ChromaDB Server | AWS t3.small (2GB RAM) | $20-30 |
| Storage (10GB) | AWS EBS | $1-2 |
| **Total** | | **$21-32/month** |

### Option 2: File-Based (Serverless)

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Embeddings Storage (3MB gzip) | Vercel Blob / S3 | $0.01 |
| CDN Bandwidth (1000 requests) | Vercel / CloudFront | $0.10 |
| Serverless Function | Vercel / Lambda Free Tier | $0 |
| **Total** | | **~$0.11/month** |

**Savings: 99.5% cost reduction** ($32 → $0.11)

### Option 3: Supabase Vector (Cloud)

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Supabase Pro Plan | pgvector + Storage | $25 |
| Additional Storage (if >8GB) | Supabase | $0-5 |
| **Total** | | **$25-30/month** |

**Note**: Supabase is excellent for write-heavy workloads. For read-only production serving, file-based is more cost-effective.

---

## Performance

### Cold Start (First Request)

| Operation | Time | Details |
|-----------|------|---------|
| File Download | 50-100ms | 3MB from CDN (Vercel Blob/S3) |
| Gzip Decompression | 30-80ms | 3MB → 7.7MB JSON |
| JSON Parsing | 20-50ms | 1250 vectors × 1536 dims |
| Vector Search | 50-150ms | Brute-force cosine similarity |
| **Total** | **150-380ms** | Comparable to ChromaDB (200-500ms) |

### Warm Start (Cached Request)

| Operation | Time | Details |
|-----------|------|---------|
| Memory Cache Hit | 1ms | Check cache TTL (5 minutes) |
| Vector Search | 50-150ms | In-memory brute-force |
| **Total** | **51-151ms** | Faster than ChromaDB (100-300ms) |

### Search Algorithm

- **Brute-Force Cosine Similarity**: O(n) where n = number of vectors
- **Acceptable for small-medium datasets**: <10,000 vectors
- **Optimization**: Pre-compute HNSW index offline if needed (future enhancement)

**Example**: 1250 vectors × 1536 dimensions = ~50-150ms per query

---

## Setup Guide

### 1. Environment Variables

Add to `.env`:

```bash
# Vector Store Mode Selection (priority: File > Supabase > ChromaDB)
VECTOR_FILE_URL=https://your-cdn.com/embeddings.json.gz

# Optional: Vercel Blob (for export)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx

# Optional: AWS S3 (for export)
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_S3_BUCKET=my-embeddings-bucket
AWS_REGION=us-east-1
```

### 2. Install Dependencies

```bash
pnpm add -D @vercel/blob @aws-sdk/client-s3
```

### 3. Export Embeddings (One-Time Setup)

#### From Supabase:

```bash
pnpm tsx scripts/export-embeddings.ts --source supabase --upload vercel
```

#### From ChromaDB:

```bash
# ChromaDB must be running
pnpm run chroma:start

pnpm tsx scripts/export-embeddings.ts \
  --source chromadb \
  --collection portfolio-vectors \
  --upload vercel
```

#### Local File Only:

```bash
pnpm tsx scripts/export-embeddings.ts \
  --source supabase \
  --output output/embeddings.json \
  --compress
```

### 4. GitHub Actions (Automated Export)

The export workflow runs automatically after the embedding pipeline:

```yaml
# .github/workflows/export-embeddings.yml
on:
  workflow_run:
    workflows: ["Polling-based Embedding Pipeline"]
    types: [completed]
  workflow_dispatch:
  schedule:
    - cron: '30 0 * * *'  # Daily at 00:30 UTC
```

**Required GitHub Secrets**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BLOB_READ_WRITE_TOKEN` (Vercel Blob) or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`

---

## Usage

### Command Line (CLI)

The system automatically detects file-based mode via `VECTOR_FILE_URL`:

```bash
# Set environment variable
export VECTOR_FILE_URL=https://your-cdn.com/embeddings.json.gz

# Ask questions (uses file-based search)
pnpm run ask "프로젝트의 기술스택은?"
```

**Priority Order**:
1. **File-based** (if `VECTOR_FILE_URL` is set)
2. **Supabase** (if `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set)
3. **ChromaDB** (fallback to local server on port 8000)

### API Server

Start the server:

```bash
pnpm run server
```

The API automatically uses file-based search when `VECTOR_FILE_URL` is set:

```bash
curl -X POST http://localhost:3001/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "프로젝트의 기술스택은?"}'
```

### Programmatic Usage

```typescript
import { searchVectorsFromFile } from './service/vector-store/fileVectorStore.js';
import { generateQueryEmbedding } from './service/vector-store/embeddingService.js';

// 1. Generate query embedding
const queryEmbedding = await generateQueryEmbedding("프로젝트의 기술스택은?");

// 2. Search similar vectors
const results = await searchVectorsFromFile(queryEmbedding, 5, {
    threshold: 0.7,
    filterMetadata: { owner: "username", repo: "repository" }
});

// 3. Use results
console.log(`Found ${results.length} similar documents`);
results.forEach(result => {
    console.log(`[${result.score.toFixed(3)}] ${result.content}`);
});
```

---

## Deployment

### Vercel (Recommended)

#### 1. Deploy API

```bash
# Install Vercel CLI
pnpm add -g vercel

# Deploy
vercel
```

#### 2. Set Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```
VECTOR_FILE_URL=https://your-blob-url.vercel-storage.com/embeddings.json.gz
OPENAI_API_KEY=sk-proj-xxx
CLAUDE_API_KEY=sk-ant-xxx (optional fallback)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
```

#### 3. Update `VECTOR_FILE_URL` After Each Export

When GitHub Actions runs the export workflow:

```bash
# Output from workflow:
✅ Uploaded to Vercel Blob: https://xxx.vercel-storage.com/embeddings.json.gz

# Update environment variable in Vercel Dashboard
VECTOR_FILE_URL=https://xxx.vercel-storage.com/embeddings.json.gz
```

**Optional**: Use stable URLs with Vercel Blob's `pathname` parameter:

```typescript
const blob = await put('embeddings.json.gz', buffer, {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: false  // Use fixed pathname
});
```

### AWS Lambda + S3

#### 1. Export to S3

```bash
pnpm tsx scripts/export-embeddings.ts \
  --source supabase \
  --upload s3 \
  --bucket my-embeddings-bucket \
  --region us-east-1
```

#### 2. Set S3 Public Access

Enable public read for `embeddings.json.gz`:

```bash
aws s3api put-object-acl \
  --bucket my-embeddings-bucket \
  --key embeddings.json.gz \
  --acl public-read
```

#### 3. Use CloudFront CDN (Optional)

Create CloudFront distribution pointing to S3 bucket:

```
VECTOR_FILE_URL=https://d111111abcdef8.cloudfront.net/embeddings.json.gz
```

#### 4. Deploy Lambda Function

Package and deploy the API server as Lambda function with:
- Runtime: Node.js 20
- Memory: 1024MB (for vector operations)
- Timeout: 30s
- Environment variables: `VECTOR_FILE_URL`, `OPENAI_API_KEY`, etc.

---

## Advanced Configuration

### Cache Management

The file-based vector store uses memory caching with 5-minute TTL by default.

**Utility Functions**:

```typescript
import { clearVectorCache, getCacheStatus } from './service/vector-store/fileVectorStore.js';

// Clear cache manually (e.g., after updating embeddings)
clearVectorCache();

// Check cache status
const status = getCacheStatus();
console.log(`Cache ${status.isCached ? 'HIT' : 'MISS'}`);
console.log(`Age: ${status.ageMs}ms`);
```

**Customize Cache TTL**:

Edit `src/service/vector-store/fileVectorStore.ts`:

```typescript
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes instead of 5
```

### Search Optimization

**Adjust Top-K Results**:

```typescript
const results = await searchVectorsFromFile(queryEmbedding, 10); // Top 10 instead of 5
```

**Filter by Metadata**:

```typescript
const results = await searchVectorsFromFile(queryEmbedding, 5, {
    threshold: 0.75,  // Minimum similarity score (0-1)
    filterMetadata: {
        type: 'commit',      // Only commits, not files
        author: 'username'   // Specific author
    }
});
```

### Multiple Repositories

Store separate files per repository:

```bash
# Export repository 1
VECTOR_FILE_URL=https://cdn.com/repo1-embeddings.json.gz
pnpm tsx scripts/export-embeddings.ts --source supabase --upload vercel

# Export repository 2
VECTOR_FILE_URL=https://cdn.com/repo2-embeddings.json.gz
pnpm tsx scripts/export-embeddings.ts --source supabase --upload vercel
```

Dynamically select file based on query:

```typescript
const repoName = extractRepoFromQuery(question);
const vectorFileUrl = `https://cdn.com/${repoName}-embeddings.json.gz`;
process.env.VECTOR_FILE_URL = vectorFileUrl;

const results = await searchVectorsFromFile(queryEmbedding, 5);
```

---

## Troubleshooting

### Issue: "Failed to load vector index"

**Cause**: Invalid `VECTOR_FILE_URL` or network error

**Solution**:
```bash
# Test URL manually
curl https://your-cdn.com/embeddings.json.gz --output test.json.gz
gunzip test.json.gz
cat test.json | jq '.version'  # Should output "1.0"
```

### Issue: "Found 0 relevant documents"

**Cause**: Embedding dimension mismatch or empty file

**Solution**:
```bash
# Verify file contents
cat embeddings.json | jq '.dimension'  # Should be 1536 for OpenAI
cat embeddings.json | jq '.count'      # Should be >0
```

### Issue: "Slow cold start (>1s)"

**Cause**: Large file size or slow CDN

**Solution**:
- Verify gzip compression is working (file should be 2-3MB, not 7MB)
- Use CDN with edge caching (Vercel Blob, CloudFront)
- Consider splitting into multiple files if >5MB

### Issue: "Cache not working"

**Cause**: Serverless function cold start resets memory

**Solution**: This is expected behavior. Each cold start re-downloads the file. Optimize by:
- Using warm start-friendly platforms (Vercel has better warm start rates)
- Increasing function timeout to keep warm longer
- Using reserved concurrency (AWS Lambda) for always-warm instances

---

## Migration Guide

### From ChromaDB to File-Based

1. **Export existing ChromaDB vectors**:
   ```bash
   pnpm run chroma:start
   pnpm tsx scripts/export-embeddings.ts \
     --source chromadb \
     --collection portfolio-vectors \
     --upload vercel
   ```

2. **Update environment variables**:
   ```bash
   # .env
   VECTOR_FILE_URL=https://xxx.vercel-storage.com/embeddings.json.gz
   # Remove CHROMA_HOST and CHROMA_PORT
   ```

3. **Stop ChromaDB server**:
   ```bash
   pkill -f chroma
   ```

4. **Test**:
   ```bash
   pnpm run ask "test question"
   # Should show: 📊 Vector Store: File (Serverless)
   ```

### From Supabase to File-Based

1. **Export Supabase vectors**:
   ```bash
   pnpm tsx scripts/export-embeddings.ts \
     --source supabase \
     --upload vercel
   ```

2. **Keep Supabase for Q&A history** (optional):
   ```bash
   # .env
   VECTOR_FILE_URL=https://xxx.vercel-storage.com/embeddings.json.gz
   SUPABASE_URL=https://xxx.supabase.co  # For history storage only
   SUPABASE_ANON_KEY=xxx
   ```

3. **Test**:
   ```bash
   pnpm run ask "test question"
   # Vector search uses file, history saves to Supabase
   ```

---

## Best Practices

1. **Automated Export**: Use GitHub Actions to export after each embedding pipeline run
2. **CDN Caching**: Use edge-cached storage (Vercel Blob, CloudFront) for faster downloads
3. **Compression**: Always use gzip compression (60-70% size reduction)
4. **Version Management**: Include version field in JSON for schema evolution
5. **Monitoring**: Log cache hit/miss rates to optimize TTL settings
6. **Fallback**: Keep Supabase credentials as fallback if file download fails

---

## Future Enhancements

- **HNSW Index**: Pre-compute approximate nearest neighbor index for >10k vectors
- **Chunked Loading**: Split large files into chunks for faster initial load
- **Incremental Updates**: Delta files for new commits instead of full re-export
- **Multi-Language**: Support multiple embedding models per repository
- **Edge Functions**: Move vector search to edge compute for <50ms latency
