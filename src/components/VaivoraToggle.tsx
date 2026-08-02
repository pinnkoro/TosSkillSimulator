import { useEffect, useRef, useState } from 'react';
import type { Vaivora, VaivoraLevel } from '../types';
import { VAIVORA_LV_MAX, VAIVORA_LV_MIN } from '../lib/build';
import { uiIconUrl } from '../lib/icons';
import { useI18n } from '../lib/i18n';

interface Props {
  on: boolean;
  /** 空き枠が無い（未装着のクラスでは押せない） */
  full: boolean;
  onToggle: () => void;
  /** 装備中の段階(1〜4)。未装備なら 0。 */
  level: number;
  onLevelChange: (level: number) => void;
  /** そのクラスのバイボラ（ホバーで名前と効果を表示） */
  entries: Vaivora[];
}

/** 段階ごとのステータス差。levels に載っているキーの和集合を行にする。 */
function statKeys(levels: VaivoraLevel[]): string[] {
  const keys: string[] = [];
  for (const l of levels) {
    for (const k of Object.keys(l.stats)) if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

/** クラス単位のバイボラON/OFF＋段階(Lv1〜4)。基礎職には出さない（呼び出し側で制御）。 */
export function VaivoraToggle({
  on,
  full,
  onToggle,
  level,
  onLevelChange,
  entries,
}: Props) {
  const { ui, tl, sl } = useI18n();
  const [failed, setFailed] = useState(false);
  const disabled = !on && full;

  // ポップアップ: 段階の表が入って縦に長いので、スキルカードと同じくホバーを
  // 少し引き延ばす。ポップアップはこの要素の子なので、6px の隙間を越えて
  // 中に入っても hide のタイマーが切れる前に show が走り、閉じない。
  const [hover, setHover] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHover(true);
  };
  const hide = () => {
    hideTimer.current = window.setTimeout(() => setHover(false), 150);
  };
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  return (
    // 枠なしで押せないときの理由も出すので、ツールチップは disabled にならない外側に持たせる。
    <span
      className="vaivora-slot"
      onMouseEnter={show}
      onMouseLeave={hide}
      // キーボード操作時だけ開く（クリック後のフォーカス残りで出っぱなしにしない）。
      onFocus={(e) => {
        if (e.target.matches(':focus-visible')) show();
      }}
      onBlur={hide}
    >
      <button
        type="button"
        className={`vaivora-toggle${on ? ' on' : ''}`}
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
      </button>
      {/* 段階は装備中だけ。既定は最大(Lv4)で、必要なら下げられる。 */}
      {on && (
        <span className="vaivora-lv">
          <button
            type="button"
            className="step"
            aria-label={ui.vaivoraLvDown}
            disabled={level <= VAIVORA_LV_MIN}
            onClick={() => onLevelChange(level - 1)}
          >
            −
          </button>
          <b>{ui.vaivoraLv(level)}</b>
          <button
            type="button"
            className="step"
            aria-label={ui.vaivoraLvUp}
            disabled={level >= VAIVORA_LV_MAX}
            onClick={() => onLevelChange(level + 1)}
          >
            ＋
          </button>
        </span>
      )}
      <span className={`tip vaivora-tip${hover ? ' open' : ''}`}>
        <span className="tip-title">{ui.vaivora}</span>
        <span className="tip-desc">
          {ui.vaivoraHint}
          {disabled && `\n${ui.noSlot}`}
        </span>
        {entries.length > 0 ? (
          entries.map((v) => {
            const keys = statKeys(v.levels);
            const cur = v.levels.find((l) => l.level === level);
            return (
              <span className="vaivora-entry" key={v.item}>
                <span className="vaivora-name">{tl(v.name)}</span>
                {tl(v.desc) ? (
                  <span className="tip-desc">{tl(v.desc)}</span>
                ) : (
                  <span className="tip-desc dim">{ui.vaivoraNoDesc}</span>
                )}
                {v.levels.length > 1 && (
                  <>
                    <span className="tip-desc dim">{ui.vaivoraLvNote}</span>
                    <table className="vaivora-lv-table">
                      <thead>
                        <tr>
                          <th />
                          {v.levels.map((l) => (
                            <th
                              key={l.level}
                              className={l.level === level ? 'cur' : undefined}
                            >
                              {ui.vaivoraLv(l.level)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <th>{ui.vaivoraUseLv}</th>
                          {v.levels.map((l) => (
                            <td
                              key={l.level}
                              className={l.level === level ? 'cur' : undefined}
                            >
                              {l.useLv}
                            </td>
                          ))}
                        </tr>
                        {keys.map((k) => (
                          <tr key={k}>
                            <th>{sl(k)}</th>
                            {v.levels.map((l) => (
                              <td
                                key={l.level}
                                className={l.level === level ? 'cur' : undefined}
                              >
                                {l.stats[k] ?? 0}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {cur?.subSlot && (
                      <span className="tip-desc">{ui.vaivoraSubSlot}</span>
                    )}
                    {cur?.bonusOption && (
                      <span className="tip-desc dim">
                        {ui.vaivoraBonusOption(cur.bonusOption)}
                      </span>
                    )}
                  </>
                )}
              </span>
            );
          })
        ) : (
          <span className="tip-desc dim">{ui.vaivoraNone}</span>
        )}
      </span>
    </span>
  );
}
