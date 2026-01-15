/**
 * Semantic Code Chunker
 * 소스 코드를 의미 단위(클래스, 함수, 메서드)로 분할하는 유틸리티
 */

export interface CodeChunk {
  content: string;
  chunkIndex: number;
  totalChunks: number;
  startLine: number;
  endLine: number;
  type: 'class' | 'function' | 'method' | 'block' | 'full';
  name?: string;
}

export interface ChunkOptions {
  maxChunkSize?: number;     // 최대 청크 크기 (문자 수)
  minChunkSize?: number;     // 최소 청크 크기
  overlapPercent?: number;   // 인접 청크 간 오버랩 비율 (0-1)
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxChunkSize: 4000,
  minChunkSize: 200,
  overlapPercent: 0.08,
};

interface SemanticBoundary {
  startLine: number;
  type: CodeChunk['type'];
  name?: string;
}

/**
 * TypeScript/JavaScript 코드를 의미 단위로 분할
 */
export function chunkTypeScriptCode(
  code: string,
  filePath: string,
  options: ChunkOptions = {}
): CodeChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = code.split('\n');

  // 파일이 충분히 작으면 청킹하지 않음
  if (code.length <= opts.maxChunkSize) {
    return [{
      content: code,
      chunkIndex: 0,
      totalChunks: 1,
      startLine: 1,
      endLine: lines.length,
      type: 'full',
    }];
  }

  const chunks: CodeChunk[] = [];
  const boundaries = findSemanticBoundaries(lines, filePath);

  if (boundaries.length === 0) {
    // 의미 경계를 찾지 못하면 크기 기반으로 분할
    return chunkBySize(code, opts);
  }

  // 의미 경계를 기반으로 청크 생성
  let currentChunkStart = 0;
  let currentChunkLines: string[] = [];
  let currentType: CodeChunk['type'] = 'block';
  let currentName: string | undefined;

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    if (!boundary) continue;

    const nextBoundary = boundaries[i + 1];

    const boundaryLines = lines.slice(
      boundary.startLine,
      nextBoundary ? nextBoundary.startLine : lines.length
    );

    const boundaryContent = boundaryLines.join('\n');

    // 현재 청크에 추가했을 때 크기 초과 확인
    const potentialContent = [...currentChunkLines, ...boundaryLines].join('\n');

    if (potentialContent.length > opts.maxChunkSize && currentChunkLines.length > 0) {
      // 현재 청크 저장
      const chunkContent = currentChunkLines.join('\n');
      if (chunkContent.length >= opts.minChunkSize) {
        chunks.push({
          content: chunkContent,
          chunkIndex: chunks.length,
          totalChunks: 0, // 나중에 업데이트
          startLine: currentChunkStart + 1,
          endLine: currentChunkStart + currentChunkLines.length,
          type: currentType,
          name: currentName,
        });
      }

      // 오버랩 적용
      const overlapLines = Math.floor(currentChunkLines.length * opts.overlapPercent);
      currentChunkLines = currentChunkLines.slice(-overlapLines);
      currentChunkStart = boundary.startLine - overlapLines;
    }

    // 경계 내용 추가
    currentChunkLines.push(...boundaryLines);
    currentType = boundary.type;
    currentName = boundary.name;

    // 단일 경계가 이미 너무 크면 분할
    if (boundaryContent.length > opts.maxChunkSize) {
      const subChunks = chunkLargeBlock(
        boundaryContent,
        boundary.startLine,
        boundary.type,
        boundary.name,
        opts
      );

      // 현재 청크 버리고 서브청크로 교체
      currentChunkLines = [];
      for (const subChunk of subChunks) {
        chunks.push({
          ...subChunk,
          chunkIndex: chunks.length,
          totalChunks: 0,
        });
      }
      currentChunkStart = nextBoundary ? nextBoundary.startLine : lines.length;
    }
  }

  // 마지막 청크 저장
  if (currentChunkLines.length > 0) {
    const chunkContent = currentChunkLines.join('\n');
    if (chunkContent.length >= opts.minChunkSize) {
      chunks.push({
        content: chunkContent,
        chunkIndex: chunks.length,
        totalChunks: 0,
        startLine: currentChunkStart + 1,
        endLine: currentChunkStart + currentChunkLines.length,
        type: currentType,
        name: currentName,
      });
    }
  }

  // totalChunks 업데이트
  const totalChunks = chunks.length;
  return chunks.map(chunk => ({ ...chunk, totalChunks }));
}

/**
 * 의미 경계(클래스, 함수, 메서드) 찾기
 */
function findSemanticBoundaries(lines: string[], _filePath: string): SemanticBoundary[] {
  const boundaries: SemanticBoundary[] = [];

  // TypeScript/JavaScript 패턴
  const patterns = {
    class: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
    interface: /^(?:export\s+)?interface\s+(\w+)/,
    type: /^(?:export\s+)?type\s+(\w+)/,
    function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    arrowFunction: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
    defaultExport: /^export\s+default\s+(?:async\s+)?function(?:\s+(\w+))?/,
    method: /^\s+(?:async\s+)?(?:public|private|protected|static|get|set)?\s*(\w+)\s*\(/,
  };

  let inClass = false;
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    const trimmedLine = line.trim();

    // 빈 줄이나 주석 무시
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
      continue;
    }

    // 중괄호 카운트
    braceCount += (line.match(/\{/g) || []).length;
    braceCount -= (line.match(/\}/g) || []).length;

    // 클래스 진입/탈출 추적
    if (patterns.class.test(trimmedLine)) {
      inClass = true;
      const match = trimmedLine.match(patterns.class);
      boundaries.push({ startLine: i, type: 'class', name: match?.[1] });
      continue;
    }

    if (inClass && braceCount === 0) {
      inClass = false;
    }

    // 인터페이스
    if (patterns.interface.test(trimmedLine)) {
      const match = trimmedLine.match(patterns.interface);
      boundaries.push({ startLine: i, type: 'class', name: match?.[1] });
      continue;
    }

    // 타입 선언
    if (patterns.type.test(trimmedLine)) {
      const match = trimmedLine.match(patterns.type);
      boundaries.push({ startLine: i, type: 'class', name: match?.[1] });
      continue;
    }

    // 함수 선언
    if (patterns.function.test(trimmedLine)) {
      const match = trimmedLine.match(patterns.function);
      boundaries.push({ startLine: i, type: 'function', name: match?.[1] });
      continue;
    }

    // 화살표 함수
    if (patterns.arrowFunction.test(trimmedLine)) {
      const match = trimmedLine.match(patterns.arrowFunction);
      boundaries.push({ startLine: i, type: 'function', name: match?.[1] });
      continue;
    }

    // export default
    if (patterns.defaultExport.test(trimmedLine)) {
      const match = trimmedLine.match(patterns.defaultExport);
      boundaries.push({ startLine: i, type: 'function', name: match?.[1] || 'default' });
      continue;
    }

    // 클래스 내부 메서드
    if (inClass && patterns.method.test(line) && !trimmedLine.startsWith('//')) {
      const match = line.match(patterns.method);
      if (match?.[1] && !['if', 'for', 'while', 'switch', 'catch'].includes(match[1])) {
        boundaries.push({ startLine: i, type: 'method', name: match[1] });
      }
    }
  }

  // 시작 부분이 없으면 추가
  const firstBoundary = boundaries[0];
  if (boundaries.length === 0 || (firstBoundary && firstBoundary.startLine > 0)) {
    boundaries.unshift({ startLine: 0, type: 'block' });
  }

  return boundaries;
}

/**
 * 큰 블록을 내부 로직 단위로 추가 분할
 */
function chunkLargeBlock(
  content: string,
  startLine: number,
  type: CodeChunk['type'],
  name: string | undefined,
  opts: Required<ChunkOptions>
): CodeChunk[] {
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];

  // 내부 로직 블록 찾기 (if, for, while, try-catch 등)
  const logicBoundaries: number[] = [0];
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    const trimmed = line.trim();

    // 최상위 레벨 로직 블록 찾기
    if (braceDepth <= 1) {
      if (/^(if|for|while|switch|try|catch|else)\s*[\(\{]?/.test(trimmed)) {
        logicBoundaries.push(i);
      }
    }

    braceDepth += (line.match(/\{/g) || []).length;
    braceDepth -= (line.match(/\}/g) || []).length;
  }

  // 로직 경계로 분할
  for (let i = 0; i < logicBoundaries.length; i++) {
    const start = logicBoundaries[i];
    if (start === undefined) continue;

    const end = logicBoundaries[i + 1] ?? lines.length;
    const blockLines = lines.slice(start, end);
    const blockContent = blockLines.join('\n');

    if (blockContent.length <= opts.maxChunkSize) {
      chunks.push({
        content: blockContent,
        chunkIndex: 0,
        totalChunks: 0,
        startLine: startLine + start + 1,
        endLine: startLine + end,
        type,
        name,
      });
    } else {
      // 여전히 크면 크기 기반으로 분할
      const sizeChunks = chunkBySize(blockContent, opts);
      for (const chunk of sizeChunks) {
        chunks.push({
          ...chunk,
          startLine: startLine + start + chunk.startLine,
          endLine: startLine + start + chunk.endLine,
          type,
          name,
        });
      }
    }
  }

  return chunks;
}

/**
 * 크기 기반 청킹 (의미 경계를 찾지 못했을 때 폴백)
 */
function chunkBySize(content: string, opts: Required<ChunkOptions>): CodeChunk[] {
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];

  let currentLines: string[] = [];
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    currentLines.push(line);
    const currentContent = currentLines.join('\n');

    if (currentContent.length >= opts.maxChunkSize) {
      // 청크 저장
      chunks.push({
        content: currentContent,
        chunkIndex: chunks.length,
        totalChunks: 0,
        startLine: startLine + 1,
        endLine: i + 1,
        type: 'block',
      });

      // 오버랩 적용
      const overlapLines = Math.floor(currentLines.length * opts.overlapPercent);
      currentLines = currentLines.slice(-overlapLines);
      startLine = i + 1 - overlapLines;
    }
  }

  // 마지막 청크
  if (currentLines.length > 0 && currentLines.join('\n').length >= opts.minChunkSize) {
    chunks.push({
      content: currentLines.join('\n'),
      chunkIndex: chunks.length,
      totalChunks: 0,
      startLine: startLine + 1,
      endLine: lines.length,
      type: 'block',
    });
  }

  // totalChunks 업데이트
  const totalChunks = chunks.length;
  return chunks.map(chunk => ({ ...chunk, totalChunks }));
}

/**
 * 파일 확장자에 따른 청킹 전략 선택
 */
export function chunkSourceCode(
  content: string,
  filePath: string,
  options: ChunkOptions = {}
): CodeChunk[] {
  const ext = filePath.split('.').pop()?.toLowerCase();

  // TypeScript/JavaScript
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext || '')) {
    return chunkTypeScriptCode(content, filePath, options);
  }

  // Python
  if (ext === 'py') {
    return chunkPythonCode(content, filePath, options);
  }

  // 기타 파일은 크기 기반으로
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return chunkBySize(content, opts);
}

/**
 * Python 코드 청킹
 */
function chunkPythonCode(
  code: string,
  _filePath: string,
  options: ChunkOptions = {}
): CodeChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = code.split('\n');

  if (code.length <= opts.maxChunkSize) {
    return [{
      content: code,
      chunkIndex: 0,
      totalChunks: 1,
      startLine: 1,
      endLine: lines.length,
      type: 'full',
    }];
  }

  const boundaries: SemanticBoundary[] = [];

  // Python 패턴
  const classPattern = /^class\s+(\w+)/;
  const functionPattern = /^(?:async\s+)?def\s+(\w+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    const trimmed = line.trim();

    if (classPattern.test(trimmed)) {
      const match = trimmed.match(classPattern);
      boundaries.push({ startLine: i, type: 'class', name: match?.[1] });
    } else if (functionPattern.test(trimmed) && !line.startsWith(' ')) {
      const match = trimmed.match(functionPattern);
      boundaries.push({ startLine: i, type: 'function', name: match?.[1] });
    }
  }

  if (boundaries.length === 0) {
    return chunkBySize(code, opts);
  }

  // 경계 기반으로 분할
  const chunks: CodeChunk[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    if (!boundary) continue;

    const start = boundary.startLine;
    const nextBoundary = boundaries[i + 1];
    const end = nextBoundary?.startLine ?? lines.length;
    const chunkLines = lines.slice(start, end);
    const chunkContent = chunkLines.join('\n');

    if (chunkContent.length > opts.maxChunkSize) {
      const subChunks = chunkBySize(chunkContent, opts);
      for (const sub of subChunks) {
        chunks.push({
          ...sub,
          startLine: start + sub.startLine,
          endLine: start + sub.endLine,
          type: boundary.type,
          name: boundary.name,
        });
      }
    } else if (chunkContent.length >= opts.minChunkSize) {
      chunks.push({
        content: chunkContent,
        chunkIndex: chunks.length,
        totalChunks: 0,
        startLine: start + 1,
        endLine: end,
        type: boundary.type,
        name: boundary.name,
      });
    }
  }

  const totalChunks = chunks.length;
  return chunks.map((chunk, idx) => ({ ...chunk, chunkIndex: idx, totalChunks }));
}
