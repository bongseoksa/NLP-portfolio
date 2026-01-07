import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('Required: SUPABASE_URL, SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('🔄 Testing Supabase connection...\n');
  console.log(`URL: ${supabaseUrl}\n`);

  // Test 1: Ping 테이블 쓰기
  console.log('Test 1: Ping table insert');
  const { data: pingData, error: pingError } = await supabase
    .from('ping')
    .insert({ pinged_at: new Date().toISOString() })
    .select();

  if (pingError) {
    console.error('❌ Ping insert failed:', pingError.message);
    console.error('   Details:', pingError);
  } else {
    console.log('✅ Ping insert successful:', pingData);
  }

  // Test 2: qa_history 테이블 읽기
  console.log('\nTest 2: QA History read');
  const { data: qaData, error: qaError } = await supabase
    .from('qa_history')
    .select('*')
    .limit(5);

  if (qaError) {
    console.error('❌ QA History read failed:', qaError.message);
    console.error('   Details:', qaError);
  } else {
    console.log('✅ QA History read successful. Rows:', qaData.length);
  }

  // Test 3: embeddings 테이블 카운트
  console.log('\nTest 3: Embeddings count');
  const { count, error: countError } = await supabase
    .from('embeddings')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Embeddings count failed:', countError.message);
    console.error('   Details:', countError);
  } else {
    console.log('✅ Embeddings count:', count);
  }

  // Test 4: 테이블 목록 확인
  console.log('\nTest 4: Check table existence');
  const tables = ['ping', 'qa_history', 'embeddings'];
  for (const table of tables) {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`❌ Table "${table}" - ${error.message}`);
    } else {
      console.log(`✅ Table "${table}" exists`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All tests completed!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

testConnection().catch(console.error);
