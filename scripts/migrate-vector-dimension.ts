#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function migrateVectorDimension() {
  console.log('🔄 Starting vector dimension migration...\n');

  try {
    // Step 1: Drop existing embedding column
    console.log('Step 1: Dropping existing embedding column...');
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE embeddings DROP COLUMN IF EXISTS embedding;'
    });

    if (dropError) {
      console.error('❌ Failed to drop column:', dropError.message);
      console.log('\nℹ️  Trying alternative method using raw SQL...\n');

      // Alternative: Use direct SQL execution
      await executeSQL('ALTER TABLE embeddings DROP COLUMN IF EXISTS embedding;');
    } else {
      console.log('✅ Embedding column dropped\n');
    }

    // Step 2: Add new 768-dimension vector column
    console.log('Step 2: Adding new embedding column (768 dimensions)...');
    await executeSQL('ALTER TABLE embeddings ADD COLUMN embedding vector(768);');
    console.log('✅ New embedding column added\n');

    // Step 3: Recreate index
    console.log('Step 3: Recreating HNSW index...');
    await executeSQL('DROP INDEX IF EXISTS embeddings_embedding_idx;');
    await executeSQL('CREATE INDEX embeddings_embedding_idx ON embeddings USING hnsw (embedding vector_cosine_ops);');
    console.log('✅ Index recreated\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Migration completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nℹ️  Please run the following SQL manually in Supabase SQL Editor:\n');
    console.log(`
-- Vector Dimension Migration
ALTER TABLE embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE embeddings ADD COLUMN embedding vector(768);
DROP INDEX IF EXISTS embeddings_embedding_idx;
CREATE INDEX embeddings_embedding_idx ON embeddings USING hnsw (embedding vector_cosine_ops);
    `);
    process.exit(1);
  }
}

// Helper function to execute raw SQL
async function executeSQL(sql: string) {
  const { error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    // If exec_sql doesn't exist, show manual SQL
    throw new Error(`SQL execution failed: ${error.message}\n\nPlease execute this SQL manually in Supabase SQL Editor:\n${sql}`);
  }
}

migrateVectorDimension();
