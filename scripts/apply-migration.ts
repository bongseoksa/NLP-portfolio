/**
 * Supabase 마이그레이션 자동 적용 스크립트
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
    console.log('🚀 Supabase 마이그레이션 적용 시작...\n');

    // 마이그레이션 SQL 파일 읽기
    const migrationPath = path.join(__dirname, '../supabase/migrations/001_update_category_enum.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 마이그레이션 파일 읽기 완료');
    console.log('파일 경로:', migrationPath);
    console.log('');

    // SQL을 개별 명령어로 분리
    const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`총 ${statements.length}개의 SQL 명령어를 실행합니다.\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        const statementPreview = statement.substring(0, 80).replace(/\n/g, ' ');

        try {
            // Supabase RPC를 사용하여 SQL 실행
            // 참고: ANON_KEY로는 DDL 실행이 제한될 수 있음
            const { data, error } = await supabase.rpc('exec_sql', {
                sql_query: statement + ';'
            });

            if (error) {
                throw error;
            }

            successCount++;
            console.log(`✅ [${i + 1}/${statements.length}] ${statementPreview}...`);
        } catch (error: any) {
            failCount++;
            console.error(`❌ [${i + 1}/${statements.length}] 실패: ${statementPreview}...`);
            console.error(`   오류: ${error.message}`);

            // ALTER TABLE, UPDATE 등의 DDL/DML은 ANON_KEY로 실행 불가
            if (error.message?.includes('permission') || error.message?.includes('function')) {
                console.log('\n⚠️  ANON_KEY로는 DDL 명령어를 실행할 수 없습니다.');
                console.log('📋 대신 Supabase SQL Editor에서 수동으로 실행해주세요:\n');
                console.log('1. https://supabase.com/dashboard 접속');
                console.log('2. 프로젝트 선택');
                console.log('3. SQL Editor 열기');
                console.log('4. 아래 파일의 내용을 복사하여 실행:');
                console.log(`   ${migrationPath}\n`);
                return;
            }
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`✅ 마이그레이션 완료: ${successCount}개 성공, ${failCount}개 실패`);
    console.log('='.repeat(80));
}

applyMigration().catch(console.error);
