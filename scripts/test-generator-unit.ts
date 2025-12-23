/**
 * Embedding Text Generator 단위 테스트
 *
 * 각 generator 함수가 제대로 작동하는지 개별적으로 테스트합니다.
 */
import {
    generateCommitEmbeddingText,
    generateDiffEmbeddingText,
    generateFileEmbeddingText
} from '../src/nlp/embedding/embeddingTextGenerator.js';
import type { RefinedItem } from '../src/models/refinedData.js';

console.log('🧪 Embedding Text Generator 단위 테스트\n');
console.log('='.repeat(80));

// Test 1: Commit Entity
console.log('\n📌 Test 1: Commit Entity Embedding Text Generation');
console.log('='.repeat(80));

const commitItem: RefinedItem = {
    id: 'commit-test123',
    type: 'commit',
    content: `Commit: test123
Author: John Doe
Date: 2025-01-01
Message: feat: Claude Code 통합 추가

Affected Files:
- README.md (modified) +10 -5
- package.json (modified) +3 -1`,
    embeddingText: '', // Will be generated
    metadata: {
        sha: 'test123',
        author: 'John Doe',
        date: '2025-01-01',
        message: 'feat: Claude Code 통합 추가',
        affectedFiles: ['README.md', 'package.json'],
        additions: 13,
        deletions: 6
    }
};

const commitEmbedding = generateCommitEmbeddingText(commitItem);
console.log('\n원본 Content (일부):');
console.log(commitItem.content.substring(0, 200));
console.log('\n생성된 Embedding Text:');
console.log(commitEmbedding);
console.log('\n품질 검증:');
console.log(`  ${commitEmbedding.includes('이 커밋은') ? '✅' : '❌'} 자연어 문장 시작`);
console.log(`  ${commitEmbedding.includes('작성자:') ? '✅' : '❌'} 작성자 정보 포함`);
console.log(`  ${commitEmbedding.includes('변경된 파일:') ? '✅' : '❌'} 파일 목록 포함`);
console.log(`  ${!commitEmbedding.includes('Affected Files:') ? '✅' : '❌'} 원시 포맷 제거`);

// Test 2: Diff Entity
console.log('\n📌 Test 2: Diff Entity Embedding Text Generation');
console.log('='.repeat(80));

const diffItem: RefinedItem = {
    id: 'diff-test123-routes-api.ts',
    type: 'diff',
    content: `Diff for File: routes/api.ts
Commit: test123
Changes: +15 -3

Patch:
@@ -10,3 +10,15 @@ import express from 'express';
+router.get('/api/data', async (req, res) => {
+    const data = await fetchData();
+    res.json(data);
+});`,
    embeddingText: '', // Will be generated
    metadata: {
        commitId: 'test123',
        filePath: 'routes/api.ts',
        diffType: 'modify',
        fileAdditions: 15,
        fileDeletions: 3,
        changeCategory: 'feat',
        semanticHint: ['함수/변수 정의', 'export 변경']
    }
};

const diffEmbedding = generateDiffEmbeddingText(diffItem);
console.log('\n원본 Content (일부):');
console.log(diffItem.content.substring(0, 200));
console.log('\n생성된 Embedding Text:');
console.log(diffEmbedding);
console.log('\n품질 검증:');
console.log(`  ${diffEmbedding.includes('파일에서') ? '✅' : '❌'} 파일 경로 언급`);
console.log(`  ${diffEmbedding.includes('변경 유형:') ? '✅' : '❌'} 변경 유형 설명`);
console.log(`  ${diffEmbedding.includes('변경 전:') || diffEmbedding.includes('변경 후:') ? '✅' : '❌'} Before/After 포함`);
console.log(`  ${diffEmbedding.includes('의미론적 변화:') ? '✅' : '❌'} 의미론적 힌트 포함`);

// Test 3: File Entity
console.log('\n📌 Test 3: File Entity Embedding Text Generation');
console.log('='.repeat(80));

const fileItem: RefinedItem = {
    id: 'file-src-server-index.ts-0',
    type: 'file',
    content: `File: src/server/index.ts
Type: src
Size: 2500 bytes
Extension: ts

Content:
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

export function startServer() {
    app.listen(PORT, () => {
        console.log(\`Server running on port \${PORT}\`);
    });
}

export { app };`,
    embeddingText: '', // Will be generated
    metadata: {
        path: 'src/server/index.ts',
        fileType: 'src',
        size: 2500,
        extension: 'ts',
        sha: 'file-sha-123'
    }
};

const fileEmbedding = generateFileEmbeddingText(fileItem);
console.log('\n원본 Content (일부):');
console.log(fileItem.content.substring(0, 200));
console.log('\n생성된 Embedding Text:');
console.log(fileEmbedding);
console.log('\n품질 검증:');
console.log(`  ${fileEmbedding.includes('이 파일은') ? '✅' : '❌'} 자연어 문장 시작`);
console.log(`  ${fileEmbedding.includes('기술 스택:') ? '✅' : '❌'} 기술 스택 추론`);
console.log(`  ${fileEmbedding.includes('제공하는 기능:') ? '✅' : '❌'} 기능 설명 포함`);
console.log(`  ${fileEmbedding.includes('Export') || fileEmbedding.includes('Import') ? '✅' : '❌'} Export/Import 분석`);
console.log(`  ${fileEmbedding.length < fileItem.content.length ? '✅' : '❌'} 코드 원문보다 짧음`);

// 최종 결과
console.log('\n' + '='.repeat(80));
console.log('🎉 모든 테스트 완료!');
console.log('='.repeat(80));
console.log('\n다음 단계:');
console.log('  1. pnpm run dev - 전체 파이프라인 실행');
console.log('  2. pnpm run test:embedding - 생성된 데이터 품질 검증');
console.log('  3. pnpm run ask "질문" - 실제 검색 품질 테스트');
