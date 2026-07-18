import { useState } from 'react';
import type { SkillAttribute } from '../types';
import { attrIconUrl } from '../lib/icons';

/** 特性チップ（アイコン＋ON/OFFトグル、ホバーで名前/説明）。スキル特性・クラス特性で共用。 */
export function AttrChip({
  attr,
  on,
  onToggle,
}: {
  attr: SkillAttribute;
  on: boolean;
  onToggle: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      className={`attr-chip has-tip${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
    >
      {failed || !attr.icon ? (
        <span className="attr-fallback">{attr.name.slice(0, 1)}</span>
      ) : (
        <img
          src={attrIconUrl(attr.icon)}
          alt=""
          loading="lazy"
          width={28}
          height={28}
          onError={() => setFailed(true)}
        />
      )}
      <span className="tip attr-tip">
        <span className="tip-title">
          {attr.name}
          {attr.maxLevel > 1 && <span className="attr-max"> Lv{attr.maxLevel}</span>}
        </span>
        {attr.desc && <span className="tip-desc">{attr.desc}</span>}
      </span>
    </button>
  );
}
