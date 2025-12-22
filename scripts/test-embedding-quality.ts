/**
 * Embedding 품질 검증 스크립트
 *
 * embeddingText가 제대로 생성되었는지, 자연어로 변환되었는지 확인합니다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testEmbeddingQuality() {
    console.log('🧪 Embedding 품질 검증 시작...\n');

    // refined_data.json 읽기
    const refinedDataPath = path.join(__dirname, '../refined_data.json');

    if (!fs.existsSync(refinedDataPath)) {
        console.error('❌ refined_data.json 파일이 없습니다.');
        console.log('   pnpm run dev를 먼저 실행하세요.');
        return;
    }

    const rawData = fs.readFileSync(refinedDataPath, 'utf-8');
    const data = JSON.parse(rawData);
    const items = data.items || [];

    console.log('='.repeat(80));
    console.log('전체 통계:');
    console.log('='.repeat(80));

    const commitCount = items.filter((item: any) => item.type === 'commit').length;
    const diffCount = items.filter((item: any) => item.type === 'diff').length;
    const fileCount = items.filter((item: any) => item.type === 'file').length;

    console.log(`총 ${items.length}개 엔티티:`);
    console.log(`  📂 Commit: ${commitCount}개`);
    console.log(`  🔄 Diff: ${diffCount}개`);
    console.log(`  📄 File: ${fileCount}개`);

    // embeddingText 필드 존재 확인
    const hasEmbeddingText = items.every((item: any) => 'embeddingText' in item);
    console.log(`\n✅ embeddingText 필드 존재: ${hasEmbeddingText ? 'YES' : 'NO'}`);

    if (!hasEmbeddingText) {
        console.log('\n❌ embeddingText 필드가 일부 아이템에 누락되었습니다!');
        return;
    }

    // embeddingText가 비어있지 않은지 확인
    const emptyEmbeddingTexts = items.filter((item: any) => !item.embeddingText || item.embeddingText.trim() === '');
    if (emptyEmbeddingTexts.length > 0) {
        console.log(`\n⚠️  경고: ${emptyEmbeddingTexts.length}개 아이템의 embeddingText가 비어있습니다!`);
    } else {
        console.log('\n✅ 모든 아이템이 embeddingText를 가지고 있습니다.');
    }

    // 샘플 품질 검증
    console.log('\n' + '='.repeat(80));
    console.log('Commit Entity 샘플 (최대 2개):');
    console.log('='.repeat(80));

    const commits = items.filter((item: any) => item.type === 'commit');
    for (let i = 0; i < Math.min(2, commits.length); i++) {
        const commit = commits[i];
        console.log(`\n[${i + 1}] Commit ID: ${commit.id}`);
        console.log(`    Message: ${commit.metadata.message?.substring(0, 50)}...`);
        console.log('\n    📄 Original Content (일부):');
        console.log(`    ${commit.content.substring(0, 150).replace(/\n/g, '\n    ')}...`);
        console.log('\n    ✨ Embedding Text (자연어 변환):');
        console.log(`    ${commit.embeddingText.substring(0, 300).replace(/\n/g, '\n    ')}...`);

        // 품질 체크
        const checks = {
            '자연어 문장 포함': commit.embeddingText.includes('이 커밋은') || commit.embeddingText.includes('변경사항'),
            '작성자 정보 포함': commit.embeddingText.includes('작성자:'),
            '변경 목적 설명': commit.embeddingText.includes('목적:') || commit.embeddingText.includes('위한'),
            '코드 패치 제외': !commit.embeddingText.includes('diff --git')
        };

        console.log('\n    품질 검증:');
        Object.entries(checks).forEach(([key, value]) => {
            console.log(`      ${value ? '✅' : '❌'} ${key}`);
        });
    }

    console.log('\n' + '='.repeat(80));
    console.log('Diff Entity 샘플 (최대 2개):');
    console.log('='.repeat(80));

    const diffs = items.filter((item: any) => item.type === 'diff');
    for (let i = 0; i < Math.min(2, diffs.length); i++) {
        const diff = diffs[i];
        console.log(`\n[${i + 1}] Diff ID: ${diff.id}`);
        console.log(`    File: ${diff.metadata.filePath}`);
        console.log(`    Type: ${diff.metadata.diffType}`);
        console.log('\n    📄 Original Content (일부):');
        console.log(`    ${diff.content.substring(0, 150).replace(/\n/g, '\n    ')}...`);
        console.log('\n    ✨ Embedding Text (자연어 변환):');
        console.log(`    ${diff.embeddingText.substring(0, 300).replace(/\n/g, '\n    ')}...`);

        // 품질 체크
        const checks = {
            '파일 경로 포함': diff.embeddingText.includes(diff.metadata.filePath),
            '변경 유형 설명': diff.embeddingText.includes('변경') || diff.embeddingText.includes('추가') || diff.embeddingText.includes('수정'),
            'Before/After 포함': diff.embeddingText.includes('변경 전:') && diff.embeddingText.includes('변경 후:'),
            '의미론적 힌트 포함': diff.embeddingText.includes('의미론적 변화') || diff.metadata.semanticHint
        };

        console.log('\n    품질 검증:');
        Object.entries(checks).forEach(([key, value]) => {
            console.log(`      ${value ? '✅' : '❌'} ${key}`);
        });
    }

    console.log('\n' + '='.repeat(80));
    console.log('File Entity 샘플 (최대 2개):');
    console.log('='.repeat(80));

    const files = items.filter((item: any) => item.type === 'file');
    for (let i = 0; i < Math.min(2, files.length); i++) {
        const file = files[i];
        console.log(`\n[${i + 1}] File ID: ${file.id}`);
        console.log(`    Path: ${file.metadata.path}`);
        console.log(`    Type: ${file.metadata.fileType}`);
        console.log('\n    📄 Original Content (일부):');
        console.log(`    ${file.content.substring(0, 150).replace(/\n/g, '\n    ')}...`);
        console.log('\n    ✨ Embedding Text (자연어 변환):');
        console.log(`    ${file.embeddingText.substring(0, 300).replace(/\n/g, '\n    ')}...`);

        // 품질 체크
        const checks = {
            '파일 경로 포함': file.embeddingText.includes(file.metadata.path),
            '기술 스택 추론': file.embeddingText.includes('기술 스택:'),
            '기능 설명 포함': file.embeddingText.includes('제공하는 기능:') || file.embeddingText.includes('담당'),
            'Export/Import 정보': file.embeddingText.includes('Export') || file.embeddingText.includes('Import'),
            '코드 원문 제외': file.embeddingText.length < file.content.length * 0.5 // 임베딩 텍스트가 원본보다 짧아야 함
        };

        console.log('\n    품질 검증:');
        Object.entries(checks).forEach(([key, value]) => {
            console.log(`      ${value ? '✅' : '❌'} ${key}`);
        });
    }

    // 전체 품질 점수 계산
    console.log('\n' + '='.repeat(80));
    console.log('전체 품질 검증:');
    console.log('='.repeat(80));

    const allChecks = [];

    // Content vs EmbeddingText 길이 비교
    const avgContentLength = items.reduce((sum: number, item: any) => sum + item.content.length, 0) / items.length;
    const avgEmbeddingTextLength = items.reduce((sum: number, item: any) => sum + item.embeddingText.length, 0) / items.length;

    console.log(`\n평균 Content 길이: ${avgContentLength.toFixed(0)} chars`);
    console.log(`평균 EmbeddingText 길이: ${avgEmbeddingTextLength.toFixed(0)} chars`);
    console.log(`압축률: ${((1 - avgEmbeddingTextLength / avgContentLength) * 100).toFixed(1)}%`);

    // 자연어 변환 확인
    const naturalLanguageCount = items.filter((item: any) => {
        const text = item.embeddingText.toLowerCase();
        return text.includes('이 ') || text.includes('파일') || text.includes('변경') || text.includes('커밋');
    }).length;

    console.log(`\n자연어 문장 포함: ${naturalLanguageCount}/${items.length} (${((naturalLanguageCount / items.length) * 100).toFixed(1)}%)`);

    // 코드 패치 제외 확인 (Diff 엔티티에서 원시 패치가 embeddingText에 포함되지 않아야 함)
    const diffWithPatch = diffs.filter((item: any) =>
        item.embeddingText.includes('diff --git') ||
        item.embeddingText.includes('@@') ||
        item.embeddingText.includes('+++') ||
        item.embeddingText.includes('---')
    ).length;

    console.log(`Diff 엔티티에서 코드 패치 제외: ${diffs.length - diffWithPatch}/${diffs.length} (${diffs.length > 0 ? (((diffs.length - diffWithPatch) / diffs.length) * 100).toFixed(1) : 0}%)`);

    // 최종 판정
    console.log('\n' + '='.repeat(80));

    const qualityScore = (
        (hasEmbeddingText ? 25 : 0) +
        (emptyEmbeddingTexts.length === 0 ? 25 : 0) +
        ((naturalLanguageCount / items.length) * 25) +
        (diffs.length > 0 ? ((diffs.length - diffWithPatch) / diffs.length) * 25 : 25)
    );

    console.log(`\n🎯 전체 품질 점수: ${qualityScore.toFixed(1)}/100`);

    if (qualityScore >= 90) {
        console.log('\n🎉 매우 우수! Embedding 최적화가 성공적으로 완료되었습니다!');
    } else if (qualityScore >= 70) {
        console.log('\n✅ 양호! 대부분의 embeddingText가 올바르게 생성되었습니다.');
    } else if (qualityScore >= 50) {
        console.log('\n⚠️  보통. 일부 개선이 필요합니다.');
    } else {
        console.log('\n❌ 불량. embeddingText 생성 로직을 점검해야 합니다.');
    }

    console.log('\n💡 다음 단계:');
    console.log('   1. pnpm run reindex - 새로운 embeddingText로 벡터 재생성');
    console.log('   2. pnpm run ask "질문" - 실제 검색 품질 테스트');
    console.log('   3. 검색 결과 품질 비교 (이전 vs 현재)');
}

testEmbeddingQuality().catch(console.error);
