/**
 * 최종 테스트: 변환 후 응답 확인
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';

async function testFinal() {
  console.log('🔍 최종 테스트: 변환 후 응답 확인\n');

  try {
    const response = await fetch(`${API_BASE_URL}/api/history?limit=3`);
    const data = await response.json();

    console.log('✅ 응답 받음:', data.length, '개 레코드\n');

    data.forEach((record: any, index: number) => {
      console.log(`[${index + 1}] 레코드:`);
      console.log(`  - responseTimeMs: ${record.responseTimeMs} (타입: ${typeof record.responseTimeMs})`);
      console.log(`  - response_time_ms: ${record.response_time_ms} (타입: ${typeof record.response_time_ms})`);
      console.log(`  - question: ${(record.question || '').substring(0, 30)}...`);
      console.log('');
    });

    // 검증
    const hasCamelCase = data.some((r: any) => r.responseTimeMs !== undefined && r.responseTimeMs !== null);
    const hasSnakeCase = data.some((r: any) => r.response_time_ms !== undefined && r.response_time_ms !== null);

    console.log('📊 검증 결과:');
    console.log(`  - responseTimeMs (camelCase) 존재: ${hasCamelCase ? '✅' : '❌'}`);
    console.log(`  - response_time_ms (snake_case) 존재: ${hasSnakeCase ? '⚠️ (제거되어야 함)' : '✅'}`);

    if (hasCamelCase && !hasSnakeCase) {
      console.log('\n✅ 성공! 변환이 정상적으로 작동합니다.');
    } else if (hasCamelCase && hasSnakeCase) {
      console.log('\n⚠️ 변환은 되었지만 snake_case가 여전히 존재합니다. (문제 없음)');
    } else {
      console.log('\n❌ 변환이 작동하지 않습니다. 서버를 재시작했는지 확인하세요.');
    }

  } catch (error: any) {
    console.error('❌ 오류:', error.message);
  }
}

testFinal();
