// 同梱アイコン(public/icons)へのURL。BASE_URL は本番で /TosSkillSimulator/、dev で /。
const BASE = import.meta.env.BASE_URL;

export const skillIconUrl = (icon: string) => `${BASE}icons/skill/${icon}.png`;
export const classIconUrl = (icon: string) => `${BASE}icons/class/${icon}.png`;
export const attrIconUrl = (icon: string) => `${BASE}icons/attr/${icon}.png`;
/** UIトグル用アイコン（public/icons/ui、tools/extract_icons.py の UI_ICONS 由来）。 */
export const uiIconUrl = (name: string) => `${BASE}icons/ui/${name}.png`;
/** スキルジェム。系統ごとに絵柄が違うので選択中の系統のものを使う。 */
export const gemIconUrl = (tree: string) => uiIconUrl(`skillgem_${tree}`);
