/**
 * Q&A 이력을 벡터 DB에 저장
 * 이전 대화 내용을 참고하여 답변 생성 가능하도록 함
 */

import { generateEmbeddings } from "../nlp/embedding/openaiEmbedding.js";
import { ChromaClient } from "chromadb";
import type { RefinedItem } from "../models/refinedData.js";

const CHROMA_URL = process.env.CHROMA_URL || "http://localhost:8000";

/**
 * Q&A 쌍을 벡터 DB에 저장합니다.
 *
 * @param collectionName 컬렉션 이름
 * @param question 질문
 * @param answer 답변
 * @param sessionId 대화 세션 ID
 * @param metadata 추가 메타데이터
 */
export async function saveQAToVector(
    collectionName: string,
    question: string,
    answer: string,
    sessionId: string,
    metadata: {
        category?: string;
        categoryConfidence?: number;
        status?: string;
    } = {}
): Promise<void> {
    try {
        const client = new ChromaClient({ path: CHROMA_URL });

        // 컬렉션 가져오기 (없으면 생성)
        let collection;
        try {
            collection = await client.getCollection({ name: collectionName });
        } catch (error) {
            console.log(`📦 Creating collection: ${collectionName}`);
            collection = await client.createCollection({
                name: collectionName,
                metadata: { description: "Repository data with Q&A history" }
            });
        }

        // Q&A 아이템 생성
        const qaId = `qa-${sessionId}-${Date.now()}`;
        const timestamp = new Date().toISOString();

        // 자연어 텍스트 생성 (임베딩용)
        const embeddingText = generateQAEmbeddingText(question, answer, metadata.category);

        const qaItem: RefinedItem = {
            id: qaId,
            type: "qa",
            content: `질문: ${question}\n\n답변: ${answer}`,
            embeddingText,
            metadata: {
                question,
                answer,
                sessionId,
                timestamp,
                ...(metadata.category && { questionCategory: metadata.category }),
            }
        };

        // 임베딩 생성
        const embeddings = await generateEmbeddings([qaItem.embeddingText]);
        const embedding = embeddings[0];
        
        if (!embedding) {
            throw new Error("Failed to generate embedding");
        }

        // 벡터 DB에 저장
        await collection.add({
            ids: [qaItem.id],
            embeddings: [embedding],
            documents: [qaItem.content],
            metadatas: [{
                type: qaItem.type,
                question: question,
                answer: answer.substring(0, 500), // 답변은 500자까지만 메타데이터에 저장
                sessionId,
                timestamp,
                questionCategory: metadata.category || 'unknown',
            }]
        });

        console.log(`✅ Q&A saved to vector DB: ${qaId}`);
    } catch (error: any) {
        console.error("❌ Failed to save Q&A to vector:", error.message);
        // 에러가 발생해도 Q&A 기능 자체는 계속 동작하도록 함
    }
}

/**
 * Q&A를 자연어로 변환 (임베딩 품질 최적화)
 */
function generateQAEmbeddingText(
    question: string,
    answer: string,
    category?: string
): string {
    const categoryText = category ? `\n카테고리: ${category}` : '';

    return `이것은 이전에 사용자가 질문하고 답변받은 내용입니다.${categoryText}

질문: ${question}

답변: ${answer}

이 대화는 프로젝트에 대한 질의응답 기록이며, 유사한 질문이나 관련된 질문에 대한 참고 자료로 활용될 수 있습니다.`;
}
