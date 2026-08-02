// ルーティング。ルータは入れず、クエリ ?p= で振り分ける。
// hash はビルド共有用（encodeBuild）に使い切っているため、ページ切替には使わない。

export type Page = 'sim' | 'changelog';

const PARAM = 'p';

/** 現在の URL からページを判定。未知の値はシミュレータ扱い。 */
export function currentPage(): Page {
  return new URLSearchParams(location.search).get(PARAM) === 'changelog' ? 'changelog' : 'sim';
}

/** シミュレータ本体（= サイトのルート）への URL。 */
export function homeHref(): string {
  return import.meta.env.BASE_URL;
}

/** 更新履歴ページへの URL。 */
export function changelogHref(): string {
  return `${import.meta.env.BASE_URL}?${PARAM}=changelog`;
}
