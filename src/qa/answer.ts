/**
 * 검색된 문맥(Context)을 바탕으로 사용자 질문에 대한 답변을 생성합니다.
 * OpenAI 실패 시 Claude AI로 자동 fallback합니다.
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { SearchResult } from "../vector_store/searchVectors.js";

// OpenAI 클라이언트 (API 키가 없으면 null)
const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

// Claude 클라이언트 (API 키가 없으면 null)
const anthropicApiKey = process.env.CLAUDE_API_KEY;
const anthropic = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null;

const SYSTEM_PROMPT = `
당신은 GitHub 레포지토리 분석 전문가입니다. 
제공된 [Context]를 바탕으로 사용자의 질문에 답변해야 합니다.

Context에는 다음 정보가 포함될 수 있습니다:
- 커밋 메시지 및 변경 내역
- 소스 코드 파일 내용 (구현 로직, 코드 구조 등)
- Diff 정보

답변은 한국어로 작성하며, 구체적인 파일명, 코드 스니펫, 커밋 메시지를 인용하여 근거를 제시하세요.
소스 코드 레벨 질문의 경우, 실제 코드 내용을 참고하여 정확한 답변을 제공하세요.
Context에 없는 내용은 "주어진 정보에서는 알 수 없습니다"라고 답변하세요.
`;

/**
 * 검색된 문서들을 하나의 Context 문자열로 병합합니다.
 */
function buildContext(results: SearchResult[]): string {
    if (!results || results.length === 0) {
        return '';
    }
    
    // content가 있는 결과만 필터링
    const validResults = results.filter(r => r.content && r.content.trim().length > 0);
    
    if (validResults.length === 0) {
        console.warn('⚠️ 검색 결과는 있지만 content가 비어있습니다.');
        return '';
    }
    
    return validResults.map((r, i) => {
        return `[Source ${i + 1}]\nMetadata: ${JSON.stringify(r.metadata)}\nContent:\n${r.content}\n`;
    }).join("\n---\n");
}

/**
 * OpenAI를 사용하여 답변을 생성합니다.
 */
async function generateWithOpenAI(query: string, contextText: string): Promise<string> {
    if (!openai) {
        throw new Error("OpenAI API key not configured");
    }

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `[Context]\n${contextText}\n\n[Question]\n${query}` }
        ],
        temperature: 0.1,
    });

    return response.choices[0]?.message?.content || "답변을 생성할 수 없습니다.";
}

/**
 * Claude를 사용하여 답변을 생성합니다.
 */
async function generateWithClaude(query: string, contextText: string): Promise<string> {
    if (!anthropic) {
        throw new Error("Anthropic API key not configured");
    }

    const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
            { role: "user", content: `[Context]\n${contextText}\n\n[Question]\n${query}` }
        ],
    });

    const textBlock = response.content.find(block => block.type === "text");
    return textBlock?.text || "답변을 생성할 수 없습니다.";
}

/**
 * LLM을 사용하여 질문에 대한 답변을 생성합니다.
 * OpenAI 실패 시 Claude로 자동 fallback합니다.
 * 
 * @param {string} query - 사용자 질문
 * @param {SearchResult[]} context - 검색된 관련 문서 리스트
 * @returns {Promise<string>} 생성된 답변
 */
export async function generateAnswer(query: string, context: SearchResult[]): Promise<string> {
    // 검색 결과 로깅 (디버깅용)
    console.log(`📊 검색 결과: ${context.length}개 문서`);
    if (context.length > 0) {
        context.forEach((ctx, idx) => {
            const type = ctx.metadata?.type || 'unknown';
            const path = ctx.metadata?.path || ctx.metadata?.filePath || ctx.metadata?.sha || 'N/A';
            const contentLength = ctx.content?.length || 0;
            console.log(`   [${idx + 1}] type: ${type}, path: ${path}, content: ${contentLength}자`);
        });
    }
    
    const contextText = buildContext(context);

    if (!contextText) {
        console.warn('⚠️ buildContext가 빈 문자열을 반환했습니다.');
        if (context.length === 0) {
            return "죄송합니다. 관련 정보를 찾을 수 없습니다. 벡터 저장소에 데이터가 없거나 검색 쿼리가 적절하지 않을 수 있습니다.";
        } else {
            return "죄송합니다. 검색 결과는 있지만 내용이 비어있습니다. 벡터 저장소의 데이터를 확인해주세요.";
        }
    }

    // 1차 시도: OpenAI
    if (openai) {
        try {
            console.log("🔄 Generating answer with OpenAI (GPT-4o)...");
            const answer = await generateWithOpenAI(query, contextText);
            console.log("✅ OpenAI answer generation successful");
            return answer;
        } catch (error: any) {
            console.warn("⚠️ OpenAI failed:", error.message || error);
            console.log("🔄 Falling back to Claude...");
        }
    } else {
        console.log("ℹ️ OpenAI API key not set, trying Claude...");
    }

    // 2차 시도: Claude
    if (anthropic) {
        try {
            console.log("🔄 Generating answer with Claude...");
            const answer = await generateWithClaude(query, contextText);
            console.log("✅ Claude answer generation successful");
            return answer;
        } catch (error: any) {
            console.error("❌ Claude failed:", error.message || error);
        }
    } else {
        console.warn("⚠️ CLAUDE_API_KEY not set, Claude unavailable");
    }

    return "오류가 발생하여 답변을 생성할 수 없습니다. OpenAI 또는 Anthropic API 키를 확인해주세요.";
}
