/**
 * 최근 응답 속도 테스트 스크립트
 * API 응답 구조를 확인하고 문제를 진단합니다.
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';

async function testResponseTime() {
  console.log('🔍 최근 응답 속도 테스트 시작...\n');
  console.log(`API URL: ${API_BASE_URL}\n`);

  try {
    // 1. API 서버 상태 확인
    console.log('1️⃣ API 서버 상태 확인...');
    const healthResponse = await fetch(`${API_BASE_URL}/api/health`);
    if (!healthResponse.ok) {
      console.error('❌ API 서버가 응답하지 않습니다.');
      return;
    }
    const health = await healthResponse.json();
    console.log('✅ API 서버 정상:', health);
    console.log('');

    // 2. 이력 조회 (최근 10개)
    console.log('2️⃣ 최근 이력 조회 (limit=10)...');
    const historyResponse = await fetch(`${API_BASE_URL}/api/history?limit=10`);
    
    if (!historyResponse.ok) {
      console.error(`❌ 이력 조회 실패: ${historyResponse.status} ${historyResponse.statusText}`);
      const errorText = await historyResponse.text();
      console.error('응답 내용:', errorText);
      return;
    }

    const history = await historyResponse.json();
    console.log(`✅ ${history.length}개의 이력 조회 성공\n`);

    if (history.length === 0) {
      console.log('⚠️ 이력 데이터가 없습니다.');
      return;
    }

    // 3. 첫 번째 레코드 상세 분석
    console.log('3️⃣ 첫 번째 레코드 상세 분석:');
    const firstRecord = history[0];
    console.log('전체 레코드 구조:');
    console.log(JSON.stringify(firstRecord, null, 2));
    console.log('');

    // 4. responseTimeMs 필드 확인
    console.log('4️⃣ responseTimeMs 필드 확인:');
    console.log(`- responseTimeMs: ${firstRecord.responseTimeMs}`);
    console.log(`- responseTimeMs 타입: ${typeof firstRecord.responseTimeMs}`);
    console.log(`- response_time_ms (snake_case): ${firstRecord.response_time_ms}`);
    console.log(`- response_time_ms 타입: ${typeof firstRecord.response_time_ms}`);
    console.log('');

    // 5. 모든 레코드의 responseTimeMs 확인
    console.log('5️⃣ 모든 레코드의 responseTimeMs 확인:');
    history.forEach((record: any, index: number) => {
      const responseTime = record.responseTimeMs ?? record.response_time_ms ?? 'N/A';
      const question = record.questionSummary || record.question_summary || record.question || 'N/A';
      console.log(`[${index + 1}] ${question.substring(0, 30)}... | responseTimeMs: ${responseTime}ms`);
    });
    console.log('');

    // 6. 문제 진단
    console.log('6️⃣ 문제 진단:');
    const hasResponseTimeMs = history.some((r: any) => r.responseTimeMs !== undefined);
    const hasResponseTimeMsSnake = history.some((r: any) => r.response_time_ms !== undefined);
    
    if (hasResponseTimeMs) {
      console.log('✅ responseTimeMs (camelCase) 필드가 존재합니다.');
    } else {
      console.log('❌ responseTimeMs (camelCase) 필드가 없습니다.');
    }

    if (hasResponseTimeMsSnake) {
      console.log('⚠️ response_time_ms (snake_case) 필드가 여전히 존재합니다.');
      console.log('   → 백엔드 변환이 제대로 작동하지 않을 수 있습니다.');
    } else {
      console.log('✅ response_time_ms (snake_case) 필드가 제거되었습니다.');
    }

    // 7. 실제 값 확인
    console.log('\n7️⃣ 실제 응답 시간 값:');
    const validRecords = history.filter((r: any) => {
      const time = r.responseTimeMs ?? r.response_time_ms;
      return time !== undefined && time !== null && time > 0;
    });
    
    if (validRecords.length > 0) {
      console.log(`✅ ${validRecords.length}개의 레코드에 유효한 응답 시간이 있습니다.`);
      validRecords.slice(0, 5).forEach((r: any, i: number) => {
        const time = r.responseTimeMs ?? r.response_time_ms;
        console.log(`   ${i + 1}. ${time}ms`);
      });
    } else {
      console.log('❌ 유효한 응답 시간 값이 없습니다.');
      console.log('   → 데이터베이스의 response_time_ms 값이 0이거나 null일 수 있습니다.');
    }

  } catch (error: any) {
    console.error('❌ 테스트 중 오류 발생:', error.message);
    console.error(error.stack);
  }
}

// 실행
testResponseTime().then(() => {
  console.log('\n✅ 테스트 완료');
  process.exit(0);
}).catch((error) => {
  console.error('❌ 테스트 실패:', error);
  process.exit(1);
});
