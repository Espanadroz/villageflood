/** Where a number came from, in words a resident recognises. Unknown sources are shown as-is, never hidden. */
const SOURCE_LABEL_TH: Record<string, string> = {
  bma_canal: 'สำนักการระบายน้ำ กทม.',
  bma_rain: 'สำนักการระบายน้ำ กทม.',
  thaiwater: 'ThaiWater (สสน.)',
  tmd: 'กรมอุตุนิยมวิทยา',
};
export const sourceLabelTh = (source: string) => SOURCE_LABEL_TH[source] ?? source;
