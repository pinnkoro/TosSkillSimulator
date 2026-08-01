import { useState } from 'react';
import { uiIconUrl } from '../lib/icons';
import { useI18n } from '../lib/i18n';

interface Props {
  on: boolean;
  /** 空き枠が無い（未装着のクラスでは押せない） */
  full: boolean;
  onToggle: () => void;
}

/** クラス単位のバイボラON/OFF。基礎職には出さない（呼び出し側で制御）。 */
export function VaivoraToggle({ on, full, onToggle }: Props) {
  const { ui } = useI18n();
  const [failed, setFailed] = useState(false);
  const disabled = !on && full;
  return (
    <button
      type="button"
      className={`vaivora-toggle has-tip${on ? ' on' : ''}`}
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
    >
      {failed ? (
        <span className="vaivora-mark" aria-hidden="true">
          ✦
        </span>
      ) : (
        <img
          src={uiIconUrl('vaivora')}
          alt=""
          loading="lazy"
          width={22}
          height={22}
          onError={() => setFailed(true)}
        />
      )}
      <span>{ui.vaivora}</span>
      <span className="tip attr-tip">
        <span className="tip-title">{ui.vaivora}</span>
        <span className="tip-desc">
          {ui.vaivoraHint}
          {disabled && `\n${ui.noSlot}`}
        </span>
      </span>
    </button>
  );
}
