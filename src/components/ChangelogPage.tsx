import { CHANGELOG } from '../data/changelog';
import { LANGS, useI18n } from '../lib/i18n';
import { homeHref } from '../lib/routes';

/** 更新履歴ページ。ビルド状態を持たないので hash とは無関係に描画する。 */
export function ChangelogPage() {
  const { ui, tl, lang, setLang } = useI18n();

  return (
    <div className="app">
      <header className="topbar">
        <h1>{ui.changelogTitle}</h1>
        <div className="topbar-actions">
          <a className="page-link" href={homeHref()}>
            ← {ui.backToSim}
          </a>
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

      <section className="changelog">
        {CHANGELOG.map((entry) => (
          <article className="changelog-entry" key={entry.date}>
            <h2 className="changelog-date">{entry.date}</h2>
            <ul className="changelog-items">
              {entry.items.map((item) => (
                <li key={item.ja}>{tl(item)}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <footer className="foot">
        <a className="page-link" href={homeHref()}>
          ← {ui.backToSim}
        </a>
      </footer>
    </div>
  );
}
