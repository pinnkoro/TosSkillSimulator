import { useEffect, useMemo, useRef, useState } from 'react';
import type { TreeId } from './types';
import { gameData, getJob } from './data/gameData';
import {
  decodeBuild,
  emptyBuild,
  encodeBuild,
  jobChoicesFor,
  pointsUsed,
  selectTree,
  selectedJobs,
  setJob,
  setLevel,
  treeList,
} from './lib/build';
import { SkillCard } from './components/SkillCard';
import { classIconUrl } from './lib/icons';
import './App.css';

/** 枠ごとの上限ポイント（暫定・編集可能）。gihyeonofsoul 同様 max-sp を手動調整。 */
const DEFAULT_BUDGET = 15;

/** クラスアイコン。無い/失敗時は非表示。 */
function ClassIcon({ icon }: { icon: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !icon) return null;
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
  const [build, setBuild] = useState(() => decodeBuild(location.hash));
  const [budgets, setBudgets] = useState<Record<number, number>>({});
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
        <h1>jTOS スキルシミュレータ</h1>
        <div className="topbar-actions">
          <span className="total">合計 {totalPoints} pt</span>
          <button type="button" onClick={share} disabled={!build.tree}>
            {copied ? 'コピーしました' : 'URLを共有'}
          </button>
          <button type="button" className="ghost" onClick={reset} disabled={!build.tree}>
            リセット
          </button>
        </div>
      </header>

      <section className="tree-select">
        <span className="section-label">系統</span>
        <div className="tree-buttons">
          {treeList.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`tree-btn${build.tree === t.id ? ' selected' : ''}`}
              onClick={() => setBuild(selectTree(t.id as TreeId))}
            >
              {t.name}
            </button>
          ))}
        </div>
      </section>

      {!build.tree && (
        <p className="hint">系統を選ぶとジョブとスキルが表示されます。</p>
      )}

      {build.tree && (
        <>
          <section className="job-slots">
            <span className="section-label">ジョブ（枠0=スターター固定）</span>
            <div className="slot-row">
              {build.jobs.map((jobId, slot) => {
                const job = getJob(jobId);
                if (slot === 0) {
                  return (
                    <div key={slot} className="slot base">
                      <span className="slot-tag">枠0 / base</span>
                      <span className="slot-name">
                        {job && <ClassIcon icon={job.icon} />}
                        {job?.name ?? '—'}
                      </span>
                    </div>
                  );
                }
                const choices = jobChoicesFor(build, slot);
                return (
                  <div key={slot} className={`slot${job ? ' filled' : ''}`}>
                    <span className="slot-tag">
                      {job && <ClassIcon icon={job.icon} />}枠{slot}
                    </span>
                    <select
                      value={jobId ?? ''}
                      onChange={(e) =>
                        setBuild(
                          setJob(build, slot, e.target.value ? Number(e.target.value) : null),
                        )
                      }
                    >
                      <option value="">— 選択 —</option>
                      {choices.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="skills">
            {jobs.map((job) => {
              const used = pointsUsed(build, job);
              const budget = budgets[job.id] ?? DEFAULT_BUDGET;
              const over = used > budget;
              return (
                <div className="job-block" key={job.id}>
                  <div className="job-block-head">
                    <h2>
                      {job.name}
                      <span className="job-eng">{job.engName}</span>
                    </h2>
                    <div className={`budget${over ? ' over' : ''}`}>
                      <span>
                        {used} /
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={budget}
                        onChange={(e) =>
                          setBudgets((b) => ({ ...b, [job.id]: Math.max(0, Number(e.target.value)) }))
                        }
                      />
                      <span>pt</span>
                    </div>
                  </div>
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
        <span>{gameData.meta.jobCount}ジョブ / {gameData.meta.skillCount}スキル</span>
        <span className="copyright">{gameData.meta.note}</span>
      </footer>
    </div>
  );
}
