#!/usr/bin/env tsx
/**
 * API Test Script
 * API 서버 없이 핵심 로직을 직접 테스트
 */

import dotenv from 'dotenv';
dotenv.config();

import { generateQueryEmbedding } from '../shared/services/vector-store/embeddingService.js';
import { searchSimilar, getVectorStats } from '../shared/services/vector-store/fileVectorStore.js';
import { generateAnswer } from '../shared/services/qa/answer.js';

async function testAPI() {
  console.log('🧪 API Integration Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Test 1: Vector Stats (Health Check)
    console.log('📊 Test 1: Vector Stats (Health Check)');
    const stats = await getVectorStats();
    console.log('   ✅ Vector store loaded successfully');
    console.log(`   - Total vectors: ${stats.totalVectors}`);
    console.log(`   - Commit embeddings: ${stats.commitCount}`);
    console.log(`   - File embeddings: ${stats.fileCount}`);
    console.log(`   - Q&A embeddings: ${stats.qaCount}`);
    console.log('');

    // Test 2: Query Embedding
    console.log('🔢 Test 2: Query Embedding Generation');
    const testQuestion = '이 프로젝트의 기술 스택은 무엇인가요?';
    console.log(`   Question: "${testQuestion}"`);

    const startEmbedding = Date.now();
    const embedding = await generateQueryEmbedding(testQuestion);
    const embeddingTime = Date.now() - startEmbedding;

    console.log(`   ✅ Embedding generated in ${embeddingTime}ms`);
    console.log(`   - Dimensions: ${embedding.length}`);
    console.log(`   - First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log('');

    // Test 3: Vector Search
    console.log('🔍 Test 3: Vector Search');
    const startSearch = Date.now();
    const sources = await searchSimilar(embedding, 5);
    const searchTime = Date.now() - startSearch;

    console.log(`   ✅ Search completed in ${searchTime}ms`);
    console.log(`   - Found ${sources.length} results`);
    console.log('');

    sources.forEach((s, i) => {
      console.log(`   [${i + 1}] Score: ${(s.score * 100).toFixed(1)}% | Type: ${s.type}`);
      console.log(`       ${s.content.substring(0, 80)}...`);
    });
    console.log('');

    // Test 4: Answer Generation
    console.log('💬 Test 4: Answer Generation (LLM)');
    const startAnswer = Date.now();
    const answer = await generateAnswer(testQuestion, sources);
    const answerTime = Date.now() - startAnswer;

    console.log(`   ✅ Answer generated in ${answerTime}ms`);
    console.log('');
    console.log('   📝 Answer:');
    console.log('   ─────────────────────────────────────');
    console.log(`   ${answer.split('\n').join('\n   ')}`);
    console.log('   ─────────────────────────────────────');
    console.log('');

    // Summary
    const totalTime = embeddingTime + searchTime + answerTime;
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All tests passed!');
    console.log(`   Total processing time: ${totalTime}ms`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testAPI();
