/** Shown while the status fetch may be incomplete: status may then be missing reports, so never imply it is complete. */
export function TruncatedBanner({ truncated }: { truncated: boolean }) {
  if (!truncated) return null;
  return <p role="alert" className="banner banner--warn">ข้อมูลรายงานมีมากเกินไป สถานะอาจไม่ครบ — โปรดแจ้งกรรมการ</p>;
}
