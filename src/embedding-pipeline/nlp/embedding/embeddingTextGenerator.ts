/**
 * Embedding Text Generator
 *
 * Commit, Diff, File 엔티티를 자연어로 변환하여 임베딩 품질을 최적화합니다.
 * 원시 코드 대신 사람이 질문하는 형태의 텍스트를 생성합니다.
 */

import type { RefinedItem } from '../../../shared/models/refinedData.js';

/**
 * Commit 엔티티를 자연어로 변환
 *
 * 초점: 변경 의도와 맥락
 * - "왜" 이 변경이 이루어졌는가
 * - "무엇을" 위한 변경인가
 * - 전체 컨텍스트 제공
 */
export function generateCommitEmbeddingText(item: RefinedItem): string {
    const { message, author, date, affectedFiles } = item.metadata;

    // 커밋 메시지에서 의도 추출
    const intent = extractCommitIntent(message || '');

    // 영향받은 파일 목록 생성
    const fileList = affectedFiles && affectedFiles.length > 0
        ? affectedFiles.slice(0, 5).join(', ')
        : '알 수 없음';

    const moreFiles = affectedFiles && affectedFiles.length > 5
        ? ` 외 ${affectedFiles.length - 5}개 파일`
        : '';

    // 자연어 문장 생성
    return `이 커밋은 ${intent}을(를) 위한 변경사항입니다.
작성자: ${author || '알 수 없음'}
날짜: ${date || '알 수 없음'}
변경된 파일: ${fileList}${moreFiles}

변경 목적: ${message || '설명 없음'}

이 업데이트는 ${intent}과(와) 관련된 작업을 수행합니다.`;
}

/**
 * Diff 엔티티를 자연어로 변환
 *
 * 초점: 구현 수준의 변경사항
 * - "어떻게" 변경되었는가
 * - Before/After 비교
 * - 의미론적 변화
 */
export function generateDiffEmbeddingText(item: RefinedItem): string {
    const {
        filePath,
        diffType,
        fileAdditions,
        fileDeletions,
        changeCategory,
        semanticHint
    } = item.metadata;

    // Diff 타입을 자연어로 변환
    const diffTypeText = ({
        add: '새로 추가된',
        modify: '수정된',
        delete: '삭제된',
        rename: '이름이 변경된'
    } as Record<string, string>)[diffType || 'modify'];

    // 변경 카테고리를 자연어로 변환
    const categoryText = ({
        feat: '새로운 기능 추가',
        fix: '버그 수정',
        refactor: '리팩토링',
        docs: '문서 업데이트',
        style: '코드 스타일 변경',
        test: '테스트 추가/수정',
        chore: '기타 변경사항'
    } as Record<string, string>)[changeCategory || 'chore'];

    // 변경 규모 설명
    const changeSize = `${fileAdditions || 0}줄 추가, ${fileDeletions || 0}줄 삭제`;

    // 의미론적 힌트 추출
    const semanticChanges = semanticHint && semanticHint.length > 0
        ? `\n의미론적 변화: ${semanticHint.join(', ')}`
        : '';

    // content에서 Before/After 추출 시도
    const beforeAfter = extractBeforeAfter(item.content);

    // 자연어 문장 생성
    return `${filePath} 파일에서 ${diffTypeText} 변경사항입니다.

변경 유형: ${categoryText}
변경 규모: ${changeSize}${semanticChanges}

${beforeAfter}

이 변경은 ${categoryText}을(를) 목적으로 ${filePath}의 로직을 수정했습니다.`;
}

/**
 * File 엔티티를 자연어로 변환
 *
 * 초점: 현재 상태와 역할
 * - 파일이 "무엇을" 하는가
 * - 어떤 기능을 제공하는가
 * - Export/Import 관계
 * - 실제 코드 내용 (중요!)
 */
export function generateFileEmbeddingText(item: RefinedItem): string {
    const {
        path,
        fileType,
        extension,
        size,
        chunkIndex,
        totalChunks
    } = item.metadata;

    // 파일 타입을 자연어로 설명
    const typeDescription = ({
        src: '소스 코드 파일',
        test: '테스트 파일',
        config: '설정 파일',
        docs: '문서 파일',
        unknown: '파일'
    } as Record<string, string>)[fileType || 'unknown'];

    // 확장자로 기술 스택 추론
    const techStack = inferTechStack(extension || '');

    // content에서 export/import/함수/클래스 추출
    const { exports, imports, functionality, functions, classes } = analyzeFileContent(item.content);

    // 청크 정보 (파일이 분할된 경우)
    const chunkInfo = chunkIndex !== undefined && totalChunks !== undefined
        ? `\n이 문서는 전체 ${totalChunks}개 청크 중 ${chunkIndex + 1}번째 부분입니다.`
        : '';

    // 실제 코드 내용 추출 (content에서 "Content:" 이후 부분)
    const contentParts = item.content.split('Content:');
    const actualCode = contentParts.length > 1 && contentParts[1] ? contentParts[1].trim() : '';

    // 코드 스니펫 (너무 길면 앞부분만)
    const maxCodeLength = 3000;
    const codeSnippet = actualCode.length > maxCodeLength
        ? actualCode.substring(0, maxCodeLength) + '\n...(생략)...'
        : actualCode;

    // 함수/클래스 정보
    const functionsInfo = functions.length > 0
        ? `\n정의된 함수: ${functions.join(', ')}`
        : '';
    const classesInfo = classes.length > 0
        ? `\n정의된 클래스: ${classes.join(', ')}`
        : '';

    // 자연어 문장 생성
    return `이 파일은 ${path}에 위치한 ${typeDescription}입니다.

기술 스택: ${techStack}
파일 크기: ${formatFileSize(size || 0)}

제공하는 기능:
${functionality}

Export하는 항목: ${exports.length > 0 ? exports.join(', ') : '없음'}
Import하는 모듈: ${imports.length > 0 ? imports.slice(0, 5).join(', ') : '없음'}${imports.length > 5 ? ` 외 ${imports.length - 5}개` : ''}${functionsInfo}${classesInfo}${chunkInfo}

이 파일은 ${functionality}을(를) 담당합니다.

=== 실제 코드 내용 ===
${codeSnippet}`;
}

/**
 * 커밋 메시지에서 의도 추출
 */
function extractCommitIntent(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('feat:') || lowerMessage.includes('feature:')) {
        return '새로운 기능 추가';
    }
    if (lowerMessage.includes('fix:')) {
        return '버그 수정';
    }
    if (lowerMessage.includes('refactor:')) {
        return '코드 리팩토링';
    }
    if (lowerMessage.includes('docs:')) {
        return '문서 업데이트';
    }
    if (lowerMessage.includes('test:')) {
        return '테스트 추가';
    }
    if (lowerMessage.includes('chore:')) {
        return '개발 환경 설정';
    }
    if (lowerMessage.includes('style:')) {
        return '코드 스타일 변경';
    }

    // 키워드 기반 추론
    if (lowerMessage.includes('add') || lowerMessage.includes('추가')) {
        return '새로운 기능 추가';
    }
    if (lowerMessage.includes('update') || lowerMessage.includes('수정')) {
        return '기능 업데이트';
    }
    if (lowerMessage.includes('remove') || lowerMessage.includes('delete') || lowerMessage.includes('삭제')) {
        return '기능 제거';
    }

    return '코드 변경';
}

/**
 * Diff content에서 Before/After 추출
 */
function extractBeforeAfter(content: string): string {
    const lines = content.split('\n');
    const removedLines: string[] = [];
    const addedLines: string[] = [];

    for (const line of lines) {
        if (line.startsWith('-') && !line.startsWith('---')) {
            removedLines.push(line.substring(1).trim());
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
            addedLines.push(line.substring(1).trim());
        }
    }

    // 너무 많은 줄은 요약
    const maxLines = 3;
    const beforeText = removedLines.length > 0
        ? removedLines.slice(0, maxLines).join('\n') + (removedLines.length > maxLines ? '\n...' : '')
        : '없음';
    const afterText = addedLines.length > 0
        ? addedLines.slice(0, maxLines).join('\n') + (addedLines.length > maxLines ? '\n...' : '')
        : '없음';

    return `변경 전:
${beforeText}

변경 후:
${afterText}`;
}

/**
 * 파일 확장자로 기술 스택 추론
 */
function inferTechStack(extension: string): string {
    const techMap: Record<string, string> = {
        'ts': 'TypeScript',
        'tsx': 'TypeScript + React',
        'js': 'JavaScript',
        'jsx': 'JavaScript + React',
        'py': 'Python',
        'java': 'Java',
        'go': 'Go',
        'rs': 'Rust',
        'cpp': 'C++',
        'c': 'C',
        'md': 'Markdown',
        'json': 'JSON',
        'yml': 'YAML',
        'yaml': 'YAML',
        'sql': 'SQL',
        'css': 'CSS',
        'scss': 'SCSS',
        'html': 'HTML'
    };

    return techMap[extension] || extension.toUpperCase();
}

/**
 * 파일 content에서 export/import/functionality 분석
 */
function analyzeFileContent(content: string): {
    exports: string[];
    imports: string[];
    functionality: string;
    functions: string[];
    classes: string[];
} {
    const lines = content.split('\n');
    const exports: string[] = [];
    const imports: string[] = [];
    const functions: string[] = [];
    const classes: string[] = [];
    let functionality = '코드 파일';

    // Export 추출
    for (const line of lines) {
        // export function/const/class/interface/type
        const exportMatch = line.match(/export\s+(function|const|let|class|interface|type|enum)\s+(\w+)/);
        if (exportMatch && exportMatch[2]) {
            exports.push(exportMatch[2]);
        }

        // export { ... }
        const exportBlockMatch = line.match(/export\s+\{([^}]+)\}/);
        if (exportBlockMatch && exportBlockMatch[1]) {
            const items = exportBlockMatch[1].split(',').map(s => {
                const parts = s.trim().split(/\s+as\s+/);
                return parts[0] || '';
            }).filter(s => s.length > 0);
            exports.push(...items);
        }
    }

    // Import 추출
    for (const line of lines) {
        const importMatch = line.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/);
        if (importMatch && importMatch[1]) {
            imports.push(importMatch[1]);
        }
    }

    // 함수 정의 추출 (function, const/let arrow functions, async functions)
    for (const line of lines) {
        // function functionName
        const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
        if (funcMatch && funcMatch[1]) {
            functions.push(funcMatch[1]);
        }

        // const/let functionName =
        const arrowMatch = line.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/);
        if (arrowMatch && arrowMatch[1]) {
            functions.push(arrowMatch[1]);
        }
    }

    // 클래스 정의 추출
    for (const line of lines) {
        const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
        if (classMatch && classMatch[1]) {
            classes.push(classMatch[1]);
        }
    }

    // Functionality 추론 (파일 내용 기반)
    const contentLower = content.toLowerCase();

    if (contentLower.includes('express') || contentLower.includes('app.listen')) {
        functionality = 'Express 서버 구현';
    } else if (contentLower.includes('router') && contentLower.includes('route')) {
        functionality = 'API 라우팅 처리';
    } else if (contentLower.includes('react') || contentLower.includes('usestate') || contentLower.includes('useeffect')) {
        functionality = 'React 컴포넌트 구현';
    } else if (contentLower.includes('test(') || contentLower.includes('describe(') || contentLower.includes('it(')) {
        functionality = '테스트 코드';
    } else if (contentLower.includes('interface') && contentLower.includes('type')) {
        functionality = 'TypeScript 타입 정의';
    } else if (contentLower.includes('async') && contentLower.includes('await')) {
        functionality = '비동기 로직 처리';
    } else if (exports.length > 0) {
        functionality = `${exports.slice(0, 3).join(', ')} 등을 제공하는 모듈`;
    }

    return { exports, imports, functionality, functions, classes };
}

/**
 * 파일 크기를 읽기 쉬운 형태로 포맷
 */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
