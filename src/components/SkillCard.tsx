import { useEffect, useRef, useState } from 'react';
import type { Skill } from '../types';
import { valueAt } from '../data/gameData';
import { skillIconUrl } from '../lib/icons';
import { useI18n } from '../lib/i18n';
import { AttrChip } from './AttrChip';

interface Props {
  skill: Skill;
  level: number;
  onChange: (level: number) => void;
  selectedAttrs: Set<number>;
  onToggleAttr: (attrId: number) => void;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** スキルアイコン。無い/失敗時は攻/補バッジにフォールバック。 */
function SkillIcon({ skill }: { skill: Skill }) {
  const { ui } = useI18n();
  const [failed, setFailed] = useState(false);
  if (failed || !skill.icon) {
    return (
      <span className={`skill-badge type-${skill.type}`}>
        {skill.type === 'attack' ? ui.atkBadge : ui.buffBadge}
      </span>
    );
  }
  return (
    <img
      className={`skill-icon type-${skill.type}`}
      src={skillIconUrl(skill.icon)}
      alt=""
      loading="lazy"
      width={44}
      height={44}
      onError={() => setFailed(true)}
    />
  );
}

export function SkillCard({ skill, level, onChange, selectedAttrs, onToggleAttr }: Props) {
  const { ui, tl } = useI18n();
  const active = level > 0;
  const hasAtk = skill.atkAdd.base !== 0 || skill.atkAdd.perLevel !== 0;
  const hasFactor = skill.factor.base !== 0 || skill.factor.perLevel !== 0;
  const levels = Array.from({ length: skill.maxLevel }, (_, i) => i + 1);
  const cd = skill.cooldown / 1000;

  // ポップアップ: ホバーで開き（ポップアップ内に入っても消えない）、クリックでピン留め。
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const cardRef = useRef<HTMLDivElement>(null);
  const open = hover || pinned;

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setHover(true);
  };
  const hide = () => {
    hideTimer.current = window.setTimeout(() => setHover(false), 150);
  };

  // ピン中は外側クリックで解除。
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pinned]);

  return (
    <div className={`skill-card${active ? ' active' : ''}`} ref={cardRef}>
      {/* 常時: アイコン＋名前＋レベル。ホバーで詳細ポップアップ、クリックでピン留め。 */}
      <div className="skill-hover" onMouseEnter={show} onMouseLeave={hide}>
        <div
          className={`skill-head${pinned ? ' pinned' : ''}`}
          onClick={() => setPinned((p) => !p)}
        >
          <SkillIcon skill={skill} />
          <span className="skill-name">{tl(skill.name)}</span>
          <span className="skill-lv">
            <b>{level}</b>
            <span className="lv-max">/{skill.maxLevel}</span>
          </span>
        </div>

        <div className={`tip skill-tip${open ? ' open' : ''}`}>
          <span className="tip-title">{tl(skill.name)}</span>
          <div className="skill-meta">
            <span className={`tag type-${skill.type}`}>
              {skill.type === 'attack' ? ui.atkTag : ui.buffTag}
            </span>
            {skill.element && <span className="tag">{skill.element}</span>}
            {skill.aoeRatio > 0 && <span className="tag">AoE {skill.aoeRatio}</span>}
            {skill.overheat > 0 && <span className="tag">OH {skill.overheat}</span>}
            {cd > 0 && <span className="tag">CD {fmt(cd)}s</span>}
            {skill.unlockClassLevel > 1 && (
              <span className="tag req">{ui.reqLv(skill.unlockClassLevel)}</span>
            )}
          </div>

          {active && (
            <div className="skill-stats">
              {ui.curLv(level)}
              {hasFactor && (
                <span>
                  {' '}{ui.factor} <b>{fmt(valueAt(skill.factor, level))}%</b>
                  {skill.factorKind === 'approx' && (
                    <span className="inexact"> ({ui.factorApprox})</span>
                  )}
                </span>
              )}
              {hasAtk && <span> {ui.atkAdd} <b>{fmt(valueAt(skill.atkAdd, level))}</b></span>}
              <span> {ui.sp} <b>{fmt(valueAt(skill.sp, level))}</b></span>
            </div>
          )}

          {skill.factorKind === 'approx' && (
            <p className="factor-note">{ui.factorApproxNote}</p>
          )}
          {skill.factorKind === 'lua' && (
            <p className="factor-note">{ui.factorLuaNote}</p>
          )}

          {tl(skill.description) && <p className="tip-desc">{tl(skill.description)}</p>}

          {skill.maxLevel > 1 && (
            <div className="lv-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{ui.thLv}</th>
                    {hasFactor && <th>{ui.thFactor}</th>}
                    {hasAtk && <th>{ui.thAtk}</th>}
                    <th>{ui.thSp}</th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((l) => (
                    <tr key={l} className={l === level ? 'cur' : undefined}>
                      <td>{l}</td>
                      {hasFactor && <td>{fmt(valueAt(skill.factor, l))}</td>}
                      {hasAtk && <td>{fmt(valueAt(skill.atkAdd, l))}</td>}
                      <td>{fmt(valueAt(skill.sp, l))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="stepper">
        <button
          type="button"
          aria-label={ui.lvDown}
          disabled={level <= 0}
          onClick={() => onChange(level - 1)}
        >
          −
        </button>
        <input
          type="range"
          min={0}
          max={skill.maxLevel}
          value={level}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button
          type="button"
          aria-label={ui.lvUp}
          disabled={level >= skill.maxLevel}
          onClick={() => onChange(level + 1)}
        >
          +
        </button>
      </div>

      {/* 常時表示の特性（クリックでON/OFF、共有対象） */}
      {skill.attributes.length > 0 && (
        <div className="attr-row">
          {skill.attributes.map((a) => (
            <AttrChip
              key={a.id}
              attr={a}
              on={selectedAttrs.has(a.id)}
              onToggle={() => onToggleAttr(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
