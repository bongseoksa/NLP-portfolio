# GitHub Actions Python 임베딩 파이프라인 설계

GitHub Actions 환경에서 ChromaDB를 임시로 사용하여 임베딩을 생성하고 JSON 파일로 export하는 파이프라인 설계 문서입니다.

## 1. Python 임베딩 스크립트 구조

### 1.1 메인 파이프라인 스크립트 (`scripts/embed_pipeline.py`)

```python
#!/usr/bin/env python3
"""
GitHub Actions 환경에서 실행되는 임베딩 파이프라인
- GitHub API로 데이터 수집 (commit / diff / file)
- ChromaDB에 임시 저장
- 실행 종료 후 JSON 파일로 export
"""

import os
import json
import sys
from typing import List, Dict, Any
from datetime import datetime

# 외부 라이브러리
import chromadb
from chromadb.config import Settings
from openai import OpenAI
import requests
from github import Github


class EmbeddingPipeline:
    """임베딩 파이프라인 메인 클래스"""
    
    def __init__(self):
        # 환경 변수 로드
        self.github_token = os.getenv("GITHUB_TOKEN")
        self.openai_key = os.getenv("OPENAI_API_KEY")
        self.repo_owner = os.getenv("TARGET_REPO_OWNER")
        self.repo_name = os.getenv("TARGET_REPO_NAME")
        
        # ChromaDB 클라이언트 초기화 (임시 사용)
        self.chroma_client = chromadb.Client(Settings(
            chroma_api_impl="rest",
            chroma_server_host=os.getenv("CHROMA_HOST", "localhost"),
            chroma_server_http_port=int(os.getenv("CHROMA_PORT", "8000"))
        ))
        
        # OpenAI 클라이언트
        self.openai_client = OpenAI(api_key=self.openai_key)
        
        # GitHub 클라이언트
        self.github_client = Github(self.github_token)
        self.repo = self.github_client.get_repo(f"{self.repo_owner}/{self.repo_name}")
        
        # 컬렉션 이름
        self.collection_name = f"{self.repo_name}-vectors"
        self.collection = None
        
    def setup_collection(self, reset: bool = False):
        """ChromaDB 컬렉션 생성/초기화"""
        if reset:
            try:
                self.chroma_client.delete_collection(self.collection_name)
                print(f"🗑️  Deleted existing collection: {self.collection_name}")
            except:
                pass
        
        try:
            self.collection = self.chroma_client.get_collection(self.collection_name)
            print(f"📂 Using existing collection: {self.collection_name}")
        except:
            self.collection = self.chroma_client.create_collection(
                name=self.collection_name,
                metadata={"owner": self.repo_owner, "repo": self.repo_name}
            )
            print(f"✨ Created new collection: {self.collection_name}")
    
    def fetch_commits(self) -> List[Dict[str, Any]]:
        """GitHub API로 커밋 목록 수집"""
        print("📌 Fetching commits from GitHub...")
        commits = []
        page = 1
        per_page = 100
        
        while True:
            url = f"https://api.github.com/repos/{self.repo_owner}/{self.repo_name}/commits"
            params = {"per_page": per_page, "page": page}
            headers = {
                "Authorization": f"Bearer {self.github_token}",
                "Accept": "application/vnd.github+json"
            }
            
            response = requests.get(url, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            if not data:
                break
            
            for commit in data:
                commits.append({
                    "sha": commit["sha"],
                    "message": commit["commit"]["message"],
                    "author": commit["commit"]["author"]["name"],
                    "date": commit["commit"]["author"]["date"],
                    "url": commit["html_url"]
                })
            
            if len(data) < per_page:
                break
            page += 1
        
        print(f"   → Fetched {len(commits)} commits")
        return commits
    
    def fetch_commit_files(self, sha: str) -> List[Dict[str, Any]]:
        """특정 커밋의 변경 파일 및 diff 수집"""
        commit = self.repo.get_commit(sha)
        files = []
        
        for file in commit.files:
            files.append({
                "filename": file.filename,
                "status": file.status,  # added, modified, removed
                "additions": file.additions,
                "deletions": file.deletions,
                "patch": file.patch,  # diff 내용
                "sha": file.sha
            })
        
        return files
    
    def fetch_repository_files(self) -> List[Dict[str, Any]]:
        """레포지토리 전체 소스 파일 수집"""
        print("📌 Fetching repository files...")
        files = []
        
        def traverse_tree(tree, path=""):
            """재귀적으로 트리 순회"""
            for item in tree:
                if item.type == "blob":  # 파일
                    # 대용량 파일 제외 (500KB 이상)
                    if item.size > 500 * 1024:
                        continue
                    
                    # 바이너리 파일 제외
                    try:
                        content = item.decoded_content.decode("utf-8")
                    except:
                        continue
                    
                    file_path = f"{path}/{item.name}" if path else item.name
                    files.append({
                        "path": file_path,
                        "content": content,
                        "size": item.size,
                        "sha": item.sha
                    })
                elif item.type == "tree":  # 디렉토리
                    new_path = f"{path}/{item.name}" if path else item.name
                    subtree = self.repo.get_git_tree(item.sha, recursive=True)
                    traverse_tree(subtree.tree, new_path)
        
        # 기본 브랜치의 트리 가져오기
        default_branch = self.repo.default_branch
        branch = self.repo.get_branch(default_branch)
        tree = self.repo.get_git_tree(branch.commit.sha, recursive=True)
        traverse_tree(tree.tree)
        
        print(f"   → Fetched {len(files)} files")
        return files
    
    def generate_embedding(self, text: str) -> List[float]:
        """OpenAI API로 임베딩 생성"""
        response = self.openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    
    def refine_commit_data(self, commit: Dict[str, Any], files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """커밋 데이터를 NLP 입력 형태로 정제"""
        file_list = ", ".join([f["filename"] for f in files])
        content = f"{commit['message']} | Files: {file_list}"
        
        return {
            "type": "commit",
            "id": f"commit-{commit['sha']}",
            "content": content,
            "metadata": {
                "type": "commit",
                "sha": commit["sha"],
                "author": commit["author"],
                "date": commit["date"],
                "fileCount": len(files),
                "url": commit["url"]
            }
        }
    
    def refine_diff_data(self, commit_sha: str, file: Dict[str, Any]) -> Dict[str, Any]:
        """Diff 데이터를 NLP 입력 형태로 정제"""
        content = f"{file['filename']}: {file['patch'] or 'No changes'}"
        
        return {
            "type": "diff",
            "id": f"diff-{commit_sha}-{file['filename']}",
            "content": content,
            "metadata": {
                "type": "diff",
                "commitSha": commit_sha,
                "filename": file["filename"],
                "status": file["status"],
                "additions": file["additions"],
                "deletions": file["deletions"]
            }
        }
    
    def refine_file_data(self, file: Dict[str, Any], chunk_index: int = 0, total_chunks: int = 1) -> Dict[str, Any]:
        """파일 데이터를 NLP 입력 형태로 정제 (대용량 파일은 청크 분할)"""
        # 5KB 이상 파일은 청크 분할
        chunk_size = 5000
        if len(file["content"]) > chunk_size:
            chunks = [file["content"][i:i+chunk_size] 
                     for i in range(0, len(file["content"]), chunk_size)]
            content = chunks[chunk_index] if chunk_index < len(chunks) else chunks[0]
            total_chunks = len(chunks)
        else:
            content = file["content"]
        
        content = f"{file['path']}: {content}"
        
        return {
            "type": "file",
            "id": f"file-{file['sha']}-{chunk_index}",
            "content": content,
            "metadata": {
                "type": "file",
                "path": file["path"],
                "size": file["size"],
                "sha": file["sha"],
                "chunkIndex": chunk_index if total_chunks > 1 else None,
                "totalChunks": total_chunks if total_chunks > 1 else None
            }
        }
    
    def process_commits(self, commits: List[Dict[str, Any]]):
        """커밋 데이터 처리 및 임베딩 생성"""
        print("\n📌 Processing commits...")
        
        for i, commit in enumerate(commits):
            if (i + 1) % 10 == 0:
                print(f"   → Processing commit {i + 1}/{len(commits)}")
            
            # 커밋의 변경 파일 가져오기
            files = self.fetch_commit_files(commit["sha"])
            
            # 1. 커밋 레벨 임베딩
            commit_item = self.refine_commit_data(commit, files)
            embedding = self.generate_embedding(commit_item["content"])
            
            self.collection.add(
                ids=[commit_item["id"]],
                embeddings=[embedding],
                documents=[commit_item["content"]],
                metadatas=[commit_item["metadata"]]
            )
            
            # 2. Diff 레벨 임베딩 (각 파일별)
            for file in files:
                if file["patch"]:  # diff가 있는 경우만
                    diff_item = self.refine_diff_data(commit["sha"], file)
                    embedding = self.generate_embedding(diff_item["content"])
                    
                    self.collection.add(
                        ids=[diff_item["id"]],
                        embeddings=[embedding],
                        documents=[diff_item["content"]],
                        metadatas=[diff_item["metadata"]]
                    )
        
        print(f"   → Processed {len(commits)} commits")
    
    def process_repository_files(self, files: List[Dict[str, Any]]):
        """레포지토리 파일 처리 및 임베딩 생성"""
        print("\n📌 Processing repository files...")
        
        for i, file in enumerate(files):
            if (i + 1) % 50 == 0:
                print(f"   → Processing file {i + 1}/{len(files)}")
            
            # 대용량 파일 청크 분할
            chunk_size = 5000
            if len(file["content"]) > chunk_size:
                chunks = [file["content"][j:j+chunk_size] 
                         for j in range(0, len(file["content"]), chunk_size)]
                for chunk_idx, chunk_content in enumerate(chunks):
                    file["content"] = chunk_content
                    file_item = self.refine_file_data(file, chunk_idx, len(chunks))
                    embedding = self.generate_embedding(file_item["content"])
                    
                    self.collection.add(
                        ids=[file_item["id"]],
                        embeddings=[embedding],
                        documents=[file_item["content"]],
                        metadatas=[file_item["metadata"]]
                    )
            else:
                file_item = self.refine_file_data(file)
                embedding = self.generate_embedding(file_item["content"])
                
                self.collection.add(
                    ids=[file_item["id"]],
                    embeddings=[embedding],
                    documents=[file_item["content"]],
                    metadatas=[file_item["metadata"]]
                )
        
        print(f"   → Processed {len(files)} files")
    
    def export_to_json(self, output_path: str = "output/embeddings.json") -> str:
        """ChromaDB에서 모든 임베딩을 JSON 파일로 export"""
        print("\n📦 Exporting embeddings to JSON...")
        
        # ChromaDB에서 모든 데이터 가져오기
        result = self.collection.get(include=["embeddings", "metadatas", "documents"])
        
        if not result["ids"] or len(result["ids"]) == 0:
            raise ValueError("No embeddings found in collection")
        
        print(f"   → Found {len(result['ids'])} embeddings")
        
        # JSON 구조 생성
        vector_file = {
            "version": "1.0",
            "dimension": len(result["embeddings"][0]) if result["embeddings"] else 1536,
            "count": len(result["ids"]),
            "createdAt": datetime.now().isoformat(),
            "metadata": {
                "owner": self.repo_owner,
                "repo": self.repo_name
            },
            "vectors": [
                {
                    "id": result["ids"][i],
                    "embedding": result["embeddings"][i],
                    "content": result["documents"][i],
                    "metadata": result["metadatas"][i]
                }
                for i in range(len(result["ids"]))
            ]
        }
        
        # 출력 디렉토리 생성
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # JSON 파일 저장
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(vector_file, f, ensure_ascii=False, indent=2)
        
        file_size = os.path.getsize(output_path) / (1024 * 1024)  # MB
        print(f"✅ Exported to: {output_path} ({file_size:.2f} MB)")
        
        return output_path
    
    def run(self, reset: bool = False):
        """전체 파이프라인 실행"""
        print("🚀 Starting embedding pipeline\n")
        
        # 1. ChromaDB 컬렉션 설정
        self.setup_collection(reset=reset)
        
        # 2. GitHub 데이터 수집
        commits = self.fetch_commits()
        repo_files = self.fetch_repository_files()
        
        # 3. 데이터 처리 및 임베딩 생성
        self.process_commits(commits)
        self.process_repository_files(repo_files)
        
        # 4. JSON 파일로 export
        output_path = self.export_to_json()
        
        print("\n✅ Pipeline completed successfully!")
        return output_path


def main():
    """메인 실행 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description="GitHub Actions Embedding Pipeline")
    parser.add_argument("--reset", action="store_true", help="Reset ChromaDB collection")
    parser.add_argument("--output", default="output/embeddings.json", help="Output JSON file path")
    
    args = parser.parse_args()
    
    try:
        pipeline = EmbeddingPipeline()
        output_path = pipeline.run(reset=args.reset)
        print(f"\n📁 Output file: {output_path}")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Pipeline failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
```

### 1.2 requirements.txt

```txt
chromadb>=0.4.0
openai>=1.0.0
PyGithub>=2.0.0
requests>=2.31.0
python-dotenv>=1.0.0
```

## 2. ChromaDB → JSON Export 로직 예시

### 2.1 Export 함수 (독립 스크립트)

```python
#!/usr/bin/env python3
"""
ChromaDB에서 임베딩을 JSON 파일로 export하는 스크립트
"""

import os
import json
import gzip
from datetime import datetime
import chromadb
from chromadb.config import Settings


def export_chromadb_to_json(
    collection_name: str,
    output_path: str = "output/embeddings.json",
    compress: bool = True
) -> str:
    """
    ChromaDB 컬렉션의 모든 임베딩을 JSON 파일로 export
    
    Args:
        collection_name: ChromaDB 컬렉션 이름
        output_path: 출력 파일 경로
        compress: gzip 압축 여부
    
    Returns:
        생성된 파일 경로
    """
    print(f"📥 Fetching embeddings from ChromaDB (collection: {collection_name})...")
    
    # ChromaDB 클라이언트 초기화
    client = chromadb.Client(Settings(
        chroma_api_impl="rest",
        chroma_server_host=os.getenv("CHROMA_HOST", "localhost"),
        chroma_server_http_port=int(os.getenv("CHROMA_PORT", "8000"))
    ))
    
    # 컬렉션 가져오기
    collection = client.get_collection(name=collection_name)
    
    # 모든 데이터 가져오기
    result = collection.get(include=["embeddings", "metadatas", "documents"])
    
    if not result["ids"] or len(result["ids"]) == 0:
        raise ValueError(f"No embeddings found in collection: {collection_name}")
    
    print(f"   → Found {len(result['ids'])} embeddings")
    
    # JSON 구조 생성
    vector_file = {
        "version": "1.0",
        "dimension": len(result["embeddings"][0]) if result["embeddings"] else 1536,
        "count": len(result["ids"]),
        "createdAt": datetime.now().isoformat(),
        "metadata": {
            "collection": collection_name,
            "source": "chromadb"
        },
        "vectors": [
            {
                "id": result["ids"][i],
                "embedding": result["embeddings"][i],
                "content": result["documents"][i] if result["documents"] else "",
                "metadata": result["metadatas"][i] if result["metadatas"] else {}
            }
            for i in range(len(result["ids"]))
        ]
    }
    
    # JSON 직렬화
    json_string = json.dumps(vector_file, ensure_ascii=False, indent=2)
    json_size = len(json_string.encode("utf-8"))
    print(f"   → JSON size: {json_size / 1024 / 1024:.2f} MB")
    
    # 출력 디렉토리 생성
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # 압축 여부에 따라 저장
    if compress:
        print("   → Compressing with gzip...")
        final_path = f"{output_path}.gz"
        with gzip.open(final_path, "wt", encoding="utf-8") as f:
            f.write(json_string)
        
        compressed_size = os.path.getsize(final_path)
        ratio = ((1 - compressed_size / json_size) * 100)
        print(f"   → Compressed: {compressed_size / 1024 / 1024:.2f} MB (-{ratio:.1f}%)")
    else:
        final_path = output_path
        with open(final_path, "w", encoding="utf-8") as f:
            f.write(json_string)
    
    print(f"✅ Exported to: {final_path}")
    return final_path


def main():
    """메인 실행 함수"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Export ChromaDB embeddings to JSON")
    parser.add_argument("--collection", required=True, help="ChromaDB collection name")
    parser.add_argument("--output", default="output/embeddings.json", help="Output file path")
    parser.add_argument("--no-compress", action="store_true", help="Disable gzip compression")
    
    args = parser.parse_args()
    
    try:
        output_path = export_chromadb_to_json(
            collection_name=args.collection,
            output_path=args.output,
            compress=not args.no_compress
        )
        print(f"\n📁 Output file: {output_path}")
    except Exception as e:
        print(f"\n❌ Export failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
```

### 2.2 Export JSON 스키마

```json
{
  "version": "1.0",
  "dimension": 1536,
  "count": 1234,
  "createdAt": "2024-01-15T10:30:00Z",
  "metadata": {
    "owner": "username",
    "repo": "repo-name",
    "collection": "repo-name-vectors",
    "source": "chromadb"
  },
  "vectors": [
    {
      "id": "commit-abc123",
      "embedding": [0.123, -0.456, ...],
      "content": "feat: Add new feature | Files: src/index.ts, src/utils.ts",
      "metadata": {
        "type": "commit",
        "sha": "abc123",
        "author": "John Doe",
        "date": "2024-01-15T10:00:00Z",
        "fileCount": 2
      }
    },
    {
      "id": "diff-abc123-src/index.ts",
      "embedding": [0.789, -0.012, ...],
      "content": "src/index.ts: +export function newFeature() {...}",
      "metadata": {
        "type": "diff",
        "commitSha": "abc123",
        "filename": "src/index.ts",
        "status": "modified",
        "additions": 10,
        "deletions": 5
      }
    },
    {
      "id": "file-xyz789-0",
      "embedding": [0.345, 0.678, ...],
      "content": "src/components/Button.tsx: export const Button = () => {...}",
      "metadata": {
        "type": "file",
        "path": "src/components/Button.tsx",
        "size": 1234,
        "sha": "xyz789",
        "chunkIndex": null,
        "totalChunks": null
      }
    }
  ]
}
```

## 3. GitHub Actions Workflow 예시

### 3.1 기본 Workflow (`.github/workflows/embed-pipeline.yml`)

```yaml
name: Embedding Pipeline (Python)

on:
  # 스케줄 실행 (매주 일요일 03:00 KST)
  schedule:
    - cron: "0 18 * * 0"  # UTC 18:00 = KST 03:00 (다음날)
  
  # 수동 실행
  workflow_dispatch:
    inputs:
      reset:
        description: "Reset ChromaDB collection"
        required: false
        type: boolean
        default: false

# 동시 실행 방지
concurrency:
  group: embedding-pipeline-${{ github.ref }}
  cancel-in-progress: true

jobs:
  embed:
    name: Generate Embeddings
    runs-on: ubuntu-latest
    timeout-minutes: 60  # 1시간 제한

    # ChromaDB 서비스 (임시 사용)
    services:
      chromadb:
        image: chromadb/chroma:latest
        ports:
          - 8000:8000
        options: >-
          --health-cmd "curl -f http://localhost:8000/api/v1/heartbeat || exit 1"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"

      - name: Install dependencies
        run: |
          pip install -r requirements.txt

      - name: Wait for ChromaDB
        run: |
          echo "Waiting for ChromaDB service..."
          timeout 30 bash -c 'until curl -f http://localhost:8000/api/v1/heartbeat; do sleep 2; done'
          echo "✅ ChromaDB is ready!"

      - name: Run embedding pipeline
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          TARGET_REPO_OWNER: ${{ secrets.TARGET_REPO_OWNER }}
          TARGET_REPO_NAME: ${{ secrets.TARGET_REPO_NAME }}
          CHROMA_HOST: localhost
          CHROMA_PORT: 8000
        run: |
          python scripts/embed_pipeline.py --reset=${{ inputs.reset }}

      - name: Export embeddings to JSON
        if: always()
        env:
          CHROMA_HOST: localhost
          CHROMA_PORT: 8000
        run: |
          python scripts/export_embeddings.py \
            --collection ${{ secrets.TARGET_REPO_NAME }}-vectors \
            --output output/embeddings.json.gz

      - name: Commit embeddings file
        if: always()
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          
          # 변경사항이 있는지 확인
          if [ -n "$(git status --porcelain output/embeddings.json.gz)" ]; then
            git add output/embeddings.json.gz
            git commit -m "chore: Update embeddings [skip ci]"
            git push
            echo "✅ Committed embeddings.json.gz"
          else
            echo "ℹ️  No changes to commit"
          fi

      - name: Upload embeddings artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: embeddings-${{ github.run_number }}
          path: output/embeddings.json.gz
          retention-days: 30

      - name: Summary
        if: always()
        run: |
          echo "## 🚀 Embedding Pipeline Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "- **Run Number**: ${{ github.run_number }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Triggered by**: ${{ github.event_name }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Reset Mode**: ${{ inputs.reset }}" >> $GITHUB_STEP_SUMMARY
          
          if [ -f "output/embeddings.json.gz" ]; then
            SIZE=$(du -h output/embeddings.json.gz | cut -f1)
            echo "- **File Size**: $SIZE" >> $GITHUB_STEP_SUMMARY
          fi
```

### 3.2 개선된 Workflow (에러 처리 및 최적화)

```yaml
name: Embedding Pipeline (Python) - Optimized

on:
  schedule:
    - cron: "0 18 * * 0"
  workflow_dispatch:
    inputs:
      reset:
        description: "Reset ChromaDB collection"
        required: false
        type: boolean
        default: false

concurrency:
  group: embedding-pipeline-${{ github.ref }}
  cancel-in-progress: true

jobs:
  embed:
    name: Generate Embeddings
    runs-on: ubuntu-latest
    timeout-minutes: 60

    services:
      chromadb:
        image: chromadb/chroma:latest
        ports:
          - 8000:8000
        options: >-
          --health-cmd "curl -f http://localhost:8000/api/v1/heartbeat || exit 1"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # 전체 히스토리 (커밋 정보 필요)

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"

      - name: Cache Python dependencies
        uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('requirements.txt') }}
          restore-keys: |
            ${{ runner.os }}-pip-

      - name: Install dependencies
        run: |
          pip install --upgrade pip
          pip install -r requirements.txt

      - name: Wait for ChromaDB
        run: |
          echo "⏳ Waiting for ChromaDB service..."
          for i in {1..15}; do
            if curl -f http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
              echo "✅ ChromaDB is ready!"
              exit 0
            fi
            echo "   Attempt $i/15..."
            sleep 2
          done
          echo "❌ ChromaDB failed to start"
          exit 1

      - name: Verify ChromaDB health
        run: |
          curl -f http://localhost:8000/api/v1/heartbeat
          echo "✅ ChromaDB health check passed"

      - name: Run embedding pipeline
        id: pipeline
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          TARGET_REPO_OWNER: ${{ secrets.TARGET_REPO_OWNER }}
          TARGET_REPO_NAME: ${{ secrets.TARGET_REPO_NAME }}
          CHROMA_HOST: localhost
          CHROMA_PORT: 8000
        run: |
          set -e
          echo "🚀 Starting embedding pipeline..."
          python scripts/embed_pipeline.py --reset=${{ inputs.reset }} 2>&1 | tee pipeline.log
          
          # 결과 파싱
          if [ -f "pipeline.log" ]; then
            EMBEDDING_COUNT=$(grep -oP 'Found \K\d+' pipeline.log | tail -1 || echo "0")
            echo "embedding_count=$EMBEDDING_COUNT" >> $GITHUB_OUTPUT
          fi

      - name: Export embeddings to JSON
        if: steps.pipeline.outcome == 'success'
        id: export
        env:
          CHROMA_HOST: localhost
          CHROMA_PORT: 8000
        run: |
          set -e
          echo "📦 Exporting embeddings..."
          python scripts/export_embeddings.py \
            --collection ${{ secrets.TARGET_REPO_NAME }}-vectors \
            --output output/embeddings.json.gz
          
          # 파일 크기 확인
          if [ -f "output/embeddings.json.gz" ]; then
            FILE_SIZE=$(du -h output/embeddings.json.gz | cut -f1)
            echo "file_size=$FILE_SIZE" >> $GITHUB_OUTPUT
            echo "✅ Exported: $FILE_SIZE"
          fi

      - name: Validate JSON file
        if: steps.export.outcome == 'success'
        run: |
          echo "🔍 Validating embeddings.json.gz..."
          gunzip -c output/embeddings.json.gz | python -m json.tool > /dev/null
          echo "✅ JSON validation passed"
          
          # 기본 통계 출력
          COUNT=$(gunzip -c output/embeddings.json.gz | python -c "import sys, json; data=json.load(sys.stdin); print(data['count'])")
          DIMENSION=$(gunzip -c output/embeddings.json.gz | python -c "import sys, json; data=json.load(sys.stdin); print(data['dimension'])")
          echo "   → Count: $COUNT embeddings"
          echo "   → Dimension: $DIMENSION"

      - name: Commit embeddings file
        if: steps.export.outcome == 'success'
        id: commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          
          # 변경사항 확인
          git add output/embeddings.json.gz
          
          if [ -n "$(git status --porcelain)" ]; then
            git commit -m "chore: Update embeddings [skip ci]

            - Generated: ${{ github.run_number }}
            - Embeddings: ${{ steps.pipeline.outputs.embedding_count }}
            - File size: ${{ steps.export.outputs.file_size }}
            - Triggered by: ${{ github.event_name }}"
            
            git push
            echo "✅ Committed embeddings.json.gz"
            echo "committed=true" >> $GITHUB_OUTPUT
          else
            echo "ℹ️  No changes to commit"
            echo "committed=false" >> $GITHUB_OUTPUT
          fi

      - name: Upload embeddings artifact
        if: steps.export.outcome == 'success'
        uses: actions/upload-artifact@v4
        with:
          name: embeddings-${{ github.run_number }}
          path: output/embeddings.json.gz
          retention-days: 30
          compression-level: 0  # 이미 압축됨

      - name: Upload pipeline logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: pipeline-logs-${{ github.run_number }}
          path: pipeline.log
          retention-days: 7

      - name: Summary
        if: always()
        run: |
          echo "## 🚀 Embedding Pipeline Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| 항목 | 값 |" >> $GITHUB_STEP_SUMMARY
          echo "|------|-----|" >> $GITHUB_STEP_SUMMARY
          echo "| Run Number | ${{ github.run_number }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Triggered by | ${{ github.event_name }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Reset Mode | ${{ inputs.reset }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Embeddings Count | ${{ steps.pipeline.outputs.embedding_count }} |" >> $GITHUB_STEP_SUMMARY
          echo "| File Size | ${{ steps.export.outputs.file_size }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Committed | ${{ steps.commit.outputs.committed }} |" >> $GITHUB_STEP_SUMMARY
          
          if [ "${{ steps.pipeline.outcome }}" == "success" ]; then
            echo "" >> $GITHUB_STEP_SUMMARY
            echo "✅ **Pipeline completed successfully!**" >> $GITHUB_STEP_SUMMARY
          else
            echo "" >> $GITHUB_STEP_SUMMARY
            echo "❌ **Pipeline failed. Check logs for details.**" >> $GITHUB_STEP_SUMMARY
          fi

      - name: Cleanup on failure
        if: failure()
        run: |
          echo "🧹 Cleaning up on failure..."
          # ChromaDB는 자동으로 정리됨 (서비스 종료 시)
          echo "✅ Cleanup completed"
```

## 4. 실행 흐름 요약

```
1. GitHub Actions 시작
   ↓
2. ChromaDB 서비스 시작 (Docker 컨테이너)
   ↓
3. Python 환경 설정 및 의존성 설치
   ↓
4. ChromaDB 헬스체크 대기
   ↓
5. 임베딩 파이프라인 실행
   ├─ GitHub API로 커밋 수집
   ├─ 각 커밋의 diff 수집
   ├─ 레포지토리 파일 수집
   ├─ 데이터 정제 (NLP 형식)
   ├─ OpenAI API로 임베딩 생성
   └─ ChromaDB에 저장
   ↓
6. ChromaDB → JSON Export
   ├─ 모든 임베딩 조회
   ├─ JSON 구조 생성
   └─ gzip 압축 후 저장
   ↓
7. JSON 파일을 레포지토리에 커밋
   ↓
8. Artifact로 백업 저장
   ↓
9. ChromaDB 서비스 종료 (자동 정리)
```

## 5. 주요 특징

### 5.1 ChromaDB 임시 사용
- GitHub Actions 실행 중에만 ChromaDB Docker 컨테이너 실행
- 실행 종료 후 자동으로 정리됨 (비용 없음)
- 서비스 헬스체크로 안정성 보장

### 5.2 데이터 수집 전략
- **Commit 레벨**: 커밋 메시지 + 변경 파일 목록
- **Diff 레벨**: 각 파일의 변경사항 (patch)
- **File 레벨**: 전체 소스 코드 (대용량 파일은 청크 분할)

### 5.3 Export 최적화
- gzip 압축으로 파일 크기 감소 (약 70-80% 압축률)
- JSON 스키마에 메타데이터 포함 (버전, 차원, 생성일시)
- 벡터 데이터와 메타데이터 분리 저장

### 5.4 에러 처리
- 각 단계별 성공/실패 체크
- 실패 시 로그 저장 및 Artifact 백업
- ChromaDB 헬스체크 재시도 로직

## 6. 사용 예시

### 6.1 로컬 테스트 (ChromaDB 수동 실행)

```bash
# ChromaDB 시작
docker run -d -p 8000:8000 chromadb/chroma:latest

# 환경 변수 설정
export GITHUB_TOKEN="ghp_xxx"
export OPENAI_API_KEY="sk-xxx"
export TARGET_REPO_OWNER="username"
export TARGET_REPO_NAME="repo-name"
export CHROMA_HOST="localhost"
export CHROMA_PORT="8000"

# 파이프라인 실행
python scripts/embed_pipeline.py

# Export
python scripts/export_embeddings.py \
  --collection repo-name-vectors \
  --output output/embeddings.json.gz
```

### 6.2 GitHub Actions에서 실행

```bash
# 수동 실행 (GitHub Actions UI)
# workflow_dispatch 사용

# 또는 스케줄 실행 대기
# 매주 일요일 03:00 KST 자동 실행
```

## 7. 주의사항

1. **API Rate Limit**: GitHub API와 OpenAI API의 rate limit 고려
2. **실행 시간**: 대용량 레포지토리는 60분 제한 초과 가능
3. **비용**: OpenAI API 사용량에 따른 비용 발생
4. **보안**: Secrets에 API 키 저장 필수
5. **ChromaDB 데이터**: 실행 종료 후 자동 삭제되므로 export 필수

## 8. 개선 가능한 부분

1. **증분 업데이트**: 이전 커밋 상태 저장하여 변경된 부분만 처리
2. **병렬 처리**: 여러 커밋/파일을 동시에 처리
3. **청크 최적화**: 파일 청크 크기 동적 조정
4. **캐싱**: 동일한 파일 재처리 방지
5. **모니터링**: 실행 시간 및 API 사용량 추적

