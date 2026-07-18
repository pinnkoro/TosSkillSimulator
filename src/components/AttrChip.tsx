import { useState } from 'react';
import type { SkillAttribute } from '../types';
import { attrIconUrl } from '../lib/icons';
import { useI18n } from '../lib/i18n';

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
  const { tl } = useI18n();
  const [failed, setFailed] = useState(false);
  const name = tl(attr.name);
  const desc = tl(attr.desc);
  return (
    <button
      type="button"
      className={`attr-chip has-tip${on ? ' on' : ''}`}
      aria-pressed={on}
      onClick={onToggle}
    >
      {failed || !attr.icon ? (
        <span className="attr-fallback">{name.slice(0, 1)}</span>
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
          {name}
          {attr.maxLevel > 1 && <span className="attr-max"> Lv{attr.maxLevel}</span>}
        </span>
        {desc && <span className="tip-desc">{desc}</span>}
      </span>
    </button>
  );
}
