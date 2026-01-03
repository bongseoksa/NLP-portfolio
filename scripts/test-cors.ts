/**
 * CORS 테스트 스크립트
 * 모든 API 엔드포인트의 CORS 설정을 테스트합니다.
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

interface TestResult {
  endpoint: string;
  method: string;
  corsHeaders: {
    'access-control-allow-origin'?: string;
    'access-control-allow-credentials'?: string;
    'access-control-allow-methods'?: string;
    'access-control-allow-headers'?: string;
  };
  status: number;
  success: boolean;
  error?: string;
}

async function testCORS(endpoint: string, method: string = 'GET', body?: any): Promise<TestResult> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    // OPTIONS 요청 (Preflight) 테스트
    const optionsResponse = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });

    const corsHeaders: {
      'access-control-allow-origin'?: string;
      'access-control-allow-credentials'?: string;
      'access-control-allow-methods'?: string;
      'access-control-allow-headers'?: string;
    } = {};
    
    const origin = optionsResponse.headers.get('access-control-allow-origin');
    const credentials = optionsResponse.headers.get('access-control-allow-credentials');
    const methods = optionsResponse.headers.get('access-control-allow-methods');
    const headers = optionsResponse.headers.get('access-control-allow-headers');
    
    if (origin) corsHeaders['access-control-allow-origin'] = origin;
    if (credentials) corsHeaders['access-control-allow-credentials'] = credentials;
    if (methods) corsHeaders['access-control-allow-methods'] = methods;
    if (headers) corsHeaders['access-control-allow-headers'] = headers;

    // 실제 요청 테스트
    const requestOptions: RequestInit = {
      method,
      headers: {
        'Origin': 'http://localhost:5173',
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      requestOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, requestOptions);
    const status = response.status;

    // CORS 헤더 확인
    const actualCorsHeaders: {
      'access-control-allow-origin'?: string;
      'access-control-allow-credentials'?: string;
      'access-control-allow-methods'?: string;
      'access-control-allow-headers'?: string;
    } = {};
    
    const actualOrigin = response.headers.get('access-control-allow-origin');
    const actualCredentials = response.headers.get('access-control-allow-credentials');
    const actualMethods = response.headers.get('access-control-allow-methods');
    const actualHeaders = response.headers.get('access-control-allow-headers');
    
    if (actualOrigin) actualCorsHeaders['access-control-allow-origin'] = actualOrigin;
    if (actualCredentials) actualCorsHeaders['access-control-allow-credentials'] = actualCredentials;
    if (actualMethods) actualCorsHeaders['access-control-allow-methods'] = actualMethods;
    if (actualHeaders) actualCorsHeaders['access-control-allow-headers'] = actualHeaders;

    const success = 
      status < 500 && 
      (actualCorsHeaders['access-control-allow-origin'] === 'http://localhost:5173' || 
       actualCorsHeaders['access-control-allow-origin'] === '*');

    return {
      endpoint,
      method,
      corsHeaders: actualCorsHeaders,
      status,
      success,
    };
  } catch (error: any) {
    return {
      endpoint,
      method,
      corsHeaders: {},
      status: 0,
      success: false,
      error: error.message,
    };
  }
}

async function checkServerConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function runTests() {
  console.log('🧪 CORS 테스트 시작\n');
  console.log(`API 서버: ${API_BASE_URL}\n`);

  // 서버 연결 확인
  console.log('1️⃣ 서버 연결 확인 중...');
  const isConnected = await checkServerConnection();
  if (!isConnected) {
    console.error('❌ API 서버에 연결할 수 없습니다.');
    console.error(`   ${API_BASE_URL}에서 서버가 실행 중인지 확인해주세요.`);
    console.error('   서버 시작: pnpm run server');
    process.exit(1);
  }
  console.log('✅ 서버 연결 성공\n');

  // 테스트할 엔드포인트 목록
  const endpoints = [
    { path: '/api/health', method: 'GET' },
    { path: '/api/health/status', method: 'GET' },
    { path: '/api/health/chromadb', method: 'GET' },
    { path: '/api/dashboard/summary', method: 'GET' },
    { path: '/api/dashboard/daily', method: 'GET' },
    { path: '/api/dashboard/categories', method: 'GET' },
    { path: '/api/dashboard/sources', method: 'GET' },
    { path: '/api/history', method: 'GET' },
    { path: '/api/migration/status', method: 'GET' },
    { path: '/api/migration/schema', method: 'GET' },
    { path: '/api/ask', method: 'POST', body: { question: '테스트 질문' } },
  ];

  console.log('2️⃣ 각 엔드포인트 CORS 테스트 중...\n');

  const results: TestResult[] = [];
  for (const endpoint of endpoints) {
    const result = await testCORS(endpoint.path, endpoint.method, endpoint.body);
    results.push(result);

    const statusIcon = result.success ? '✅' : '❌';
    const statusText = result.success ? '성공' : '실패';
    console.log(`${statusIcon} ${endpoint.method} ${endpoint.path} - ${statusText} (${result.status})`);
    
    if (result.corsHeaders['access-control-allow-origin']) {
      console.log(`   Origin: ${result.corsHeaders['access-control-allow-origin']}`);
    }
    if (result.error) {
      console.log(`   오류: ${result.error}`);
    }
  }

  console.log('\n3️⃣ 테스트 결과 요약\n');
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`✅ 성공: ${successCount}/${results.length}`);
  console.log(`❌ 실패: ${failCount}/${results.length}\n`);

  if (failCount > 0) {
    console.log('실패한 엔드포인트:');
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  - ${r.method} ${r.endpoint} (${r.status})`);
        if (r.error) {
          console.log(`    오류: ${r.error}`);
        }
      });
    console.log('');
  }

  // CORS 헤더 상세 정보
  console.log('4️⃣ CORS 헤더 상세 정보\n');
  const sampleResult = results.find(r => r.success);
  if (sampleResult) {
    console.log('예시 (성공한 요청):');
    console.log(`  Access-Control-Allow-Origin: ${sampleResult.corsHeaders['access-control-allow-origin'] || '(없음)'}`);
    console.log(`  Access-Control-Allow-Credentials: ${sampleResult.corsHeaders['access-control-allow-credentials'] || '(없음)'}`);
    console.log(`  Access-Control-Allow-Methods: ${sampleResult.corsHeaders['access-control-allow-methods'] || '(없음)'}`);
    console.log(`  Access-Control-Allow-Headers: ${sampleResult.corsHeaders['access-control-allow-headers'] || '(없음)'}`);
  }

  process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error('❌ 테스트 실행 중 오류:', error);
  process.exit(1);
});

