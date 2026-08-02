import { useState } from 'react';
import { EARRING_MAX } from '../lib/build';
import { uiIconUrl } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import { useHoverTip } from '../lib/tip';

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
  // アイコンが取れない環境（抽出前など）では従来どおり文字で出す。
  const [failed, setFailed] = useState(false);
  const canUp = level < EARRING_MAX && (level > 0 || !full);
  const { open, tipProps, tipRef } = useHoverTip<HTMLDivElement, HTMLSpanElement>({
    align: 'center',
    maxHeight: 320,
  });
  return (
    <div className={`earring-slot${level > 0 ? ' on' : ''}`} {...tipProps}>
      {failed ? (
        <span className="earring-tag">{ui.earring}</span>
      ) : (
        <img
          className="earring-icon"
          src={uiIconUrl('earring')}
          alt={ui.earring}
          loading="lazy"
          width={20}
          height={20}
          onError={() => setFailed(true)}
        />
      )}
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
      <span className={`tip attr-tip${open ? ' open' : ''}`} ref={tipRef}>
        <span className="tip-title">{ui.earring}</span>
        <span className="tip-desc">
          {ui.earringHint}
          {!canUp && level === 0 && `\n${ui.noSlot}`}
        </span>
      </span>
    </div>
  );
}
