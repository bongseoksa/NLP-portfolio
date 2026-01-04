/**
 * 데이터베이스 마이그레이션 실행 스크립트
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function runMigration() {
    console.log('🔄 마이그레이션 시작...');

    // SQL 파일 읽기
    const sqlPath = path.join(__dirname, '..', 'migration_add_timing_fields.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // SQL을 개별 명령으로 분리 (주석 제거 및 빈 줄 제거)
    const commands = sql
        .split(';')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));

    console.log(`📊 총 ${commands.length}개의 SQL 명령 실행 예정`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < commands.length; i++) {
        const command = commands[i]!;
        console.log(`\n[${i + 1}/${commands.length}] 실행 중...`);
        console.log(command.substring(0, 80) + (command.length > 80 ? '...' : ''));

        try {
            const { error } = await supabase.rpc('exec_sql', { sql_query: command });

            if (error) {
                // exec_sql 함수가 없는 경우 직접 실행 시도
                if (error.code === 'PGRST204' || error.message?.includes('function')) {
                    console.log('⚠️ exec_sql 함수가 없습니다. 직접 실행을 시도합니다...');
                    console.log('');
                    console.log('다음 SQL을 Supabase SQL Editor에서 직접 실행하세요:');
                    console.log('='.repeat(80));
                    console.log(sql);
                    console.log('='.repeat(80));
                    console.log('');
                    console.log('Supabase Dashboard → SQL Editor:');
                    const projectId = supabaseUrl?.match(/https:\/\/([^.]+)/)?.[1] || 'unknown';
                    console.log(`https://supabase.com/dashboard/project/${projectId}/sql`);
                    process.exit(0);
                }

                console.error(`❌ 오류:`, error.message);
                errorCount++;
            } else {
                console.log('✅ 성공');
                successCount++;
            }
        } catch (err: any) {
            console.error(`❌ 예외:`, err.message);
            errorCount++;
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`✅ 성공: ${successCount}개`);
    console.log(`❌ 실패: ${errorCount}개`);
    console.log('='.repeat(80));

    if (errorCount === 0) {
        console.log('\n🎉 마이그레이션이 성공적으로 완료되었습니다!');
    } else {
        console.log('\n⚠️ 일부 명령이 실패했습니다. 위의 오류를 확인하세요.');
    }
}

runMigration().catch(err => {
    console.error('❌ 마이그레이션 실행 중 오류:', err);
    process.exit(1);
});
