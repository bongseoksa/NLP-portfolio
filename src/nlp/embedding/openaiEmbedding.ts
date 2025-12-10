/**
 * OpenAI API를 사용하여 텍스트의 임베딩 벡터를 생성합니다.
 */
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.warn("⚠️ OPENAI_API_KEY 환경 변수가 없습니다. 임베딩 생성이 실패할 수 있습니다.");
}

const openai = new OpenAI({ apiKey: apiKey || "dummy" });

/**
 * 텍스트 목록에 대한 임베딩 벡터를 생성합니다.
 * 
 * @param {string[]} texts - 임베딩을 생성할 텍스트 목록
 * @returns {Promise<number[][]>} 생성된 임베딩 벡터 목록
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: texts,
            encoding_format: "float",
        });

        return response.data.map(item => item.embedding);
    } catch (error) {
        console.error("❌ OpenAI Embedding Error:", error);
        throw error;
    }
}
