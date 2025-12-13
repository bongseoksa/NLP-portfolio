import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 루트 디렉토리의 .env 파일을 읽도록 설정
  envDir: path.resolve(__dirname, '..'),
})
