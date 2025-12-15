/**
 * 프로세스 관리자
 * ChromaDB 서버와 API 서버의 시작/종료를 관리
 */
import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 프로젝트 루트: src/control에서 ../..가 프로젝트 루트
// __dirname이 dist/control일 수도 있으므로 확인
let PROJECT_ROOT = path.resolve(__dirname, '../..');
// NLP-portfolio가 포함되어 있는지 확인
if (!PROJECT_ROOT.includes('NLP-portfolio')) {
    // 한 단계 더 올라가기
    PROJECT_ROOT = path.resolve(__dirname, '../../..');
}
// 여전히 없으면 현재 작업 디렉토리 사용
if (!PROJECT_ROOT.includes('NLP-portfolio') && process.cwd().includes('NLP-portfolio')) {
    PROJECT_ROOT = process.cwd();
}

interface ManagedProcess {
    process: ChildProcess | null;
    status: 'stopped' | 'starting' | 'running' | 'error';
    lastOutput: string[];
    startedAt: Date | null;
}

class ProcessManager {
    private processes: Map<string, ManagedProcess> = new Map();
    private statusCache: {
        data: {
            chromadb: { status: string; startedAt: string | null; pid: number | null };
            api: { status: string; startedAt: string | null; pid: number | null };
            control: { status: string; startedAt: string | null; pid: number | null };
        } | null;
        timestamp: number;
    } = { data: null, timestamp: 0 };
    private readonly CACHE_TTL = 1000 * 60; // 1분 캐시

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
        this.processes.set('control', {
            process: null,
            status: 'stopped',
            lastOutput: [],
            startedAt: null,
        });
    }

    /**
     * 포트 사용 중인지 확인
     */
    private async isPortInUse(port: number): Promise<boolean> {
        try {
            const { stdout } = await execAsync(`lsof -i :${port} 2>/dev/null || true`);
            return stdout.trim().length > 0;
        } catch {
            return false;
        }
    }

    /**
     * 포트 8000에서 실행 중인 ChromaDB 프로세스 종료
     */
    private async killChromaDBOnPort8000(): Promise<void> {
        try {
            // 포트 8000을 사용하는 Python 프로세스 찾기
            const { stdout } = await execAsync('lsof -ti :8000 2>/dev/null || true');
            const pids = stdout.trim().split('\n').filter(pid => pid.length > 0);
            
            for (const pid of pids) {
                try {
                    // 프로세스가 chroma 관련인지 확인
                    const { stdout: cmdline } = await execAsync(`ps -p ${pid} -o command= 2>/dev/null || true`);
                    if (cmdline.includes('chroma') || cmdline.includes('uvicorn')) {
                        console.log(`🛑 기존 ChromaDB 프로세스 종료 중 (PID: ${pid})...`);
                        await execAsync(`kill -TERM ${pid} 2>/dev/null || true`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        // 강제 종료
                        await execAsync(`kill -KILL ${pid} 2>/dev/null || true`);
                    }
                } catch {
                    // 프로세스가 이미 종료되었을 수 있음
                }
            }
        } catch {
            // lsof가 없거나 오류 발생 시 무시
        }
    }

    /**
     * Control 서버 시작
     */
    async startControlServer(): Promise<{ success: boolean; message: string }> {
        const managed = this.processes.get('control')!;

        if (managed.status === 'running') {
            return { success: true, message: 'Control Server is already running' };
        }

        // 포트 3000이 사용 중인지 확인
        const portInUse = await this.isPortInUse(3000);
        if (portInUse) {
            // 이미 실행 중일 수 있음
            managed.status = 'running';
            return { success: true, message: 'Control Server is already running on port 3000' };
        }

        try {
            managed.status = 'starting';
            managed.lastOutput = [];

            const proc = spawn('pnpm', ['run', 'control'], {
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
                
                if (output.includes('Control Server is running')) {
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
                console.error('❌ Control Server 프로세스 오류:', err.message);
                managed.status = 'error';
            });

            proc.on('exit', (code) => {
                console.log(`Control Server 프로세스 종료 (code: ${code})`);
                managed.status = 'stopped';
                managed.process = null;
                managed.startedAt = null;
            });

            // 3초 후 포트 확인
            await new Promise(resolve => setTimeout(resolve, 3000));

            const isRunning = await this.isPortInUse(3000);
            if (isRunning) {
                managed.status = 'running';
                managed.startedAt = new Date();
                return { success: true, message: 'Control Server started successfully' };
            } else {
                managed.status = 'error';
                return { success: false, message: 'Control Server failed to start. Check logs for details.' };
            }
        } catch (err: any) {
            managed.status = 'error';
            return { success: false, message: err.message };
        }
    }

    /**
     * Control 서버 종료
     */
    async stopControlServer(): Promise<{ success: boolean; message: string }> {
        const managed = this.processes.get('control')!;

        if (managed.process) {
            try {
                managed.process.kill('SIGTERM');
                await new Promise(resolve => setTimeout(resolve, 1000));

                if (managed.process && !managed.process.killed) {
                    managed.process.kill('SIGKILL');
                }

                managed.status = 'stopped';
                managed.process = null;
                managed.startedAt = null;

                return { success: true, message: 'Control Server stopped' };
            } catch (err: any) {
                return { success: false, message: err.message };
            }
        }

        // 프로세스가 없어도 포트 3000을 사용하는 프로세스 종료 시도
        try {
            const { stdout } = await execAsync('lsof -ti :3000 2>/dev/null || true');
            const pids = stdout.trim().split('\n').filter(pid => pid.length > 0);
            
            for (const pid of pids) {
                try {
                    const { stdout: cmdline } = await execAsync(`ps -p ${pid} -o command= 2>/dev/null || true`);
                    if (cmdline.includes('control') || cmdline.includes('tsx src/control')) {
                        console.log(`🛑 Control Server 프로세스 종료 중 (PID: ${pid})...`);
                        await execAsync(`kill -TERM ${pid} 2>/dev/null || true`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await execAsync(`kill -KILL ${pid} 2>/dev/null || true`);
                    }
                } catch {
                    // 프로세스가 이미 종료되었을 수 있음
                }
            }

            managed.status = 'stopped';
            return { success: true, message: 'Control Server stopped' };
        } catch {
            return { success: false, message: 'Control Server is not running' };
        }
    }

    /**
     * ChromaDB 서버 시작 (초기화 및 재실행)
     */
    async startChromaDB(): Promise<{ success: boolean; message: string }> {
        // Control 서버가 실행 중인지 확인하고 없으면 시작
        const controlManaged = this.processes.get('control')!;
        if (controlManaged.status !== 'running') {
            console.log('🔧 Control 서버가 실행 중이 아닙니다. 시작합니다...');
            const controlResult = await this.startControlServer();
            if (!controlResult.success) {
                return { success: false, message: `Control 서버 시작 실패: ${controlResult.message}` };
            }
            // Control 서버가 완전히 시작될 때까지 대기
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const managed = this.processes.get('chromadb')!;

        // ChromaDB가 실행 중이면 먼저 종료 (초기화 및 재실행)
        if (managed.status === 'running' || managed.process) {
            console.log('🔄 ChromaDB가 실행 중입니다. 초기화를 위해 종료합니다...');
            const stopResult = await this.stopChromaDB();
            if (!stopResult.success) {
                console.warn('⚠️ ChromaDB 종료 실패, 강제 종료 시도:', stopResult.message);
            }
            // 프로세스 완전 종료 대기
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        try {
            // 포트 8000이 사용 중인지 확인하고 정리
            const portInUse = await this.isPortInUse(8000);
            if (portInUse) {
                console.log('⚠️ 포트 8000이 사용 중입니다. 기존 프로세스를 종료합니다...');
                await this.killChromaDBOnPort8000();
                // 프로세스 종료 대기
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

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
                
                // 포트 충돌 오류 감지
                if (output.includes('Address localhost:8000 is not available')) {
                    console.error('❌ 포트 8000 충돌 감지');
                    managed.status = 'error';
                }
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
                // 상태 캐시 무효화
                this.invalidateStatusCache();
                return { success: true, message: 'ChromaDB started successfully' };
            } else if (managed.status === 'starting') {
                // 프로세스는 실행 중이지만 서버가 아직 준비되지 않음
                // 포트 충돌 확인
                const portStillInUse = await this.isPortInUse(8000);
                if (portStillInUse) {
                    // 포트가 여전히 사용 중이지만 우리 프로세스가 아닐 수 있음
                    const lastOutput = managed.lastOutput.join('\n');
                    if (lastOutput.includes('Address localhost:8000 is not available')) {
                        managed.status = 'error';
                        return { 
                            success: false, 
                            message: '포트 8000이 사용 중입니다. 기존 ChromaDB 프로세스를 종료한 후 다시 시도하세요.' 
                        };
                    }
                }
                managed.status = 'starting';
                return { success: false, message: 'ChromaDB is starting, please wait...' };
            } else {
                managed.status = 'error';
                // 포트 충돌 확인
                const portStillInUse = await this.isPortInUse(8000);
                const lastOutput = managed.lastOutput.join('\n');
                if (portStillInUse || lastOutput.includes('Address localhost:8000 is not available')) {
                    return { 
                        success: false, 
                        message: '포트 8000이 사용 중입니다. 기존 ChromaDB 프로세스를 종료한 후 다시 시도하세요.' 
                    };
                }
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

            // 상태 캐시 무효화
            this.invalidateStatusCache();

            // ChromaDB 종료 후 Control 서버도 종료
            console.log('🛑 Control 서버 종료 중...');
            await this.stopControlServer();

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

            // pnpm run server를 사용하여 API 서버 시작
            const proc = spawn('pnpm', ['run', 'server'], {
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
                // 상태 캐시 무효화
                this.invalidateStatusCache();
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

            // 상태 캐시 무효화
            this.invalidateStatusCache();

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
        } catch (error: any) {
            clearTimeout(timeoutId);
            // 연결 거부 오류는 서버가 꺼져있음을 의미
            if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED') || error.message?.includes('ERR_CONNECTION_REFUSED')) {
                return false;
            }
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
            } catch (error2: any) {
                clearTimeout(timeoutId2);
                // 연결 거부 오류는 서버가 꺼져있음을 의미
                if (error2.code === 'ECONNREFUSED' || error2.message?.includes('ECONNREFUSED') || error2.message?.includes('ERR_CONNECTION_REFUSED')) {
                    return false;
                }
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
        } catch (error: any) {
            clearTimeout(timeoutId);
            // 연결 거부 오류는 서버가 꺼져있음을 의미
            // ECONNREFUSED는 시스템 레벨 오류 코드
            // ERR_CONNECTION_REFUSED는 브라우저/Node.js에서 사용하는 메시지
            if (error.code === 'ECONNREFUSED' || 
                error.message?.includes('ECONNREFUSED') || 
                error.message?.includes('ERR_CONNECTION_REFUSED') ||
                error.cause?.code === 'ECONNREFUSED') {
                return false;
            }
            // 타임아웃이나 다른 오류도 false 반환
            return false;
        }
    }

    /**
     * Control 서버 헬스체크 (포트 3000 확인만, 순환 참조 방지)
     */
    private async checkControlServerHealth(): Promise<boolean> {
        // 포트만 확인 (자기 자신에게 HTTP 요청하지 않음 - 순환 참조 방지)
        return await this.isPortInUse(3000);
    }

    /**
     * 모든 서버 상태 조회 (실제 서버 응답 확인 포함, 캐싱 적용)
     */
    async getStatus(): Promise<{
        chromadb: { status: string; startedAt: string | null; pid: number | null };
        api: { status: string; startedAt: string | null; pid: number | null };
        control: { status: string; startedAt: string | null; pid: number | null };
    }> {
        // 캐시 확인 (1분 이내면 캐시된 데이터 반환)
        const now = Date.now();
        if (this.statusCache.data && (now - this.statusCache.timestamp) < this.CACHE_TTL) {
            return this.statusCache.data;
        }

        const chromadb = this.processes.get('chromadb')!;
        const api = this.processes.get('api')!;
        const control = this.processes.get('control')!;

        // Control 서버 상태 확인 (포트만 확인, 순환 참조 방지)
        const controlHealthy = await this.checkControlServerHealth();
        if (controlHealthy) {
            control.status = 'running';
            if (!control.startedAt) {
                control.startedAt = new Date();
            }
        } else if (control.status === 'running' && !control.process) {
            // 프로세스가 없는데 상태가 running이면 stopped로 변경
            control.status = 'stopped';
        }

        // ChromaDB 상태 확인 (실제 HTTP 응답 확인)
        const chromadbHealthy = await this.checkChromaDBHealth();
        if (chromadbHealthy) {
            chromadb.status = 'running';
            if (!chromadb.startedAt) {
                chromadb.startedAt = new Date();
            }
        } else if (chromadb.status === 'running' && !chromadb.process) {
            // 프로세스가 없는데 상태가 running이면 stopped로 변경
            chromadb.status = 'stopped';
        } else if (chromadb.status === 'starting' && chromadbHealthy) {
            chromadb.status = 'running';
            chromadb.startedAt = chromadb.startedAt || new Date();
        } else if (chromadb.status === 'running' && !chromadbHealthy) {
            chromadb.status = 'error';
        }

        // API 서버 상태 확인 (실제 HTTP 응답 확인)
        const apiHealthy = await this.checkAPIServerHealth();
        if (apiHealthy) {
            api.status = 'running';
            if (!api.startedAt) {
                api.startedAt = new Date();
            }
        } else if (api.status === 'running' && !api.process) {
            // 프로세스가 없는데 상태가 running이면 stopped로 변경
            api.status = 'stopped';
        } else if (api.status === 'starting' && apiHealthy) {
            api.status = 'running';
            api.startedAt = api.startedAt || new Date();
        } else if (api.status === 'running' && !apiHealthy) {
            api.status = 'error';
        }

        const result = {
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
            control: {
                status: control.status,
                startedAt: control.startedAt?.toISOString() || null,
                pid: control.process?.pid || null,
            },
        };

        // 캐시 저장
        this.statusCache = { data: result, timestamp: now };

        return result;
    }

    /**
     * 상태 캐시 무효화 (서버 시작/종료 시 호출)
     */
    invalidateStatusCache(): void {
        this.statusCache = { data: null, timestamp: 0 };
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
        await this.stopControlServer();
    }
}

export const processManager = new ProcessManager();

