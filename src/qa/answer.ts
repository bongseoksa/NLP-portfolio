/**
 * 검색된 문맥(Context)을 바탕으로 사용자 질문에 대한 답변을 생성합니다.
 */
import OpenAI from "openai";
import type { SearchResult } from "../vector_store/searchVectors.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 검색된 문서들을 하나의 Context 문자열로 병합합니다.
 */
function buildContext(results: SearchResult[]): string {
    return results.map((r, i) => {
        return `[Source ${i + 1}]\nMetadata: ${JSON.stringify(r.metadata)}\nContent:\n${r.content}\n`;
    }).join("\n---\n");
}

/**
 * LLM을 사용하여 질문에 대한 답변을 생성합니다.
 * 
 * @param {string} query - 사용자 질문
 * @param {SearchResult[]} context - 검색된 관련 문서 리스트
 * @returns {Promise<string>} 생성된 답변
 */
export async function generateAnswer(query: string, context: SearchResult[]): Promise<string> {
    const contextText = buildContext(context);

    if (!contextText) {
        return "죄송합니다. 관련 정보를 찾을 수 없습니다.";
    }

    const systemPrompt = `
당신은 GitHub 레포지토리 분석 전문가입니다. 
제공된 [Context]를 바탕으로 사용자의 질문에 답변해야 합니다.
답변은 한국어로 작성하며, 구체적인 파일명이나 커밋 메시지를 인용하여 근거를 제시하세요.
Context에 없는 내용은 "주어진 정보에서는 알 수 없습니다"라고 답변하세요.
`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o", // or gpt-3.5-turbo
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `[Context]\n${contextText}\n\n[Question]\n${query}` }
            ],
            temperature: 0.1, // 사실 기반 응답을 위해 낮춤
        });

        return response.choices[0].message?.content || "답변을 생성할 수 없습니다.";
    } catch (error) {
        console.error("❌ generateAnswer Error:", error);
        return "오류가 발생하여 답변을 생성할 수 없습니다.";
    }
}
