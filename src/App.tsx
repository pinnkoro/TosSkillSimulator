import { useEffect, useMemo, useRef, useState } from 'react';
import type { TreeId } from './types';
import { gameData, getJob } from './data/gameData';
import {
  BONUS_POOL,
  bonusUsed,
  decodeBuild,
  emptyBuild,
  encodeBuild,
  jobBudget,
  jobChoicesFor,
  pointsUsed,
  selectTree,
  selectedJobs,
  setJob,
  setLevel,
  toggleAttr,
  treeList,
} from './lib/build';
import { SkillCard } from './components/SkillCard';
import { AttrChip } from './components/AttrChip';
import { classIconUrl } from './lib/icons';
import { LANGS, useI18n } from './lib/i18n';
import './App.css';

/** クラスアイコン。無い/失敗時は同サイズのプレースホルダで場所を保持（表示形式を統一）。 */
function ClassIcon({ icon }: { icon: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !icon) return <span className="class-icon placeholder" />;
  return (
    <img
      className="class-icon"
      src={classIconUrl(icon)}
      alt=""
      width={32}
      height={32}
      onError={() => setFailed(true)}
    />
  );
}

export default function App() {
  const { ui, tl, lang, setLang } = useI18n();
  const [build, setBuild] = useState(() => decodeBuild(location.hash));
  const [copied, setCopied] = useState(false);
  const skipHash = useRef(false);

  // build → URL hash（自分で書いた変更は skipHash で読み戻さない）。
  useEffect(() => {
    const encoded = encodeBuild(build);
    skipHash.current = true;
    const next = encoded ? `#${encoded}` : '';
    if (next !== location.hash) {
      history.replaceState(null, '', next || location.pathname + location.search);
    }
  }, [build]);

  // 戻る/進む・外部からの hash 変更に追従。
  useEffect(() => {
    const onHash = () => {
      if (skipHash.current) {
        skipHash.current = false;
        return;
      }
      setBuild(decodeBuild(location.hash));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const jobs = selectedJobs(build);

  const totalPoints = useMemo(
    () => Object.values(build.levels).reduce((a, b) => a + b, 0),
    [build.levels],
  );
  const bonus = bonusUsed(build);
  const selectedAttrs = useMemo(() => new Set(build.attrs), [build.attrs]);

  const share = async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // クリップボード不可の環境: hash は既に URL に反映済み。
      setCopied(false);
    }
  };

  const reset = () => setBuild(emptyBuild());

  return (
    <div className="app">
      <header className="topbar">
        <h1>{ui.title}</h1>
        <div className="topbar-actions">
          <span className="total">{ui.total} {totalPoints} {ui.pt}</span>
          {build.tree && (
            <span className={`bonus${bonus > BONUS_POOL ? ' over' : ''}`}>
              {ui.add} {bonus}/{BONUS_POOL}
            </span>
          )}
          <button type="button" onClick={share} disabled={!build.tree}>
            {copied ? ui.copied : ui.share}
          </button>
          <button type="button" className="ghost" onClick={reset} disabled={!build.tree}>
            {ui.reset}
          </button>
          <div className="lang-select" role="group" aria-label={ui.langLabel}>
            {LANGS.map((l) => (
              <button
                type="button"
                key={l.id}
                className={`lang-btn${lang === l.id ? ' selected' : ''}`}
                aria-pressed={lang === l.id}
                onClick={() => setLang(l.id)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="tree-select">
        <span className="section-label">{ui.tree}</span>
        <div className="tree-buttons">
          {treeList.map((t) => {
            const baseIcon = getJob(t.baseJobId)?.icon;
            return (
              <button
                type="button"
                key={t.id}
                className={`tree-btn${build.tree === t.id ? ' selected' : ''}`}
                onClick={() => setBuild(selectTree(t.id as TreeId))}
              >
                {baseIcon && <ClassIcon icon={baseIcon} />}
                {tl(t.name)}
              </button>
            );
          })}
        </div>
      </section>

      {!build.tree && (
        <p className="hint">{ui.hint}</p>
      )}

      {build.tree && (
        <>
          <section className="job-slots">
            <span className="section-label">{ui.jobsLabel}</span>
            <div className="slot-row">
              {build.jobs.map((jobId, slot) => {
                const job = getJob(jobId);
                if (slot === 0) {
                  return (
                    <div key={slot} className="slot base">
                      <span className="slot-tag">{ui.slot0}</span>
                      <div className="slot-body">
                        <ClassIcon icon={job?.icon ?? ''} />
                        <span className="slot-name">{job ? tl(job.name) : '—'}</span>
                      </div>
                    </div>
                  );
                }
                const choices = jobChoicesFor(build, slot);
                return (
                  <div key={slot} className={`slot${job ? ' filled' : ''}`}>
                    <span className="slot-tag">{ui.slot(slot)}</span>
                    <div className="slot-body">
                      <ClassIcon icon={job?.icon ?? ''} />
                      <select
                        value={jobId ?? ''}
                        onChange={(e) =>
                          setBuild(
                            setJob(build, slot, e.target.value ? Number(e.target.value) : null),
                          )
                        }
                      >
                        <option value="">{ui.choose}</option>
                        {choices.map((c) => (
                          <option key={c.id} value={c.id}>
                            {tl(c.name)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="skills">
            {jobs.map((job) => {
              const used = pointsUsed(build, job);
              const budget = jobBudget(job);
              const over = used > budget;
              return (
                <div className="job-block" key={job.id}>
                  <div className="job-block-head">
                    <h2>
                      {tl(job.name)}
                      <span className="job-eng">{job.engName}</span>
                    </h2>
                    <div className={`budget${over ? ' over' : ''}`}>
                      <b>{used}</b>
                      <span>/ {budget} {ui.pt}</span>
                      {over && <span className="budget-bonus">(+{used - budget})</span>}
                    </div>
                  </div>
                  {job.attributes.length > 0 && (
                    <div className="class-attrs">
                      <span className="section-label">{ui.classAttrs}</span>
                      <div className="attr-row">
                        {job.attributes.map((a) => (
                          <AttrChip
                            key={a.id}
                            attr={a}
                            on={selectedAttrs.has(a.id)}
                            onToggle={() => setBuild(toggleAttr(build, a.id))}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="skill-grid">
                    {job.skillIds
                      .map((sid) => gameData.skills[String(sid)])
                      .filter(Boolean)
                      .map((skill) => (
                        <SkillCard
                          key={skill.id}
                          skill={skill}
                          level={build.levels[skill.id] ?? 0}
                          onChange={(lv) => setBuild(setLevel(build, skill.id, lv))}
                          selectedAttrs={selectedAttrs}
                          onToggleAttr={(aid) => setBuild(toggleAttr(build, aid))}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

      <footer className="foot">
        <span>{ui.footer(gameData.meta.jobCount, gameData.meta.skillCount)}</span>
        <span className="copyright">{gameData.meta.note}</span>
      </footer>
    </div>
  );
}
