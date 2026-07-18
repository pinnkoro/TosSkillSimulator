import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub Pages のプロジェクトページは /<repo>/ 配下で配信されるため base を合わせる。
// ローカル開発 (npm run dev) では base は '/' で問題ないよう本番ビルド時のみ適用。
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/TosSukillSimulator/' : '/',
}))
