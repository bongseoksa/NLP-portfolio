-- ============================================================
-- NLP-Portfolio Database Initialization
-- ============================================================
-- Version: 1.1
-- Last Updated: 2026-01-03
-- Purpose: PostgreSQL extensions and common setup
-- ============================================================

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Common Functions
-- ============================================================

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Notes
-- ============================================================
/*
This file must be executed first before other schema files.
It provides:
1. pgvector extension for vector(384) type support
2. Common trigger functions used across multiple tables
*/
