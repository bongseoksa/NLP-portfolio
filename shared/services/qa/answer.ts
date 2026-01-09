/**
 * Answer Generation Service
 * LLM을 사용한 답변 생성 (Fallback 체인)
 *
 * 우선순위: Claude → OpenAI → Gemini
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { SearchResult } from '../../models/SearchResult.js';

/**
 * 컨텍스트 기반 답변 생성
 */
export async function generateAnswer(
  question: string,
  sources: SearchResult[]
): Promise<string> {
  // Build context from sources
  const context = sources
    .map((s, i) => {
      const typeLabel = s.type === 'commit' ? '커밋' : s.type === 'file' ? '파일' : 'Q&A';
      return `[${i + 1}] (${typeLabel}, 유사도: ${(s.score * 100).toFixed(1)}%)\n${s.content}`;
    })
    .join('\n\n---\n\n');

  const systemPrompt = `당신은 GitHub 리포지토리 분석 전문가입니다.
주어진 컨텍스트(커밋 메시지, 소스 코드, 이전 Q&A)를 기반으로 질문에 답변하세요.

답변 가이드라인:
- 한국어로 답변하세요
- 컨텍스트에서 관련 정보를 찾아 구체적으로 답변하세요
- 코드나 커밋 정보를 인용할 때는 출처를 명시하세요
- 컨텍스트에 관련 정보가 없으면 솔직히 "관련 정보를 찾지 못했습니다"라고 답변하세요
- 추측하지 말고 사실만 전달하세요`;

  const userPrompt = `## 컨텍스트
${context}

## 질문
${question}

## 답변`;

  // Try Claude first
  if (process.env.CLAUDE_API_KEY) {
    try {
      const answer = await generateWithClaude(systemPrompt, userPrompt);
      if (answer) return answer;
    } catch (error) {
      console.error('[LLM] Claude API failed:', error);
    }
  }

  // Try OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const answer = await generateWithOpenAI(systemPrompt, userPrompt);
      if (answer) return answer;
    } catch (error) {
      console.error('[LLM] OpenAI API failed:', error);
    }
  }

  // Try Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const answer = await generateWithGemini(systemPrompt, userPrompt);
      if (answer) return answer;
    } catch (error) {
      console.error('[LLM] Gemini API failed:', error);
    }
  }

  return '죄송합니다. 현재 답변을 생성할 수 없습니다. API 키를 확인해주세요.';
}

/**
 * Claude API로 답변 생성
 */
async function generateWithClaude(
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (textBlock && textBlock.type === 'text') {
    console.log('[LLM] Generated answer with Claude');
    return textBlock.text;
  }

  return null;
}

/**
 * OpenAI API로 답변 생성
 */
async function generateWithOpenAI(
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 1024,
  });

  const content = response.choices[0]?.message?.content;
  if (content) {
    console.log('[LLM] Generated answer with OpenAI');
    return content;
  }

  return null;
}

/**
 * Gemini API로 답변 생성
 */
async function generateWithGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<string | null> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `${systemPrompt}\n\n${userPrompt}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  if (text) {
    console.log('[LLM] Generated answer with Gemini');
    return text;
  }

  return null;
}
