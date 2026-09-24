// クラス一覧の並び順の選択。言語と同じく localStorage に保存して次回も引き継ぐ。
import type { ClassOrder } from '../data/gameData';

const STORAGE_KEY = 'tos-class-order';

export function initialClassOrder(): ClassOrder {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'tos' || saved === 'eng') return saved;
  } catch {
    // localStorage 不可の環境では既定へ。
  }
  return 'tos';
}

export function saveClassOrder(order: ClassOrder): void {
  try {
    localStorage.setItem(STORAGE_KEY, order);
  } catch {
    // 保存不可でも表示は継続。
  }
}
