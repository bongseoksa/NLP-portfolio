/**
 * 기존 질문들을 새로운 분류기로 재분류하는 스크립트
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { classifyQuestionWithConfidence } from '../shared/services/qa/classifier.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function reclassifyQuestions() {
    console.log('🔄 기존 질문 재분류 시작...\n');

    // 1. 모든 질문 가져오기
    const { data: questions, error } = await supabase
        .from('qa_history')
        .select('id, question, category, category_confidence');

    if (error) {
        console.error('❌ 데이터 조회 실패:', error.message);
        return;
    }

    if (!questions || questions.length === 0) {
        console.log('⚠️ 재분류할 질문이 없습니다.');
        return;
    }

    console.log(`총 ${questions.length}개 질문 재분류 중...\n`);

    // 2. 재분류 결과 분석
    const reclassificationResults: Array<{
        id: string;
        question: string;
        oldCategory: string;
        newCategory: string;
        confidence: number;
    }> = [];

    for (const q of questions) {
        const { category: newCategory, confidence } = classifyQuestionWithConfidence(q.question);

        reclassificationResults.push({
            id: q.id,
            question: q.question,
            oldCategory: q.category,
            newCategory,
            confidence,
        });
    }

    // 3. 재분류 결과 출력
    console.log('='.repeat(80));
    console.log('재분류 결과 미리보기:');
    console.log('='.repeat(80));

    reclassificationResults.forEach((result, idx) => {
        const changed = result.oldCategory !== result.newCategory ? '🔄' : '✓';
        console.log(`\n${idx + 1}. ${changed} "${result.question}"`);
        console.log(`   구분류: ${result.oldCategory} → 신분류: ${result.newCategory} (신뢰도: ${result.confidence.toFixed(2)})`);
    });

    // 4. 카테고리 분포 통계
    const newCategoryMap = new Map<string, number>();
    reclassificationResults.forEach(r => {
        newCategoryMap.set(r.newCategory, (newCategoryMap.get(r.newCategory) || 0) + 1);
    });

    console.log('\n' + '='.repeat(80));
    console.log('새로운 카테고리 분포:');
    console.log('='.repeat(80));

    Array.from(newCategoryMap.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([category, count]) => {
            const percentage = ((count / questions.length) * 100).toFixed(1);
            console.log(`📂 ${category}: ${count}개 (${percentage}%)`);
        });

    // 5. SQL 마이그레이션 생성
    console.log('\n' + '='.repeat(80));
    console.log('생성된 마이그레이션 SQL:');
    console.log('='.repeat(80));
    console.log('\n-- Step 1: 제약 조건 삭제');
    console.log('ALTER TABLE qa_history DROP CONSTRAINT IF EXISTS qa_history_category_check;\n');

    console.log('-- Step 2: 개별 질문 재분류 (질문 내용 기반)');
    reclassificationResults.forEach((result) => {
        if (result.oldCategory !== result.newCategory) {
            console.log(`UPDATE qa_history SET category = '${result.newCategory}', category_confidence = ${result.confidence} WHERE id = '${result.id}';`);
        }
    });

    console.log('\n-- Step 3: 새로운 제약 조건 추가');
    console.log(`ALTER TABLE qa_history
ADD CONSTRAINT qa_history_category_check
CHECK (category IN (
    'issue', 'implementation', 'structure', 'history', 'data',
    'planning', 'status', 'techStack', 'cs', 'testing', 'summary', 'etc'
));`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ 재분류 분석 완료!');
    console.log('='.repeat(80));
}

reclassifyQuestions().catch(console.error);
