import type { Skill } from '../types';
import { valueAt } from '../data/gameData';

interface Props {
  skill: Skill;
  level: number;
  onChange: (level: number) => void;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function SkillCard({ skill, level, onChange }: Props) {
  const active = level > 0;
  const factor = valueAt(skill.factor, level);
  const sp = valueAt(skill.sp, level);
  const cd = skill.cooldown / 1000;

  return (
    <div className={`skill-card${active ? ' active' : ''}`}>
      <div className="skill-head">
        <span className={`skill-badge type-${skill.type}`}>
          {skill.type === 'attack' ? '攻' : '補'}
        </span>
        <div className="skill-title">
          <span className="skill-name">{skill.name}</span>
          <span className="skill-meta">
            {skill.element && <span className="tag">{skill.element}</span>}
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
          {skill.type === 'attack' && factor > 0 && (
            <span>係数 <b>{fmt(factor)}%</b></span>
          )}
          {sp > 0 && <span>SP <b>{fmt(sp)}</b></span>}
          {cd > 0 && <span>CD <b>{fmt(cd)}s</b></span>}
        </div>
      )}

      {skill.description && (
        <p className="skill-desc">{skill.description}</p>
      )}
    </div>
  );
}
