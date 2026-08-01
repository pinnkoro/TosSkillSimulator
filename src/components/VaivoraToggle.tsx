import { useState } from 'react';
import type { Vaivora } from '../types';
import { uiIconUrl } from '../lib/icons';
import { useI18n } from '../lib/i18n';

interface Props {
  on: boolean;
  /** 空き枠が無い（未装着のクラスでは押せない） */
  full: boolean;
  onToggle: () => void;
  /** そのクラスのバイボラ（ホバーで名前と効果を表示） */
  entries: Vaivora[];
}

/** クラス単位のバイボラON/OFF。基礎職には出さない（呼び出し側で制御）。 */
export function VaivoraToggle({ on, full, onToggle, entries }: Props) {
  const { ui, tl } = useI18n();
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
      <span className="tip vaivora-tip">
        <span className="tip-title">{ui.vaivora}</span>
        <span className="tip-desc">
          {ui.vaivoraHint}
          {disabled && `\n${ui.noSlot}`}
        </span>
        {entries.length > 0 ? (
          entries.map((v) => (
            <span className="vaivora-entry" key={v.item}>
              <span className="vaivora-name">{tl(v.name)}</span>
              {tl(v.desc) ? (
                <span className="tip-desc">{tl(v.desc)}</span>
              ) : (
                <span className="tip-desc dim">{ui.vaivoraNoDesc}</span>
              )}
            </span>
          ))
        ) : (
          <span className="tip-desc dim">{ui.vaivoraNone}</span>
        )}
      </span>
    </button>
  );
}
