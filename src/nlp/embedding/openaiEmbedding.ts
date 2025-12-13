/**
 * 임베딩 벡터를 생성하는 모듈입니다.
 * OpenAI API 실패 시 Chroma 기본 임베딩으로 fallback합니다.
 */
import OpenAI from "openai";
import { DefaultEmbeddingFunction } from "@chroma-core/default-embed";

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
 * 텍스트 목록에 대한 임베딩 벡터를 생성합니다.
 * OpenAI 실패 시 Chroma 기본 임베딩으로 자동 fallback합니다.
 * 
 * @param {string[]} texts - 임베딩을 생성할 텍스트 목록
 * @returns {Promise<number[][]>} 생성된 임베딩 벡터 목록
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    // 1차 시도: OpenAI
    if (openai) {
        try {
            console.log("🔄 Generating embeddings with OpenAI...");
            const embeddings = await generateOpenAIEmbeddings(texts);
            console.log("✅ OpenAI embedding successful");
            return embeddings;
        } catch (error: any) {
            console.warn("⚠️ OpenAI Embedding failed:", error.message || error);
            console.log("🔄 Falling back to Chroma default embedding...");
        }
    } else {
        console.log("ℹ️ OpenAI API key not set, using Chroma default embedding...");
    }

    // 2차 시도: Chroma 기본 임베딩 (fallback)
    try {
        const embeddings = await generateChromaEmbeddings(texts);
        console.log("✅ Chroma default embedding successful");
        return embeddings;
    } catch (error: any) {
        console.error("❌ Chroma Embedding Error:", error.message || error);
        throw new Error("All embedding methods failed");
    }
}
