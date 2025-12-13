/**
 * 프로세스 관리자
 * ChromaDB 서버와 API 서버의 시작/종료를 관리
 */
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

interface ManagedProcess {
    process: ChildProcess | null;
    status: 'stopped' | 'starting' | 'running' | 'error';
    lastOutput: string[];
    startedAt: Date | null;
}

class ProcessManager {
    private processes: Map<string, ManagedProcess> = new Map();

    constructor() {
        this.processes.set('chromadb', {
            process: null,
            status: 'stopped',
            lastOutput: [],
            startedAt: null,
        });
        this.processes.set('api', {
            process: null,
            status: 'stopped',
            lastOutput: [],
            startedAt: null,
        });
    }

    /**
     * ChromaDB 서버 시작
     */
    async startChromaDB(): Promise<{ success: boolean; message: string }> {
        const managed = this.processes.get('chromadb')!;

        if (managed.status === 'running') {
            return { success: false, message: 'ChromaDB is already running' };
        }

        try {
            managed.status = 'starting';
            managed.lastOutput = [];

            const chromaVenv = path.join(PROJECT_ROOT, '.chroma_venv');
            const chromaPath = path.join(chromaVenv, 'bin', 'chroma');
            const dataPath = path.join(PROJECT_ROOT, 'chroma_data');

            // 가상환경의 chroma 직접 실행
            const proc = spawn(chromaPath, ['run', '--path', dataPath], {
                cwd: PROJECT_ROOT,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    PATH: `${path.join(chromaVenv, 'bin')}:${process.env.PATH}`,
                },
            });

            managed.process = proc;

            proc.stdout?.on('data', (data) => {
                const output = data.toString();
                managed.lastOutput.push(output);
                if (managed.lastOutput.length > 50) managed.lastOutput.shift();
                
                // 서버 시작 감지
                if (output.includes('Uvicorn running') || output.includes('localhost:8000')) {
                    managed.status = 'running';
                    managed.startedAt = new Date();
                }
            });

            proc.stderr?.on('data', (data) => {
                const output = data.toString();
                managed.lastOutput.push(`[stderr] ${output}`);
                if (managed.lastOutput.length > 50) managed.lastOutput.shift();
            });

            proc.on('error', (err) => {
                console.error('❌ ChromaDB 프로세스 오류:', err.message);
                managed.status = 'error';
            });

            proc.on('exit', (code) => {
                console.log(`ChromaDB 프로세스 종료 (code: ${code})`);
                managed.status = 'stopped';
                managed.process = null;
                managed.startedAt = null;
            });

            // 5초 후 실제 서버 응답 확인
            await new Promise(resolve => setTimeout(resolve, 5000));

            // ChromaDB가 실제로 포트 8000에서 응답하는지 확인
            const isServerReady = await this.checkChromaDBHealth();
            
            if (isServerReady) {
                managed.status = 'running';
                managed.startedAt = new Date();
                return { success: true, message: 'ChromaDB started successfully' };
            } else if (managed.status === 'starting') {
                // 프로세스는 실행 중이지만 서버가 아직 준비되지 않음
                managed.status = 'starting';
                return { success: false, message: 'ChromaDB is starting, please wait...' };
            } else {
                managed.status = 'error';
                return { success: false, message: 'ChromaDB failed to start. Check logs for details.' };
            }

        } catch (err: any) {
            managed.status = 'error';
            return { success: false, message: err.message };
        }
    }

    /**
     * ChromaDB 서버 종료
     */
    async stopChromaDB(): Promise<{ success: boolean; message: string }> {
        const managed = this.processes.get('chromadb')!;

        if (!managed.process) {
            return { success: false, message: 'ChromaDB is not running' };
        }

        try {
            managed.process.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (managed.process && !managed.process.killed) {
                managed.process.kill('SIGKILL');
            }

            managed.status = 'stopped';
            managed.process = null;
            managed.startedAt = null;

            return { success: true, message: 'ChromaDB stopped' };

        } catch (err: any) {
            return { success: false, message: err.message };
        }
    }

    /**
     * API 서버 시작
     */
    async startAPIServer(): Promise<{ success: boolean; message: string }> {
        const managed = this.processes.get('api')!;

        if (managed.status === 'running') {
            return { success: false, message: 'API Server is already running' };
        }

        try {
            managed.status = 'starting';
            managed.lastOutput = [];

            const proc = spawn('npx', ['tsx', 'src/server/index.ts'], {
                cwd: PROJECT_ROOT,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: process.env,
                shell: true,
            });

            managed.process = proc;

            proc.stdout?.on('data', (data) => {
                const output = data.toString();
                managed.lastOutput.push(output);
                if (managed.lastOutput.length > 50) managed.lastOutput.shift();
                
                if (output.includes('API Server is running')) {
                    managed.status = 'running';
                    managed.startedAt = new Date();
                }
            });

            proc.stderr?.on('data', (data) => {
                const output = data.toString();
                managed.lastOutput.push(`[stderr] ${output}`);
                if (managed.lastOutput.length > 50) managed.lastOutput.shift();
            });

            proc.on('error', (err) => {
                console.error('❌ API Server 프로세스 오류:', err.message);
                managed.status = 'error';
            });

            proc.on('exit', (code) => {
                console.log(`API Server 프로세스 종료 (code: ${code})`);
                managed.status = 'stopped';
                managed.process = null;
                managed.startedAt = null;
            });

            // 5초 후 실제 서버 응답 확인
            await new Promise(resolve => setTimeout(resolve, 5000));

            // API 서버가 실제로 포트 3001에서 응답하는지 확인
            const isServerReady = await this.checkAPIServerHealth();
            
            if (isServerReady) {
                managed.status = 'running';
                managed.startedAt = new Date();
                return { success: true, message: 'API Server started successfully' };
            } else if (managed.status === 'starting') {
                // 프로세스는 실행 중이지만 서버가 아직 준비되지 않음
                managed.status = 'starting';
                return { success: false, message: 'API Server is starting, please wait...' };
            } else {
                managed.status = 'error';
                return { success: false, message: 'API Server failed to start. Check logs for details.' };
            }

        } catch (err: any) {
            managed.status = 'error';
            return { success: false, message: err.message };
        }
    }

    /**
     * API 서버 종료
     */
    async stopAPIServer(): Promise<{ success: boolean; message: string }> {
        const managed = this.processes.get('api')!;

        if (!managed.process) {
            return { success: false, message: 'API Server is not running' };
        }

        try {
            managed.process.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (managed.process && !managed.process.killed) {
                managed.process.kill('SIGKILL');
            }

            managed.status = 'stopped';
            managed.process = null;
            managed.startedAt = null;

            return { success: true, message: 'API Server stopped' };

        } catch (err: any) {
            return { success: false, message: err.message };
        }
    }

    /**
     * ChromaDB 헬스체크 (포트 8000)
     */
    private async checkChromaDBHealth(): Promise<boolean> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        try {
            const response = await fetch('http://localhost:8000/api/v1/heartbeat', {
                method: 'GET',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            clearTimeout(timeoutId);
            // 다른 엔드포인트도 시도
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), 2000);
            try {
                const response = await fetch('http://localhost:8000/api/v2/heartbeat', {
                    method: 'GET',
                    signal: controller2.signal,
                });
                clearTimeout(timeoutId2);
                return response.ok;
            } catch {
                clearTimeout(timeoutId2);
                return false;
            }
        }
    }

    /**
     * API 서버 헬스체크 (포트 3001)
     */
    private async checkAPIServerHealth(): Promise<boolean> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        try {
            const response = await fetch('http://localhost:3001/api/health', {
                method: 'GET',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            clearTimeout(timeoutId);
            return false;
        }
    }

    /**
     * 모든 서버 상태 조회 (실제 서버 응답 확인 포함)
     */
    async getStatus(): Promise<{
        chromadb: { status: string; startedAt: string | null; pid: number | null };
        api: { status: string; startedAt: string | null; pid: number | null };
    }> {
        const chromadb = this.processes.get('chromadb')!;
        const api = this.processes.get('api')!;

        // 프로세스가 실행 중이면 실제 서버 응답 확인
        if (chromadb.status === 'running' || chromadb.status === 'starting') {
            const isHealthy = await this.checkChromaDBHealth();
            if (!isHealthy && chromadb.status === 'running') {
                chromadb.status = 'error';
            } else if (isHealthy && chromadb.status === 'starting') {
                chromadb.status = 'running';
                chromadb.startedAt = chromadb.startedAt || new Date();
            }
        }

        if (api.status === 'running' || api.status === 'starting') {
            const isHealthy = await this.checkAPIServerHealth();
            if (!isHealthy && api.status === 'running') {
                api.status = 'error';
            } else if (isHealthy && api.status === 'starting') {
                api.status = 'running';
                api.startedAt = api.startedAt || new Date();
            }
        }

        return {
            chromadb: {
                status: chromadb.status,
                startedAt: chromadb.startedAt?.toISOString() || null,
                pid: chromadb.process?.pid || null,
            },
            api: {
                status: api.status,
                startedAt: api.startedAt?.toISOString() || null,
                pid: api.process?.pid || null,
            },
        };
    }

    /**
     * 프로세스 로그 조회
     */
    getLogs(name: 'chromadb' | 'api'): string[] {
        return this.processes.get(name)?.lastOutput || [];
    }

    /**
     * 모든 프로세스 종료
     */
    async shutdownAll(): Promise<void> {
        await this.stopAPIServer();
        await this.stopChromaDB();
    }
}

export const processManager = new ProcessManager();

