import { useState } from 'react';
import type { Skill, SkillAttribute } from '../types';
import { valueAt } from '../data/gameData';
import { attrIconUrl, skillIconUrl } from '../lib/icons';

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
  const [failed, setFailed] = useState(false);
  if (failed || !skill.icon) {
    return (
      <span className={`skill-badge type-${skill.type}`}>
        {skill.type === 'attack' ? '攻' : '補'}
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

/** 特性チップ（アイコン＋ON/OFFトグル、ホバーで名前/説明）。 */
function AttrChip({
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

export function SkillCard({ skill, level, onChange, selectedAttrs, onToggleAttr }: Props) {
  const active = level > 0;
  const hasAtk = skill.atkAdd.base !== 0 || skill.atkAdd.perLevel !== 0;
  const hasFactor = skill.factor.base !== 0 || skill.factor.perLevel !== 0;
  const levels = Array.from({ length: skill.maxLevel }, (_, i) => i + 1);
  const cd = skill.cooldown / 1000;

  return (
    <div className={`skill-card${active ? ' active' : ''}`}>
      {/* 常時: アイコン＋名前＋レベル。ホバーで詳細ポップアップ。 */}
      <div className="skill-head has-tip" tabIndex={0}>
        <SkillIcon skill={skill} />
        <span className="skill-name">{skill.name}</span>
        <span className="skill-lv">
          <b>{level}</b>
          <span className="lv-max">/{skill.maxLevel}</span>
        </span>

        <div className="tip skill-tip">
          <span className="tip-title">{skill.name}</span>
          <div className="skill-meta">
            <span className={`tag type-${skill.type}`}>
              {skill.type === 'attack' ? '攻撃' : '補助'}
            </span>
            {skill.element && <span className="tag">{skill.element}</span>}
            {skill.aoeRatio > 0 && <span className="tag">AoE {skill.aoeRatio}</span>}
            {skill.overheat > 0 && <span className="tag">OH {skill.overheat}</span>}
            {cd > 0 && <span className="tag">CD {fmt(cd)}s</span>}
            {skill.unlockClassLevel > 1 && (
              <span className="tag req">Lv{skill.unlockClassLevel}〜</span>
            )}
          </div>

          {active && (
            <div className="skill-stats">
              現在Lv{level}:
              {hasFactor && <span> 係数 <b>{fmt(valueAt(skill.factor, level))}%</b></span>}
              {hasAtk && <span> +攻 <b>{fmt(valueAt(skill.atkAdd, level))}</b></span>}
              <span> SP <b>{fmt(valueAt(skill.sp, level))}</b></span>
            </div>
          )}

          {skill.description && <p className="tip-desc">{skill.description}</p>}

          {skill.maxLevel > 1 && (
            <div className="lv-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Lv</th>
                    {hasFactor && <th>係数%</th>}
                    {hasAtk && <th>+攻</th>}
                    <th>SP</th>
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
          aria-label="レベルを下げる"
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
          aria-label="レベルを上げる"
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
