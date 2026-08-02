import { useLayoutEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';

/** 画面端に残す余白。ポップアップはこの内側に必ず収める。 */
const MARGIN = 8;
/** アンカーとポップアップの隙間。マウスが抜けないよう詰めておく。 */
const GAP = 6;

interface Options {
  /** アンカーに対する横位置（既定は左揃え）。小さいチップは中央寄せが自然。 */
  align?: 'start' | 'center';
  /** 内容が長いときの高さ上限。実際にはこの値と画面の空きの小さい方。 */
  maxHeight?: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(v, max));
}

/**
 * ツールチップをアンカーの近くに、かつ viewport の内側に収めて置く。
 *
 * position: absolute ではなく fixed で置くのは、絶対配置のままだと閉じている間も
 * はみ出しがページのスクロール範囲に加算されてしまうため（visibility: hidden の要素は
 * レイアウトを占有する。消えるのは display: none だけ）。窓幅によっては、隠れている
 * ポップアップの分だけ横スクロールバーが出る。fixed の要素はスクロール範囲に寄与しない。
 *
 * fixed は transform/filter を持つ祖先があるとそれを基準にしてしまうので、
 * アンカー側の要素にそれらを掛けないこと（CSS 側は内側の img に掛けてある）。
 */
export function useTipPosition<A extends HTMLElement, T extends HTMLElement>(
  open: boolean,
  { align = 'start', maxHeight = 440 }: Options = {},
) {
  const anchorRef = useRef<A>(null);
  const tipRef = useRef<T>(null);

  // 描画前に置きたい（useEffect だと 1 フレーム前の位置で出てから飛ぶ）。
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const tip = tipRef.current;
    if (!open || !anchor || !tip) return;

    const place = () => {
      const a = anchor.getBoundingClientRect();
      // innerWidth/innerHeight はスクロールバーの幅を含むので、
      // その下に潜り込まないよう clientWidth/clientHeight（＝実際に見える領域）で測る。
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      tip.style.maxWidth = `${vw - MARGIN * 2}px`;

      // 上下: 既定は上（下のステッパや特性チップを塞がない）。
      // 上に入りきらず、下の方が広いときだけ下に開く。
      // max-height を外している間は中身がスクロールできず scrollTop が 0 に落ちるので、
      // 測り終えたら書き戻す（ピン留め中のスクロールで表が先頭に戻らないように）。
      const scrolled = tip.scrollTop;
      tip.style.maxHeight = '';
      const natural = tip.getBoundingClientRect().height;
      const above = a.top - GAP - MARGIN;
      const below = vh - a.bottom - GAP - MARGIN;
      const up = natural <= above || above >= below;
      tip.style.maxHeight = `${Math.min(maxHeight, Math.max(up ? above : below, 0))}px`;
      tip.scrollTop = scrolled;

      const t = tip.getBoundingClientRect();
      const left = align === 'center' ? a.left + a.width / 2 - t.width / 2 : a.left;
      tip.style.left = `${clamp(left, MARGIN, vw - t.width - MARGIN)}px`;
      tip.style.top = `${up ? a.top - GAP - t.height : a.bottom + GAP}px`;
    };

    place();
    // 開いたままでも中身（Lv 変更、言語切り替え、ステッパの出現）やアンカーの寸法は変わる。
    // 上に開いているときは上端固定なので、伸びた分がそのまま下のアンカーを覆ってしまう。
    // 大きさが変わるたびに置き直す（place は冪等なので、収束したら発火も止まる）。
    const ro = new ResizeObserver(place);
    ro.observe(tip);
    ro.observe(anchor);
    const onScroll = (e: Event) => {
      // ポップアップ自身の中身のスクロールでは動かさない（レイアウトを揺らすだけ）。
      if (e.target instanceof Node && tip.contains(e.target)) return;
      place();
    };
    // capture: スクロールは祖先の箱で起きてもバブルしないので、捕捉フェーズで拾う。
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align, maxHeight]);

  return { anchorRef, tipRef };
}

/**
 * ホバー（とキーボードフォーカス）で開くツールチップ一式。
 * tipProps をアンカーに、tipRef をポップアップに渡す。開閉は open を class に載せる。
 */
export function useHoverTip<A extends HTMLElement, T extends HTMLElement>(opts?: Options) {
  const [open, setOpen] = useState(false);
  const { anchorRef, tipRef } = useTipPosition<A, T>(open, opts);
  const tipProps = {
    ref: anchorRef,
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
    // キーボード操作時だけ開く（クリック後のフォーカス残りで出っぱなしにしない）。
    onFocus: (e: FocusEvent<A>) => {
      if (e.target.matches(':focus-visible')) setOpen(true);
    },
    // 中の要素間の移動（−/＋ ボタンなど）では閉じない。
    onBlur: (e: FocusEvent<A>) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
    },
  };
  return { open, tipProps, tipRef };
}
