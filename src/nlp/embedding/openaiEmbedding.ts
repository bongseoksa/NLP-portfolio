/**
 * 임베딩 벡터를 생성하는 모듈입니다.
 * OpenAI API 실패 시 Chroma 기본 임베딩으로 fallback합니다.
 * 8K 토큰 초과 시 자동으로 청킹하여 임베딩을 평균화합니다.
 */
import OpenAI from "openai";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";
import { countTokens, chunkTextByTokens } from "../../utils/tokenCounter.js";

const apiKey = process.env.OPENAI_API_KEY;

// OpenAI 클라이언트 (API 키가 없으면 null)
const openai = apiKey ? new OpenAI({ apiKey }) : null;

// Chroma 기본 임베딩 함수 (fallback용)
let chromaEmbedder: DefaultEmbeddingFunction | null = null;

/**
 * Chroma 기본 임베딩 함수를 초기화합니다. (lazy initialization)
 */
async function getChromaEmbedder(): Promise<DefaultEmbeddingFunction> {
    if (!chromaEmbedder) {
        chromaEmbedder = new DefaultEmbeddingFunction();
    }
    return chromaEmbedder;
}

/**
 * OpenAI를 사용하여 임베딩을 생성합니다.
 */
async function generateOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
    if (!openai) {
        throw new Error("OpenAI API key not configured");
    }
    
    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
        encoding_format: "float",
    });

    return response.data.map(item => item.embedding);
}

/**
 * Chroma 기본 임베딩을 사용하여 임베딩을 생성합니다.
 * (로컬에서 실행되므로 API 키 불필요)
 */
async function generateChromaEmbeddings(texts: string[]): Promise<number[][]> {
    const embedder = await getChromaEmbedder();
    const embeddings = await embedder.generate(texts);
    return embeddings;
}

/**
 * 여러 임베딩 벡터를 평균화합니다.
 * 청킹된 텍스트의 임베딩을 하나로 결합할 때 사용합니다.
 *
 * @param embeddings - 평균화할 임베딩 벡터 목록
 * @returns 평균화된 단일 임베딩 벡터
 */
function averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) {
        throw new Error("Cannot average empty embeddings array");
    }

    if (embeddings.length === 1) {
        return embeddings[0]!;
    }

    const dimension = embeddings[0]!.length;
    const averaged = new Array(dimension).fill(0);

    // Sum all embeddings
    for (const embedding of embeddings) {
        for (let i = 0; i < dimension; i++) {
            averaged[i] += embedding[i]!;
        }
    }

    // Divide by count to get average
    for (let i = 0; i < dimension; i++) {
        averaged[i] /= embeddings.length;
    }

    return averaged;
}

/**
 * 단일 텍스트를 처리하여 임베딩을 생성합니다.
 * 8K 토큰 초과 시 자동으로 청킹하여 평균화합니다.
 *
 * @param text - 처리할 텍스트
 * @param generateFn - 사용할 임베딩 생성 함수 (OpenAI 또는 Chroma)
 * @returns 단일 임베딩 벡터 (필요시 평균화됨)
 */
async function processTextWithChunking(
    text: string,
    generateFn: (texts: string[]) => Promise<number[][]>
): Promise<number[]> {
    const tokenCount = countTokens(text);

    // 8K 토큰 이하면 그대로 처리
    if (tokenCount <= 8000) {
        const embeddings = await generateFn([text]);
        return embeddings[0]!;
    }

    // 8K 토큰 초과: 청킹 필요
    console.log(`⚠️ Text exceeds 8K tokens (${tokenCount}), chunking...`);
    const chunks = chunkTextByTokens(text, 8000);

    // 각 청크에 대해 임베딩 생성
    const chunkEmbeddings = await generateFn(chunks);

    // 임베딩 평균화
    console.log(`📊 Averaging ${chunkEmbeddings.length} chunk embeddings...`);
    const averaged = averageEmbeddings(chunkEmbeddings);

    return averaged;
}

/**
 * 텍스트 목록에 대한 임베딩 벡터를 생성합니다.
 * OpenAI 실패 시 Chroma 기본 임베딩으로 자동 fallback합니다.
 * 8K 토큰 초과 텍스트는 자동으로 청킹하여 평균화합니다.
 *
 * @param {string[]} texts - 임베딩을 생성할 텍스트 목록
 * @returns {Promise<number[][]>} 생성된 임베딩 벡터 목록
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    // 사용할 임베딩 함수 결정
    let generateFn: (texts: string[]) => Promise<number[][]>;

    if (openai) {
        generateFn = generateOpenAIEmbeddings;
        console.log("🔄 Generating embeddings with OpenAI...");
    } else {
        generateFn = generateChromaEmbeddings;
        console.log("ℹ️ OpenAI API key not set, using Chroma default embedding...");
    }

    try {
        // 각 텍스트를 청킹 처리하여 임베딩 생성
        const results: number[][] = [];

        for (const text of texts) {
            const embedding = await processTextWithChunking(text, generateFn);
            results.push(embedding);
        }

        console.log("✅ Embedding generation successful");
        return results;

    } catch (error: any) {
        // OpenAI 실패 시 Chroma로 fallback
        if (openai && generateFn === generateOpenAIEmbeddings) {
            console.warn("⚠️ OpenAI Embedding failed:", error.message || error);
            console.log("🔄 Falling back to Chroma default embedding...");

            // Chroma로 재시도
            generateFn = generateChromaEmbeddings;
            const results: number[][] = [];

            for (const text of texts) {
                const embedding = await processTextWithChunking(text, generateFn);
                results.push(embedding);
            }

            console.log("✅ Chroma default embedding successful");
            return results;
        }

        console.error("❌ All embedding methods failed:", error.message || error);
        throw new Error("All embedding methods failed");
    }
}
