/**
 * Diff Entity 검색 테스트
 */
import dotenv from 'dotenv';
import { smartSearch, searchByType, classifyQueryIntent } from '../src/qa/searchStrategy.js';

dotenv.config();

const TEST_QUESTIONS = [
    // History 질문 (Commit 검색 예상)
    "언제 클로드를 도입했어?",
    "누가 README를 수정했어?",

    // Change 질문 (Diff 검색 예상)
    "API 라우팅이 어떻게 변경됐어?",
    "README에서 무엇이 바뀌었어?",

    // Implementation 질문 (File 검색 예상)
    "Express 서버는 어디서 시작해?",
    "API 라우터는 어디에 구현되어 있어?",

    // 복합 질문
    "클로드 도입 시 어떤 파일이 변경됐고, 현재 어디에 구현되어 있어?"
];

async function testDiffSearch() {
    console.log('🧪 Diff Entity 검색 테스트 시작...\n');

    const repoName = process.env.TARGET_REPO_NAME || 'portfolio';
    const collectionName = `${repoName}-commits`;

    for (const question of TEST_QUESTIONS) {
        console.log('='.repeat(80));
        console.log(`질문: "${question}"`);
        console.log('='.repeat(80));

        // 1. 의도 분류
        const { intent, entityTypes } = classifyQueryIntent(question);
        console.log(`의도: ${intent}`);
        console.log(`검색 타입: ${entityTypes.join(', ')}`);

        // 2. 스마트 검색
        const results = await smartSearch(collectionName, question, 3);

        console.log(`\n검색 결과: ${results.length}개`);
        results.forEach((result, idx) => {
            const type = result.metadata?.type || 'unknown';
            const typeIcon = type === 'commit' ? '📂' : type === 'diff' ? '🔄' : '📄';

            console.log(`\n[${idx + 1}] ${typeIcon} ${type.toUpperCase()}`);
            console.log(`    ID: ${result.id}`);
            console.log(`    Score: ${result.score.toFixed(4)}`);

            if (type === 'commit') {
                console.log(`    Message: ${result.metadata.message?.substring(0, 50)}...`);
                console.log(`    Author: ${result.metadata.author}`);
                console.log(`    Date: ${result.metadata.date}`);
            } else if (type === 'diff') {
                console.log(`    File: ${result.metadata.filePath}`);
                console.log(`    Type: ${result.metadata.diffType}`);
                console.log(`    Changes: +${result.metadata.fileAdditions} -${result.metadata.fileDeletions}`);
                console.log(`    Category: ${result.metadata.changeCategory}`);
            } else if (type === 'file') {
                console.log(`    Path: ${result.metadata.path}`);
                console.log(`    Type: ${result.metadata.fileType}`);
                console.log(`    Size: ${result.metadata.size} bytes`);
            }
        });

        console.log('\n');
    }

    // 타입별 검색 테스트
    console.log('='.repeat(80));
    console.log('타입별 검색 테스트:');
    console.log('='.repeat(80));

    const question = "README 변경";

    console.log(`\n질문: "${question}"`);

    console.log('\n[Commit만 검색]');
    const commitResults = await searchByType(collectionName, question, 'commit', 2);
    commitResults.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.metadata.message?.substring(0, 40)}... (${r.metadata.author})`);
    });

    console.log('\n[Diff만 검색]');
    const diffResults = await searchByType(collectionName, question, 'diff', 2);
    diffResults.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.metadata.filePath} (${r.metadata.diffType}, +${r.metadata.fileAdditions} -${r.metadata.fileDeletions})`);
    });

    console.log('\n[File만 검색]');
    const fileResults = await searchByType(collectionName, question, 'file', 2);
    fileResults.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.metadata.path} (${r.metadata.size} bytes)`);
    });

    console.log('\n✅ 테스트 완료!');
}

testDiffSearch().catch(console.error);
