/**
 * API 엔드포인트 테스트 스크립트
 * 
 * 질의응답 및 대시보드 API가 정상적으로 동작하는지 테스트합니다.
 */

import dotenv from 'dotenv';
dotenv.config();

// 로컬 개발 서버 우선 사용 (환경 변수보다 로컬 우선)
const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'success' | 'error';
  statusCode?: number;
  responseTime?: number;
  error?: string;
  data?: any;
}

async function testEndpoint(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<TestResult> {
  const startTime = Date.now();
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const responseTime = Date.now() - startTime;
    const data = await response.json().catch(() => null);

    return {
      endpoint,
      method,
      status: response.ok ? 'success' : 'error',
      statusCode: response.status,
      responseTime,
      data: data || null,
      error: response.ok ? undefined : `HTTP ${response.status}: ${data?.error || data?.message || 'Unknown error'}`,
    };
  } catch (error: any) {
    return {
      endpoint,
      method,
      status: 'error',
      error: error.message || 'Network error',
      responseTime: Date.now() - startTime,
    };
  }
}

async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5초 타임아웃
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function runTests() {
  console.log('🧪 API 엔드포인트 테스트 시작\n');
  console.log(`📍 API Base URL: ${API_BASE_URL}\n`);

  // 서버 연결 확인
  console.log('🔍 서버 연결 확인 중...');
  const serverOnline = await checkServerHealth();
  if (!serverOnline) {
    console.error('❌ 서버에 연결할 수 없습니다.');
    console.error(`   ${API_BASE_URL}에서 서버가 실행 중인지 확인해주세요.`);
    console.error('   서버 실행: pnpm run server');
    process.exit(1);
  }
  console.log('✅ 서버 연결 성공\n');

  const results: TestResult[] = [];

  // 1. Health Check
  console.log('1️⃣ Health Check 테스트...');
  const healthResult = await testEndpoint('/api/health');
  results.push(healthResult);
  console.log(healthResult.status === 'success' ? '✅' : '❌', healthResult.endpoint, `(${healthResult.responseTime}ms)`);
  if (healthResult.error) console.log('   Error:', healthResult.error);
  console.log('');

  // 2. Dashboard Summary
  console.log('2️⃣ Dashboard Summary 테스트...');
  const summaryResult = await testEndpoint('/api/dashboard/summary');
  results.push(summaryResult);
  console.log(summaryResult.status === 'success' ? '✅' : '❌', summaryResult.endpoint, `(${summaryResult.responseTime}ms)`);
  if (summaryResult.error) {
    console.log('   Error:', summaryResult.error);
  } else if (summaryResult.data) {
    console.log('   Data:', {
      totalQuestions: summaryResult.data.totalQuestions,
      successRate: summaryResult.data.successRate?.toFixed(1) + '%',
      averageResponseTimeMs: summaryResult.data.averageResponseTimeMs + 'ms',
    });
  }
  console.log('');

  // 3. Dashboard Daily
  console.log('3️⃣ Dashboard Daily 테스트...');
  const dailyResult = await testEndpoint('/api/dashboard/daily');
  results.push(dailyResult);
  console.log(dailyResult.status === 'success' ? '✅' : '❌', dailyResult.endpoint, `(${dailyResult.responseTime}ms)`);
  if (dailyResult.error) {
    console.log('   Error:', dailyResult.error);
  } else if (Array.isArray(dailyResult.data)) {
    console.log(`   Data: ${dailyResult.data.length}일치 데이터`);
  }
  console.log('');

  // 4. Dashboard Categories
  console.log('4️⃣ Dashboard Categories 테스트...');
  const categoriesResult = await testEndpoint('/api/dashboard/categories');
  results.push(categoriesResult);
  console.log(categoriesResult.status === 'success' ? '✅' : '❌', categoriesResult.endpoint, `(${categoriesResult.responseTime}ms)`);
  if (categoriesResult.error) {
    console.log('   Error:', categoriesResult.error);
  } else if (Array.isArray(categoriesResult.data)) {
    console.log(`   Data: ${categoriesResult.data.length}개 카테고리`);
  }
  console.log('');

  // 5. Dashboard Sources
  console.log('5️⃣ Dashboard Sources 테스트...');
  const sourcesResult = await testEndpoint('/api/dashboard/sources');
  results.push(sourcesResult);
  console.log(sourcesResult.status === 'success' ? '✅' : '❌', sourcesResult.endpoint, `(${sourcesResult.responseTime}ms)`);
  if (sourcesResult.error) {
    console.log('   Error:', sourcesResult.error);
  } else if (Array.isArray(sourcesResult.data)) {
    console.log(`   Data: ${sourcesResult.data.length}개 소스 타입`);
  }
  console.log('');

  // 6. Q&A Ask (테스트 질문)
  console.log('6️⃣ Q&A Ask 테스트...');
  const askResult = await testEndpoint('/api/ask', 'POST', {
    question: '프로젝트의 기술스택은 무엇인가요?',
  });
  results.push(askResult);
  console.log(askResult.status === 'success' ? '✅' : '❌', askResult.endpoint, `(${askResult.responseTime}ms)`);
  if (askResult.error) {
    console.log('   Error:', askResult.error);
  } else if (askResult.data) {
    console.log('   Answer:', askResult.data.answer?.substring(0, 100) + '...');
    console.log('   Sources:', askResult.data.sources?.length || 0, '개');
    console.log('   Category:', askResult.data.category);
  }
  console.log('');

  // 결과 요약
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(50));
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const avgResponseTime = results
    .filter(r => r.responseTime)
    .reduce((sum, r) => sum + (r.responseTime || 0), 0) / results.filter(r => r.responseTime).length;

  console.log(`✅ 성공: ${successCount}/${results.length}`);
  console.log(`❌ 실패: ${errorCount}/${results.length}`);
  console.log(`⏱️  평균 응답 시간: ${Math.round(avgResponseTime)}ms`);
  console.log('');

  if (errorCount > 0) {
    console.log('❌ 실패한 엔드포인트:');
    results
      .filter(r => r.status === 'error')
      .forEach(r => {
        console.log(`   - ${r.method} ${r.endpoint}: ${r.error}`);
      });
  }

  console.log('='.repeat(50));

  // 종료 코드
  process.exit(errorCount > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('❌ 테스트 실행 중 오류:', error);
  process.exit(1);
});

