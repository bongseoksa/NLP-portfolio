/**
 * 현재 qa_history 테이블의 카테고리 분석 스크립트
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeCategories() {
    console.log('📊 현재 qa_history 테이블 카테고리 분석 중...\n');

    // 1. 카테고리별 집계
    const { data: allData, error } = await supabase
        .from('qa_history')
        .select('category, question, created_at');

    if (error) {
        console.error('❌ 데이터 조회 실패:', error.message);
        return;
    }

    if (!allData || allData.length === 0) {
        console.log('⚠️ 데이터가 없습니다.');
        return;
    }

    // 카테고리별 집계
    const categoryMap = new Map<string, { count: number; samples: Array<{ question: string; date: string }> }>();

    allData.forEach((row) => {
        const category = row.category || 'null';
        if (!categoryMap.has(category)) {
            categoryMap.set(category, { count: 0, samples: [] });
        }
        const cat = categoryMap.get(category)!;
        cat.count++;
        if (cat.samples.length < 3) {
            cat.samples.push({
                question: row.question,
                date: row.created_at
            });
        }
    });

    // 결과 출력
    console.log('='.repeat(80));
    console.log('카테고리별 분포:');
    console.log('='.repeat(80));

    const sortedCategories = Array.from(categoryMap.entries())
        .sort((a, b) => b[1].count - a[1].count);

    sortedCategories.forEach(([category, data]) => {
        const percentage = ((data.count / allData.length) * 100).toFixed(1);
        console.log(`\n📂 ${category}: ${data.count}개 (${percentage}%)`);
        console.log('   샘플 질문:');
        data.samples.forEach((sample, idx) => {
            console.log(`   ${idx + 1}. "${sample.question.substring(0, 50)}${sample.question.length > 50 ? '...' : ''}"`);
        });
    });

    console.log('\n' + '='.repeat(80));
    console.log(`총 ${allData.length}개의 질문이 저장되어 있습니다.`);
    console.log('='.repeat(80));

    // 마이그레이션 매핑 제안
    console.log('\n📋 권장 마이그레이션 매핑:');
    console.log('='.repeat(80));

    const mapping: Record<string, string> = {
        'planning': 'planning',      // 유지
        'technical': 'implementation', // 구현 관련
        'history': 'history',        // 유지
        'cs': 'cs',                  // 유지
        'status': 'status',          // 유지
        'unknown': 'etc',            // 기타
    };

    Object.entries(mapping).forEach(([oldCat, newCat]) => {
        const count = categoryMap.get(oldCat)?.count || 0;
        if (count > 0) {
            console.log(`'${oldCat}' → '${newCat}' (${count}개)`);
        }
    });
}

analyzeCategories().catch(console.error);
