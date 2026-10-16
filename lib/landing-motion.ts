// The marketing illustration is local: it never reads or changes financial data.
export function storyProgress(scroll: number, start: number, distance: number) {
 if (![scroll, start, distance].every(Number.isFinite) || distance <= 0) return 0;
 return Math.max(0, Math.min(1, (scroll - start) / distance));
}

export function storyFrame(progress: number) {
 const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
 const between = (from: number, to: number) => {
  const t = Math.max(0, Math.min(1, (p - from) / (to - from)));
  return t * t * (3 - 2 * t);
 };
 return {
  progress: p,
  message: .35 + .65 * between(0, .12),
  summary: between(.15, .32),
  confirmed: between(.38, .52),
  card: between(.54, .67),
  dashboard: between(.67, .86),
  dock: between(.83, .98),
  stage: p < .15 ? 0 : p < .38 ? 1 : p < .54 ? 2 : 3,
 };
}

export function shouldSimplifyStory(options: {reducedMotion: boolean; saveData: boolean; sticky: boolean; height: number; cores?: number}) {
 return options.reducedMotion || options.saveData || !options.sticky || options.height < 680 || (options.cores !== undefined && options.cores <= 2);
}
