/**
 * GitHub API를 통해 레포지토리의 모든 파일 내용을 가져옵니다.
 * 소스 코드 레벨 질문에 답하기 위한 데이터 수집용
 */
import { Octokit } from "@octokit/rest";

const token = process.env.GITHUB_TOKEN;
if (!token) {
    throw new Error("❌ GITHUB_TOKEN이 .env에 없습니다.");
}

const octokit = new Octokit({ auth: token });

/**
 * 레포지토리의 기본 브랜치를 가져옵니다.
 */
async function getDefaultBranch(owner: string, repo: string): Promise<string> {
    try {
        const response = await octokit.repos.get({ owner, repo });
        return response.data.default_branch || 'main';
    } catch (error: any) {
        console.warn(`⚠️ 기본 브랜치 가져오기 실패, 'main' 사용: ${error.message}`);
        return 'main';
    }
}

export interface RepositoryFile {
    /** 파일 경로 (상대 경로) */
    path: string;
    /** 파일 내용 */
    content: string;
    /** 파일 크기 (bytes) */
    size: number;
    /** 파일 확장자 */
    extension: string;
    /** 파일 타입 (text, binary 등) */
    type: 'text' | 'binary';
    /** SHA 해시 */
    sha: string;
}

/**
 * 파일 확장자로부터 파일 타입 판단
 */
function getFileType(path: string, size: number): 'text' | 'binary' {
    // 너무 큰 파일은 binary로 간주
    if (size > 1000000) { // 1MB
        return 'binary';
    }

    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz'];
    const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
    
    if (binaryExtensions.includes(ext)) {
        return 'binary';
    }
    
    return 'text';
}

/**
 * Base64 디코딩
 */
function decodeBase64(content: string): string {
    try {
        return Buffer.from(content, 'base64').toString('utf-8');
    } catch (error) {
        console.warn(`⚠️ Base64 디코딩 실패: ${error}`);
        return '';
    }
}

/**
 * GitHub API를 통해 특정 경로의 파일 내용을 가져옵니다.
 */
async function fetchFileContent(owner: string, repo: string, path: string, ref: string = 'main'): Promise<RepositoryFile | null> {
    try {
        const response = await octokit.repos.getContent({
            owner,
            repo,
            path,
            ref,
        });

        // 디렉토리인 경우 null 반환
        if (Array.isArray(response.data)) {
            return null;
        }

        const file = response.data;
        
        // 파일이 아닌 경우 (디렉토리, symlink 등)
        if (file.type !== 'file') {
            return null;
        }

        // Base64로 인코딩된 내용 디코딩
        const content = 'content' in file ? decodeBase64(file.content) : '';
        const extension = path.substring(path.lastIndexOf('.') || 0);
        const size = file.size || 0;
        const type = getFileType(path, size);

        // binary 파일은 내용을 저장하지 않음
        if (type === 'binary') {
            return {
                path,
                content: `[Binary file: ${path}]`,
                size,
                extension,
                type,
                sha: file.sha,
            };
        }

        return {
            path,
            content,
            size,
            extension,
            type,
            sha: file.sha,
        };
    } catch (error: any) {
        // 404는 파일이 없거나 접근 불가능한 경우
        if (error.status === 404) {
            console.warn(`⚠️ 파일을 찾을 수 없음 (${path}): 404`);
            return null;
        }
        console.error(`❌ 파일 가져오기 실패 (${path}):`, error.message || error);
        return null;
    }
}

/**
 * 브랜치 이름을 SHA로 변환합니다.
 */
async function getBranchSha(owner: string, repo: string, branch: string): Promise<string | null> {
    try {
        const response = await octokit.repos.getBranch({
            owner,
            repo,
            branch,
        });
        return response.data.commit.sha;
    } catch (error: any) {
        console.warn(`⚠️ 브랜치 SHA 가져오기 실패 (${branch}):`, error.message);
        return null;
    }
}

/**
 * GitHub API를 통해 레포지토리의 모든 파일 목록을 재귀적으로 가져옵니다.
 */
async function fetchAllFilePaths(owner: string, repo: string, branch: string = 'main'): Promise<string[]> {
    try {
        // 브랜치 이름을 SHA로 변환
        const branchSha = await getBranchSha(owner, repo, branch);
        if (!branchSha) {
            // SHA 변환 실패 시 대체 방법 사용
            console.warn('⚠️ 브랜치 SHA 변환 실패, 대체 방법 사용');
            return await fetchFilePathsRecursive(owner, repo, '', branch);
        }

        // 커밋의 트리 SHA 가져오기
        const commitResponse = await octokit.git.getCommit({
            owner,
            repo,
            commit_sha: branchSha,
        });
        const treeSha = commitResponse.data.tree.sha;

        const response = await octokit.git.getTree({
            owner,
            repo,
            tree_sha: treeSha,
            recursive: '1',
        });

        if (!response.data.tree) {
            return [];
        }

        // 파일만 필터링 (type === 'blob')
        const filePaths = response.data.tree
            .filter((item: any) => item.type === 'blob')
            .map((item: any) => item.path)
            .filter((path: string) => path); // null/undefined 제거

        return filePaths;
    } catch (error: any) {
        // recursive 옵션이 지원되지 않는 경우 (레거시 브랜치 등)
        // 대체 방법으로 contents API 사용
        console.warn('⚠️ Recursive tree 가져오기 실패, 대체 방법 사용:', error.message);
        return await fetchFilePathsRecursive(owner, repo, '', branch);
    }
}

/**
 * 재귀적으로 디렉토리를 탐색하여 파일 경로 목록을 가져옵니다 (fallback)
 */
async function fetchFilePathsRecursive(owner: string, repo: string, dirPath: string = '', ref: string = 'main'): Promise<string[]> {
    try {
        const response = await octokit.repos.getContent({
            owner,
            repo,
            path: dirPath || '.',
            ref,
        });

        if (!Array.isArray(response.data)) {
            return [];
        }

        const filePaths: string[] = [];

        for (const item of response.data) {
            if (item.type === 'file') {
                filePaths.push(item.path);
            } else if (item.type === 'dir') {
                // 재귀적으로 하위 디렉토리 탐색
                const subPaths = await fetchFilePathsRecursive(owner, repo, item.path, ref);
                filePaths.push(...subPaths);
            }
        }

        return filePaths;
    } catch (error: any) {
        console.error(`❌ 디렉토리 탐색 실패 (${dirPath}):`, error.message || error);
        return [];
    }
}

/**
 * 레포지토리의 모든 파일 내용을 비동기로 가져옵니다.
 * 
 * @param owner 레포지토리 소유자
 * @param repo 레포지토리 이름
 * @param ref 브랜치/태그 (기본값: null이면 자동으로 기본 브랜치 사용)
 * @param options 옵션
 * @returns 파일 목록과 내용
 */
export async function fetchRepositoryFiles(
    owner: string,
    repo: string,
    ref: string | null = null,
    options: {
        /** 최대 파일 크기 (bytes, 기본값: 500KB) */
        maxFileSize?: number;
        /** 제외할 파일 확장자 */
        excludeExtensions?: string[];
        /** 제외할 경로 패턴 */
        excludePaths?: string[];
        /** 동시 요청 수 (기본값: 5) */
        concurrency?: number;
    } = {}
): Promise<RepositoryFile[]> {
    // ref가 없으면 기본 브랜치 가져오기
    const branch = ref || await getDefaultBranch(owner, repo);
    const {
        maxFileSize = 500000, // 500KB
        excludeExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf'],
        excludePaths = ['node_modules', '.git', 'dist', 'build', '.next', '.venv', '__pycache__'],
        concurrency = 5,
    } = options;

    console.log(`📂 레포지토리 파일 목록 가져오는 중... (${owner}/${repo}@${branch})`);

    // 1. 모든 파일 경로 가져오기
    const allPaths = await fetchAllFilePaths(owner, repo, branch);
    console.log(`   → ${allPaths.length}개 파일 발견`);

    // 2. 필터링
    const filteredPaths = allPaths.filter(path => {
        // 제외 경로 패턴 확인
        // 주의: '.git'은 '.github'도 매칭하므로 정확한 경로 매칭 필요
        if (excludePaths.some(exclude => {
            // 정확한 경로 매칭 (시작 부분 또는 경로 구분자 포함)
            if (exclude === '.git') {
                // '.git'은 '.github'를 제외하지 않도록 정확히 매칭
                return path === '.git' || path.startsWith('.git/') || path.includes('/.git/');
            }
            return path.includes(exclude);
        })) {
            return false;
        }

        // 제외 확장자 확인
        const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
        if (excludeExtensions.includes(ext)) {
            return false;
        }

        return true;
    });

    // 디버깅: .github 파일 확인
    const githubFiles = allPaths.filter(path => path.includes('.github'));
    if (githubFiles.length > 0) {
        console.log(`   📌 .github 디렉토리 파일: ${githubFiles.length}개 발견`);
        githubFiles.forEach(path => console.log(`      - ${path}`));
    }
    const filteredGithubFiles = filteredPaths.filter(path => path.includes('.github'));
    if (filteredGithubFiles.length !== githubFiles.length) {
        console.warn(`   ⚠️ .github 파일 필터링: ${githubFiles.length}개 → ${filteredGithubFiles.length}개`);
    }

    console.log(`   → ${filteredPaths.length}개 파일 필터링됨`);

    // 3. 파일 내용을 비동기로 가져오기 (동시성 제어)
    const files: RepositoryFile[] = [];
    const errors: string[] = [];

    // 동시성 제어를 위한 배치 처리
    for (let i = 0; i < filteredPaths.length; i += concurrency) {
        const batch = filteredPaths.slice(i, i + concurrency);
        const batchPromises = batch.map(async (path) => {
            const file = await fetchFileContent(owner, repo, path, branch);
            if (file) {
                // 파일 크기 체크
                if (file.size <= maxFileSize) {
                    return file;
                } else {
                    console.warn(`⚠️ 파일 크기 초과, 건너뜀: ${path} (${file.size} bytes)`);
                    return null;
                }
            }
            return null;
        });

        const batchResults = await Promise.all(batchPromises);
        const validFiles = batchResults.filter((file): file is RepositoryFile => file !== null);
        files.push(...validFiles);

        // 진행 상황 출력
        const processed = Math.min(i + concurrency, filteredPaths.length);
        console.log(`   → ${processed}/${filteredPaths.length} 파일 처리 중...`);
    }

    console.log(`   ✅ ${files.length}개 파일 내용 가져오기 완료`);

    return files;
}

