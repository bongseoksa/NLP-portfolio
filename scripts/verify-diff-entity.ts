/**
 * Diff Entity 분리 검증 스크립트
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function verifyDiffEntity() {
    console.log('🔍 Diff Entity 검증 시작...\n');

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

    // 타입별 카운트
    const commitCount = items.filter((item: any) => item.type === 'commit').length;
    const diffCount = items.filter((item: any) => item.type === 'diff').length;
    const fileCount = items.filter((item: any) => item.type === 'file').length;

    console.log(`총 ${items.length}개 엔티티:`);
    console.log(`  📂 Commit: ${commitCount}개 (히스토리)`);
    console.log(`  🔄 Diff: ${diffCount}개 (변경사항)`);
    console.log(`  📄 File: ${fileCount}개 (소스코드)`);

    if (diffCount === 0) {
        console.log('\n❌ Diff Entity가 생성되지 않았습니다!');
        return;
    }

    console.log('\n✅ Diff Entity가 정상적으로 생성되었습니다!');

    // Diff 샘플 분석
    console.log('\n' + '='.repeat(80));
    console.log('Diff Entity 샘플 (최대 3개):');
    console.log('='.repeat(80));

    const diffItems = items.filter((item: any) => item.type === 'diff');
    const sampleCount = Math.min(3, diffItems.length);

    for (let i = 0; i < sampleCount; i++) {
        const diff = diffItems[i];
        console.log(`\n[${i + 1}] ID: ${diff.id}`);
        console.log(`    Commit: ${diff.metadata.commitId}`);
        console.log(`    File: ${diff.metadata.filePath}`);
        console.log(`    Type: ${diff.metadata.diffType}`);
        console.log(`    Changes: +${diff.metadata.fileAdditions} -${diff.metadata.fileDeletions}`);
        console.log(`    Category: ${diff.metadata.changeCategory}`);
        if (diff.metadata.semanticHint) {
            console.log(`    Semantic Hints: ${JSON.parse(diff.metadata.semanticHint || '[]').join(', ')}`);
        }
        console.log(`    Content Preview: ${diff.content.substring(0, 150)}...`);
    }

    // Commit과 Diff 비교
    console.log('\n' + '='.repeat(80));
    console.log('Commit vs Diff 내용 비교:');
    console.log('='.repeat(80));

    const commitItems = items.filter((item: any) => item.type === 'commit');
    if (commitItems.length > 0) {
        const sampleCommit = commitItems[0];
        console.log('\n✅ Commit Entity (diff 포함 안됨):');
        console.log(`   ID: ${sampleCommit.id}`);
        console.log(`   Content에 "Diff Summary" 포함: ${sampleCommit.content.includes('Diff Summary')}`);
        console.log(`   Content에 "Patch:" 포함: ${sampleCommit.content.includes('Patch:')}`);
        console.log(`   Content에 "+++" 포함: ${sampleCommit.content.includes('+++')}`);

        if (sampleCommit.content.includes('Patch:') || sampleCommit.content.includes('+++')) {
            console.log('\n   ⚠️  경고: Commit content에 여전히 diff가 포함되어 있습니다!');
        } else {
            console.log('\n   ✅ Commit에서 diff가 성공적으로 분리되었습니다!');
        }
    }

    // 메타데이터 검증
    console.log('\n' + '='.repeat(80));
    console.log('메타데이터 검증:');
    console.log('='.repeat(80));

    const diffTypeDistribution = new Map<string, number>();
    const categoryDistribution = new Map<string, number>();

    diffItems.forEach((diff: any) => {
        const diffType = diff.metadata.diffType || 'unknown';
        const category = diff.metadata.changeCategory || 'unknown';

        diffTypeDistribution.set(diffType, (diffTypeDistribution.get(diffType) || 0) + 1);
        categoryDistribution.set(category, (categoryDistribution.get(category) || 0) + 1);
    });

    console.log('\nDiff 타입 분포:');
    diffTypeDistribution.forEach((count, type) => {
        console.log(`  ${type}: ${count}개`);
    });

    console.log('\n변경 카테고리 분포:');
    categoryDistribution.forEach((count, category) => {
        console.log(`  ${category}: ${count}개`);
    });

    // 최종 결과
    console.log('\n' + '='.repeat(80));
    console.log('검증 결과:');
    console.log('='.repeat(80));

    const hasCommit = commitCount > 0;
    const hasDiff = diffCount > 0;
    const hasFile = fileCount > 0;
    const allSeparated = hasCommit && hasDiff && hasFile;

    console.log(`✅ 3가지 엔티티 모두 존재: ${allSeparated ? 'YES' : 'NO'}`);
    console.log(`✅ Commit과 Diff 분리: ${hasDiff ? 'YES' : 'NO'}`);
    console.log(`✅ Diff 메타데이터 포함: ${diffItems.length > 0 && diffItems[0].metadata.commitId ? 'YES' : 'NO'}`);

    if (allSeparated) {
        console.log('\n🎉 Diff Entity 분리가 성공적으로 완료되었습니다!');
    } else {
        console.log('\n⚠️  일부 엔티티가 누락되었습니다.');
    }
}

verifyDiffEntity().catch(console.error);
