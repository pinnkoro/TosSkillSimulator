// 同梱アイコン(public/icons)へのURL。BASE_URL は本番で /TosSkillSimulator/、dev で /。
const BASE = import.meta.env.BASE_URL;

export const skillIconUrl = (icon: string) => `${BASE}icons/skill/${icon}.png`;
export const classIconUrl = (icon: string) => `${BASE}icons/class/${icon}.png`;
