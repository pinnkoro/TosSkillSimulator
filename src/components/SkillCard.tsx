import { useState } from 'react';
import type { Skill } from '../types';
import { valueAt } from '../data/gameData';
import { skillIconUrl } from '../lib/icons';

interface Props {
  skill: Skill;
  level: number;
  onChange: (level: number) => void;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** アイコン画像。無い/失敗時は攻/補バッジにフォールバック。 */
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

export function SkillCard({ skill, level, onChange }: Props) {
  const active = level > 0;
  const factor = valueAt(skill.factor, level);
  const sp = valueAt(skill.sp, level);
  const cd = skill.cooldown / 1000;
  const hasAtk = skill.atkAdd.base !== 0 || skill.atkAdd.perLevel !== 0;
  const hasFactor = skill.factor.base !== 0 || skill.factor.perLevel !== 0;
  const levels = Array.from({ length: skill.maxLevel }, (_, i) => i + 1);

  return (
    <div className={`skill-card${active ? ' active' : ''}`}>
      <div className="skill-head">
        <SkillIcon skill={skill} />
        <div className="skill-title">
          <span className="skill-name">{skill.name}</span>
          <span className="skill-meta">
            {skill.element && <span className="tag">{skill.element}</span>}
            {skill.aoeRatio > 0 && <span className="tag">AoE {skill.aoeRatio}</span>}
            {skill.overheat > 0 && <span className="tag">OH {skill.overheat}</span>}
            {skill.unlockClassLevel > 1 && (
              <span className="tag req">Lv{skill.unlockClassLevel}〜</span>
            )}
          </span>
        </div>
        <div className="skill-lv">
          <span className="lv-num">{level}</span>
          <span className="lv-max">/ {skill.maxLevel}</span>
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

      {active && (
        <div className="skill-stats">
          {hasFactor && factor > 0 && (
            <span>係数 <b>{fmt(factor)}%</b></span>
          )}
          {hasAtk && <span>+攻 <b>{fmt(valueAt(skill.atkAdd, level))}</b></span>}
          {sp > 0 && <span>SP <b>{fmt(sp)}</b></span>}
          {cd > 0 && <span>CD <b>{fmt(cd)}s</b></span>}
        </div>
      )}

      {skill.description && <p className="skill-desc">{skill.description}</p>}

      {skill.maxLevel > 1 && (
        <details className="lv-table">
          <summary>レベル別</summary>
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
        </details>
      )}

      {skill.attributes.length > 0 && (
        <details className="attrs">
          <summary>特性 {skill.attributes.length}</summary>
          <ul>
            {skill.attributes.map((a, i) => (
              <li key={i}>
                <span className="attr-name">
                  {a.name}
                  {a.maxLevel > 1 && <span className="attr-max"> ×{a.maxLevel}</span>}
                </span>
                {a.desc && <span className="attr-desc">{a.desc}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
