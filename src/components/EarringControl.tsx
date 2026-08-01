import { EARRING_MAX } from '../lib/build';
import { useI18n } from '../lib/i18n';

interface Props {
  /** 現在の+Lv(0=未装着) */
  level: number;
  /** 空き枠が無い（未装着の段階は上げられない） */
  full: boolean;
  onChange: (level: number) => void;
}

/**
 * 段(解放クラスLv 1〜/16〜/31〜)ごとのイヤリング。+1〜+EARRING_MAX Lv を設定すると
 * その段のスキル全部に乗る。枠数の管理は呼び出し側（App）。
 */
export function EarringControl({ level, full, onChange }: Props) {
  const { ui } = useI18n();
  const canUp = level < EARRING_MAX && (level > 0 || !full);
  return (
    <div className={`earring-slot has-tip${level > 0 ? ' on' : ''}`}>
      <span className="earring-tag">{ui.earring}</span>
      <button
        type="button"
        aria-label={ui.earringDown}
        disabled={level <= 0}
        onClick={() => onChange(level - 1)}
      >
        −
      </button>
      <span className="earring-lv">{level > 0 ? `+${level}` : '—'}</span>
      <button
        type="button"
        aria-label={ui.earringUp}
        disabled={!canUp}
        onClick={() => onChange(level + 1)}
      >
        +
      </button>
      <span className="tip attr-tip">
        <span className="tip-title">{ui.earring}</span>
        <span className="tip-desc">
          {ui.earringHint}
          {!canUp && level === 0 && `\n${ui.noSlot}`}
        </span>
      </span>
    </div>
  );
}
