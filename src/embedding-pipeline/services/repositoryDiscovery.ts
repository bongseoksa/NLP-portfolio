import { Octokit } from "@octokit/rest";

/**
 * GitHub API로 사용자가 접근 가능한 레포지토리 자동 발견
 */
export class RepositoryDiscovery {
    private octokit: Octokit;

    constructor(githubToken?: string) {
        const token = githubToken || process.env.GITHUB_TOKEN;
        if (!token) {
            throw new Error("GITHUB_TOKEN is required for RepositoryDiscovery");
        }

        this.octokit = new Octokit({ auth: token });
    }

    /**
     * 인증된 사용자의 모든 레포지토리 조회
     * @param options 필터 옵션
     */
    async discoverRepositories(options?: {
        /** 특정 owner만 포함 (없으면 모든 owner) */
        ownerFilter?: string[];
        /** Private 레포 포함 여부 */
        includePrivate?: boolean;
        /** Fork 레포 포함 여부 */
        includeForks?: boolean;
        /** Archived 레포 포함 여부 */
        includeArchived?: boolean;
    }): Promise<Array<{ owner: string; repo: string; description?: string }>> {
        const {
            ownerFilter,
            includePrivate = true,
            includeForks = false,
            includeArchived = false
        } = options || {};

        console.log("🔍 Discovering repositories via GitHub API...");

        const repositories: Array<{ owner: string; repo: string; description?: string }> = [];

        try {
            // 페이지네이션으로 모든 레포 가져오기
            const iterator = this.octokit.paginate.iterator(
                this.octokit.rest.repos.listForAuthenticatedUser,
                {
                    per_page: 100,
                    sort: "updated",
                    direction: "desc"
                }
            );

            for await (const { data: repos } of iterator) {
                for (const repo of repos) {
                    // 필터링 조건
                    if (!includePrivate && repo.private) continue;
                    if (!includeForks && repo.fork) continue;
                    if (!includeArchived && repo.archived) continue;

                    const owner = repo.owner?.login;
                    if (!owner) continue;

                    // Owner 필터
                    if (ownerFilter && ownerFilter.length > 0) {
                        if (!ownerFilter.includes(owner)) continue;
                    }

                    const repoData: { owner: string; repo: string; description?: string } = {
                        owner: owner,
                        repo: repo.name
                    };

                    if (repo.description) {
                        repoData.description = repo.description;
                    }

                    repositories.push(repoData);
                }
            }

            console.log(`   ✅ Found ${repositories.length} repositories`);

            return repositories;

        } catch (error: any) {
            throw new Error(`Failed to discover repositories: ${error.message}`);
        }
    }

    /**
     * 특정 organization의 레포지토리 조회
     */
    async discoverOrgRepositories(org: string): Promise<Array<{ owner: string; repo: string; description?: string }>> {
        console.log(`🔍 Discovering repositories in organization: ${org}...`);

        const repositories: Array<{ owner: string; repo: string; description?: string }> = [];

        try {
            const iterator = this.octokit.paginate.iterator(
                this.octokit.rest.repos.listForOrg,
                {
                    org,
                    per_page: 100,
                    sort: "updated",
                    direction: "desc"
                }
            );

            for await (const { data: repos } of iterator) {
                for (const repo of repos) {
                    const repoData: { owner: string; repo: string; description?: string } = {
                        owner: org,
                        repo: repo.name
                    };

                    if (repo.description) {
                        repoData.description = repo.description;
                    }

                    repositories.push(repoData);
                }
            }

            console.log(`   ✅ Found ${repositories.length} repositories in ${org}`);

            return repositories;

        } catch (error: any) {
            throw new Error(`Failed to discover org repositories: ${error.message}`);
        }
    }
}
