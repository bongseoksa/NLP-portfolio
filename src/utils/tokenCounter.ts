/**
 * Token counting and chunking utility using OpenAI's tiktoken
 * For use with text-embedding-3-small model
 */
import { Tiktoken, encoding_for_model } from 'tiktoken';

// Cache encoding instance for performance
let cachedEncoding: Tiktoken | null = null;

/**
 * Get or create tiktoken encoding instance (cl100k_base for text-embedding-3-small)
 */
function getEncoding(): Tiktoken {
    if (!cachedEncoding) {
        // cl100k_base is used by text-embedding-3-small and GPT-4
        cachedEncoding = encoding_for_model('text-embedding-3-small');
    }
    return cachedEncoding;
}

/**
 * Count tokens in text
 *
 * @param text - Text to count tokens for
 * @returns Number of tokens
 */
export function countTokens(text: string): number {
    const encoding = getEncoding();
    const tokens = encoding.encode(text);
    return tokens.length;
}

/**
 * Split text into chunks based on token limit
 * Splits at token boundaries (not character boundaries)
 *
 * @param text - Text to split
 * @param maxTokens - Maximum tokens per chunk (default: 8000)
 * @returns Array of text chunks, each <= maxTokens
 */
export function chunkTextByTokens(text: string, maxTokens: number = 8000): string[] {
    const encoding = getEncoding();
    const tokens = encoding.encode(text);

    // If under limit, return as-is
    if (tokens.length <= maxTokens) {
        return [text];
    }

    console.log(`📏 Text has ${tokens.length} tokens, splitting into chunks of ${maxTokens}...`);

    const chunks: string[] = [];

    // Split tokens into chunks
    const textDecoder = new TextDecoder();
    for (let i = 0; i < tokens.length; i += maxTokens) {
        const chunkTokens = tokens.slice(i, i + maxTokens);
        const chunkBytes = encoding.decode(chunkTokens);
        const chunkText = textDecoder.decode(chunkBytes);
        chunks.push(chunkText);
    }

    console.log(`   → Created ${chunks.length} chunks`);
    return chunks;
}

/**
 * Free encoding resources (call on shutdown if needed)
 */
export function freeEncoding(): void {
    if (cachedEncoding) {
        cachedEncoding.free();
        cachedEncoding = null;
    }
}
