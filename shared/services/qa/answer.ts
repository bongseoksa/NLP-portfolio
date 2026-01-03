/**
 * 검색된 문맥(Context)을 바탕으로 사용자 질문에 대한 답변을 생성합니다.
 * 기획서에 명시된 Fallback Chain: Claude Sonnet 4 → Gemini 1.5 Flash → Mistral-7B-Instruct
 */
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";
import type { SearchResult } from "../vector-store/searchVectors.js";

// Claude 클라이언트 (Primary - API 키가 없으면 null)
const anthropicApiKey = process.env.CLAUDE_API_KEY;
const anthropic = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null;

// Gemini 클라이언트 (Fallback 1 - API 키가 없으면 null)
const geminiApiKey = process.env.GEMINI_API_KEY;
const gemini = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Mistral-7B-Instruct (Fallback 2 - Hugging Face Inference API)
const huggingFaceApiKey = process.env.HUGGING_FACE_API_KEY;

const SYSTEM_PROMPT = `
당신은 GitHub 레포지토리 분석 전문가입니다.
제공된 [Context]를 바탕으로 사용자의 질문에 답변해야 합니다.

Context에는 다음 정보가 포함될 수 있습니다:
- 커밋 메시지 및 변경 내역
- 소스 코드 파일 내용 (구현 로직, 코드 구조 등)
- Diff 정보
- 이전 Q&A 대화 내용 (사용자가 이전에 물어본 질문과 답변)

답변은 한국어로 작성하며, 구체적인 파일명, 코드 스니펫, 커밋 메시지를 인용하여 근거를 제시하세요.
소스 코드 레벨 질문의 경우, 실제 코드 내용을 참고하여 정확한 답변을 제공하세요.
이전 대화 내용이 있다면 이를 참고하여 연속적인 질문에 답변하세요.
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
 * Mistral-7B-Instruct를 사용하여 답변을 생성합니다.
 * Hugging Face Inference API를 통해 호출합니다.
 */
async function generateWithMistral(query: string, contextText: string): Promise<string> {
    if (!huggingFaceApiKey) {
        throw new Error("Hugging Face API key not configured");
    }

    const prompt = `${SYSTEM_PROMPT}\n\n[Context]\n${contextText}\n\n[Question]\n${query}`;

    const response = await fetch(
        "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${huggingFaceApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 512,
                    temperature: 0.1,
                },
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Mistral API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    
    // Hugging Face API 응답 형식에 따라 처리
    if (Array.isArray(data) && data.length > 0 && data[0].generated_text) {
        return data[0].generated_text;
    } else if (data.generated_text) {
        return data.generated_text;
    } else {
        throw new Error("Unexpected Mistral API response format");
    }
}

/**
 * Mistral-7B-Instruct를 사용하여 답변과 토큰 사용량을 반환합니다.
 * Hugging Face API는 토큰 사용량을 제공하지 않으므로 0을 반환합니다.
 */
async function generateWithMistralAndUsage(query: string, contextText: string): Promise<{
    answer: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
    const answer = await generateWithMistral(query, contextText);
    return {
        answer,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, // Hugging Face는 토큰 카운팅 없음
    };
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
 * Claude를 사용하여 답변과 토큰 사용량을 반환합니다.
 */
async function generateWithClaudeAndUsage(query: string, contextText: string): Promise<{
    answer: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
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
    const answer = textBlock?.text || "답변을 생성할 수 없습니다.";

    const usage = {
        promptTokens: response.usage?.input_tokens || 0,
        completionTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    };

    return { answer, usage };
}

/**
 * Gemini를 사용하여 답변을 생성합니다.
 */
async function generateWithGemini(query: string, contextText: string): Promise<string> {
    if (!gemini) {
        throw new Error("Gemini API key not configured");
    }

    const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `${SYSTEM_PROMPT}\n\n[Context]\n${contextText}\n\n[Question]\n${query}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return response.text() || "답변을 생성할 수 없습니다.";
}

/**
 * Gemini를 사용하여 답변과 토큰 사용량을 반환합니다.
 */
async function generateWithGeminiAndUsage(query: string, contextText: string): Promise<{
    answer: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
    if (!gemini) {
        throw new Error("Gemini API key not configured");
    }

    const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `${SYSTEM_PROMPT}\n\n[Context]\n${contextText}\n\n[Question]\n${query}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    const answer = response.text() || "답변을 생성할 수 없습니다.";
    
    // Gemini는 usage 정보를 result.response.usageMetadata에 제공
    const usageInfo = result.response.usageMetadata;
    const usage = {
        promptTokens: usageInfo?.promptTokenCount || 0,
        completionTokens: usageInfo?.candidatesTokenCount || 0,
        totalTokens: usageInfo?.totalTokenCount || (usageInfo?.promptTokenCount || 0) + (usageInfo?.candidatesTokenCount || 0),
    };

    return { answer, usage };
}

/**
 * LLM을 사용하여 질문에 대한 답변을 생성합니다.
 * 기획서에 명시된 Fallback Chain: Claude Sonnet 4 → Gemini 1.5 Flash → Mistral-7B-Instruct
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

    // 1차 시도: Claude Sonnet 4 (Primary)
    if (anthropic) {
        try {
            console.log("🔄 Generating answer with Claude...");
            const answer = await generateWithClaude(query, contextText);
            console.log("✅ Claude answer generation successful");
            return answer;
        } catch (error: any) {
            console.warn("⚠️ Claude failed:", error.message || error);
            console.log("🔄 Falling back to Gemini...");
        }
    } else {
        console.log("ℹ️ CLAUDE_API_KEY not set, trying Gemini...");
    }

    // 2차 시도: Gemini 1.5 Flash (Fallback 1)
    if (gemini) {
        try {
            console.log("🔄 Generating answer with Gemini 1.5 Flash (Fallback 1)...");
            const answer = await generateWithGemini(query, contextText);
            console.log("✅ Gemini answer generation successful");
            return answer;
        } catch (error: any) {
            console.warn("⚠️ Gemini failed:", error.message || error);
            console.log("🔄 Falling back to Mistral...");
        }
    } else {
        console.log("ℹ️ GEMINI_API_KEY not set, trying Mistral...");
    }

    // 3차 시도: Mistral-7B-Instruct (Fallback 2)
    if (huggingFaceApiKey) {
        try {
            console.log("🔄 Generating answer with Mistral-7B-Instruct (Fallback 2)...");
            const answer = await generateWithMistral(query, contextText);
            console.log("✅ Mistral answer generation successful");
            return answer;
        } catch (error: any) {
            console.error("❌ Mistral failed:", error.message || error);
        }
    } else {
        console.warn("⚠️ HUGGING_FACE_API_KEY not set, Mistral unavailable");
    }

    return "현재 응답을 생성할 수 없습니다. Claude, Gemini 또는 Mistral API 키를 확인해주세요.";
}

/**
 * LLM을 사용하여 질문에 대한 답변과 토큰 사용량을 생성합니다.
 * 기획서에 명시된 Fallback Chain: Claude Sonnet 4 → Gemini 1.5 Flash → Mistral-7B-Instruct
 *
 * @param {string} query - 사용자 질문
 * @param {SearchResult[]} context - 검색된 관련 문서 리스트
 * @returns {Promise<{answer: string, usage: {promptTokens: number, completionTokens: number, totalTokens: number}}>} 생성된 답변과 토큰 사용량
 */
export async function generateAnswerWithUsage(
    query: string,
    context: SearchResult[]
): Promise<{
    answer: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
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

    // 기본 사용량 (fallback용)
    const defaultUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    if (!contextText) {
        console.warn('⚠️ buildContext가 빈 문자열을 반환했습니다.');
        if (context.length === 0) {
            return {
                answer: "죄송합니다. 관련 정보를 찾을 수 없습니다. 벡터 저장소에 데이터가 없거나 검색 쿼리가 적절하지 않을 수 있습니다.",
                usage: defaultUsage,
            };
        } else {
            return {
                answer: "죄송합니다. 검색 결과는 있지만 내용이 비어있습니다. 벡터 저장소의 데이터를 확인해주세요.",
                usage: defaultUsage,
            };
        }
    }

    // 1차 시도: Claude Sonnet 4 (Primary)
    if (anthropic) {
        try {
            console.log("🔄 Generating answer with Claude Sonnet 4 (Primary)...");
            const result = await generateWithClaudeAndUsage(query, contextText);
            console.log("✅ Claude answer generation successful");
            console.log(`📊 토큰 사용량: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.totalTokens}`);
            return result;
        } catch (error: any) {
            console.warn("⚠️ Claude failed:", error.message || error);
            console.log("🔄 Falling back to Gemini...");
        }
    } else {
        console.log("ℹ️ CLAUDE_API_KEY not set, trying Gemini...");
    }

    // 2차 시도: Gemini 1.5 Flash (Fallback 1)
    if (gemini) {
        try {
            console.log("🔄 Generating answer with Gemini 1.5 Flash (Fallback 1)...");
            const result = await generateWithGeminiAndUsage(query, contextText);
            console.log("✅ Gemini answer generation successful");
            console.log(`📊 토큰 사용량: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.totalTokens}`);
            return result;
        } catch (error: any) {
            console.warn("⚠️ Gemini failed:", error.message || error);
            console.log("🔄 Falling back to Mistral...");
        }
    } else {
        console.log("ℹ️ GEMINI_API_KEY not set, trying Mistral...");
    }

    // 3차 시도: Mistral-7B-Instruct (Fallback 2)
    if (huggingFaceApiKey) {
        try {
            console.log("🔄 Generating answer with Mistral-7B-Instruct (Fallback 2)...");
            const result = await generateWithMistralAndUsage(query, contextText);
            console.log("✅ Mistral answer generation successful");
            console.log(`📊 토큰 사용량: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.totalTokens}`);
            return result;
        } catch (error: any) {
            console.error("❌ Mistral failed:", error.message || error);
        }
    } else {
        console.warn("⚠️ HUGGING_FACE_API_KEY not set, Mistral unavailable");
    }

    return {
        answer: "현재 응답을 생성할 수 없습니다. Claude, Gemini 또는 Mistral API 키를 확인해주세요.",
        usage: defaultUsage,
    };
}
