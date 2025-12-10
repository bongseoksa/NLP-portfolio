/**
 * GitHub API로부터 수집된 커밋 정보를 나타내는 인터페이스입니다.
 */
export interface CommitItem {
    /** 커밋의 SHA 식별자 */
    sha: string;
    /** 커밋 작성자 이름 (GitHub 사용자명 또는 git author name) */
    author: string | null;
    /** 커밋 날짜 (ISO 8601 문자열) */
    date: string;
    /** 커밋 메시지 본문 */
    message: string;
    /** 커밋의 GitHub 웹 URL */
    url: string;
}

/**
 * 로컬 Git 저장소(`git log`)에서 파싱된 커밋 정보를 나타내는 인터페이스입니다.
 */
export interface LocalCommitLog {
    /** 커밋의 SHA 식별자 */
    sha: string;
    /** 커밋 작성자 이름 */
    author: string;
    /** 커밋 날짜 (ISO 8601 형식) */
    date: string;
    /** 커밋 메시지 */
    message: string;
}
