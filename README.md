# GitHub Analyzer

GitHub Analyzer is a tool that analyzes GitHub repositories to extract information about the code and the commit history. It can be used to generate a report of the code and the commit history, or to generate a report of the code and the commit history for a specific repository.

## Installation

```bash
pnpm install
```

## Usage

```bash
pnpm run start
```

## License

MIT

## 세팅 과정

```bash
pnpm init # package.json 생성
pnpm add -D typescript ts-node @types/node

npx tsc --init # tsconfig.json 생성
```



## GitHub API로 커밋 목록 가져오기 코드 작성

- 커밋 SHA
- 작성자
- 날짜
- 메시지
- 변경된 파일 정보

## 로컬 git log 파서 생성

```bash
    git log --name-status
    git show <sha>
    git diff <sha>^ <sha>
```
등을 활용한 파일별 diff 스니펫 생성

