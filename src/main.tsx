import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ChangelogPage } from './components/ChangelogPage.tsx'
import { LangProvider } from './lib/LangProvider.tsx'
import { currentPage } from './lib/routes.ts'

// ページ振り分けはここで行う。App は mount 中ずっと hash を書き換えるので、
// 更新履歴では App 自体を描画しない（= hash 同期を走らせない）。
const page = currentPage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      {page === 'changelog' ? <ChangelogPage /> : <App />}
    </LangProvider>
  </StrictMode>,
)
