/**
 * 마이그레이션 검증 스크립트
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyMigration() {
    console.log('🔍 마이그레이션 검증 시작...\n');

    let allPassed = true;

    // Test 1: 카테고리 분포 확인
    console.log('='.repeat(80));
    console.log('Test 1: 카테고리 분포 확인');
    console.log('='.repeat(80));

    const { data: allData, error: fetchError } = await supabase
        .from('qa_history')
        .select('category');

    if (fetchError) {
        console.error('❌ 데이터 조회 실패:', fetchError.message);
        allPassed = false;
    } else {
        const categoryMap = new Map<string, number>();
        allData?.forEach(row => {
            categoryMap.set(row.category, (categoryMap.get(row.category) || 0) + 1);
        });

        console.log('\n현재 카테고리 분포:');
        Array.from(categoryMap.entries())
            .sort((a, b) => b[1] - a[1])
            .forEach(([category, count]) => {
                const percentage = ((count / (allData?.length || 1)) * 100).toFixed(1);
                console.log(`  📂 ${category}: ${count}개 (${percentage}%)`);
            });

        // 허용된 카테고리만 있는지 확인
        const allowedCategories = new Set([
            'issue', 'implementation', 'structure', 'history', 'data',
            'planning', 'status', 'techStack', 'cs', 'testing', 'summary', 'etc'
        ]);

        const invalidCategories = Array.from(categoryMap.keys())
            .filter(cat => !allowedCategories.has(cat));

        if (invalidCategories.length > 0) {
            console.log('\n❌ 허용되지 않은 카테고리 발견:', invalidCategories);
            allPassed = false;
        } else {
            console.log('\n✅ 모든 카테고리가 새로운 스키마와 일치합니다.');
        }
    }

    // Test 2: 새로운 카테고리로 질문 저장 테스트
    console.log('\n' + '='.repeat(80));
    console.log('Test 2: 새로운 카테고리로 데이터 삽입 테스트');
    console.log('='.repeat(80));

    const testRecord = {
        question: '[테스트] 프로젝트의 React 버전은?',
        question_summary: '[테스트] React 버전 확인',
        answer: '테스트 답변입니다.',
        category: 'techStack',
        category_confidence: 1.0,
        sources: [],
        status: 'success',
        response_time_ms: 100,
        token_usage: 0,
    };

    const { data: insertData, error: insertError } = await supabase
        .from('qa_history')
        .insert(testRecord)
        .select()
        .single();

    if (insertError) {
        console.log('\n❌ 삽입 실패:', insertError.message);
        allPassed = false;
    } else {
        console.log('\n✅ 새로운 카테고리로 데이터 삽입 성공!');
        console.log('   삽입된 ID:', insertData.id);
        console.log('   카테고리:', insertData.category);

        // 삽입한 테스트 데이터 삭제
        await supabase.from('qa_history').delete().eq('id', insertData.id);
        console.log('   (테스트 데이터 삭제 완료)');
    }

    // Test 3: 다양한 카테고리 삽입 테스트
    console.log('\n' + '='.repeat(80));
    console.log('Test 3: 12개 카테고리 모두 삽입 가능한지 테스트');
    console.log('='.repeat(80));

    const allCategories = [
        'issue', 'implementation', 'structure', 'history', 'data',
        'planning', 'status', 'techStack', 'cs', 'testing', 'summary', 'etc'
    ];

    const testRecords = allCategories.map(cat => ({
        question: `[테스트] ${cat} 카테고리 테스트`,
        question_summary: `${cat} 테스트`,
        answer: '테스트 답변',
        category: cat,
        category_confidence: 1.0,
        sources: [],
        status: 'success' as const,
        response_time_ms: 100,
        token_usage: 0,
    }));

    const { data: bulkInsertData, error: bulkInsertError } = await supabase
        .from('qa_history')
        .insert(testRecords)
        .select();

    if (bulkInsertError) {
        console.log('\n❌ 일괄 삽입 실패:', bulkInsertError.message);
        allPassed = false;
    } else {
        console.log(`\n✅ 12개 카테고리 모두 삽입 성공!`);
        console.log('   삽입된 레코드 수:', bulkInsertData?.length);

        // 삽입한 테스트 데이터 모두 삭제
        if (bulkInsertData && bulkInsertData.length > 0) {
            const testIds = bulkInsertData.map(r => r.id);
            await supabase.from('qa_history').delete().in('id', testIds);
            console.log('   (테스트 데이터 모두 삭제 완료)');
        }
    }

    // 최종 결과
    console.log('\n' + '='.repeat(80));
    if (allPassed) {
        console.log('✅ 모든 검증 테스트 통과!');
        console.log('✅ 마이그레이션이 성공적으로 완료되었습니다.');
    } else {
        console.log('❌ 일부 테스트 실패');
        console.log('⚠️  마이그레이션 SQL을 Supabase SQL Editor에서 실행해주세요.');
        console.log('   파일: supabase/migrations/001_update_category_enum.sql');
    }
    console.log('='.repeat(80));
}

verifyMigration().catch(console.error);
