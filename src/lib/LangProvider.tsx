// 言語状態を配る Provider。選択は localStorage('tos-lang') に保存し、<html lang> にも反映。
import { useEffect, useState, type ReactNode } from 'react';
import { LangContext, STORAGE_KEY, initialLang, type Lang } from './i18n';

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // 保存不可でも表示は継続。
    }
    document.documentElement.lang = lang;
  }, [lang]);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}
