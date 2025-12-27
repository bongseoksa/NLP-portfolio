/**
 * Supabase Postgre REST API를 직접 사용한 마이그레이션
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
    process.exit(1);
}

async function runMigration() {
    console.log('🔄 마이그레이션 준비 중...\n');

    // SQL 파일 읽기
    const sqlPath = path.join(__dirname, '..', 'migration_add_timing_fields.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('📋 다음 SQL을 복사하여 Supabase SQL Editor에서 실행하세요:\n');
    console.log('='.repeat(80));
    console.log(sql);
    console.log('='.repeat(80));
    console.log('');
    console.log('📍 Supabase SQL Editor 링크:');
    console.log(`   https://supabase.com/dashboard/project/vorbpbnvhdakgzpftkfl/sql/new`);
    console.log('');
    console.log('📝 실행 방법:');
    console.log('   1. 위 링크를 클릭하여 SQL Editor를 엽니다');
    console.log('   2. 위의 SQL을 복사하여 붙여넣습니다');
    console.log('   3. "Run" 버튼을 클릭합니다');
    console.log('');
    console.log('✅ 실행 후 아무 키나 눌러 계속하세요...');
}

runMigration().catch(err => {
    console.error('❌ 오류:', err);
    process.exit(1);
});
