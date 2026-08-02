// ルーティング。ルータは入れず、クエリ ?p= で振り分ける。
// hash はビルド共有用（encodeBuild）に使い切っているため、ページ切替には使わない。

export type Page = 'sim' | 'changelog';

const PARAM = 'p';

/** ソースコード（フッターから開く）。 */
export const REPO_URL = 'https://github.com/pinnkoro/TosSkillSimulator';

/** 現在の URL からページを判定。未知の値はシミュレータ扱い。 */
export function currentPage(): Page {
  return new URLSearchParams(location.search).get(PARAM) === 'changelog' ? 'changelog' : 'sim';
}

/** シミュレータ本体（= サイトのルート）への URL。組み立て中のビルド(hash)は持ち回る。 */
export function homeHref(hash: string = location.hash): string {
  return `${import.meta.env.BASE_URL}${hash}`;
}

/** 更新履歴ページへの URL。戻ってきたときに復元できるよう hash を持ち回る。
 *
 * hash を省くと現在の URL のものを使う。ビルド編集中の App からは、hash の書き戻しが
 * effect（＝描画の後）なので location では 1 手遅れる。呼ぶ側で今の値を渡すこと。 */
export function changelogHref(hash: string = location.hash): string {
  return `${import.meta.env.BASE_URL}?${PARAM}=changelog${hash}`;
}
