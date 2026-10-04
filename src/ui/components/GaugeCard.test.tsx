import { render, screen } from '@testing-library/react';
import { GaugeCard } from './GaugeCard';
import { RainCard } from './RainCard';
import { WarningList } from './WarningList';
import type { GaugeView, RainView } from '../../state/agencyView';
import { HOUR, MINUTE } from '../../core/config';

const NOW = 1_000_000_000_000;
const g = (o: Partial<GaugeView>): GaugeView => ({ stationId: 'x', name: 'คลอง', source: 'bma_canal', value: 0.72, unit: 'm', observedAt: NOW - 5 * MINUTE, ageMs: 5 * MINUTE, stale: false, trend: 'steady', state: 'uncalibrated', thresholds: null, ...o });

describe('GaugeCard', () => {
  it('fresh uncalibrated: value + raw text, no badge', () => {
    const { container } = render(<GaugeCard g={g({})} now={NOW} maxAgeMs={HOUR} />);
    expect(screen.getByText(/0\.72/)).toBeTruthy();
    expect(screen.getByText(/ค่าดิบจากหน่วยงาน/)).toBeTruthy();
    expect(screen.queryByText(/ค่าล่าสุดที่ได้/)).toBeNull();
    expect(container.querySelector('.badge')).toBeNull();
  });
  it('stale: old markers, de-emphasised value, no state badge', () => {
    const { container } = render(<GaugeCard g={g({ stale: true, state: 'stale', observedAt: NOW - 3 * HOUR, ageMs: 3 * HOUR })} now={NOW} maxAgeMs={HOUR} />);
    expect(screen.getAllByText(/ข้อมูลเก่า/).length).toBeGreaterThan(0);
    expect(screen.getByText(/ไม่ใช้เป็นข้อมูลปัจจุบัน/)).toBeTruthy();
    expect(screen.getByText(/ค่าล่าสุดที่ได้/)).toBeTruthy();
    expect(container.querySelector('.badge')).toBeNull();
  });
});

describe('RainCard', () => {
  const rain: RainView[] = [{ stationId: 'a', name: 'สถานี', unit: 'mm', observedAt: NOW, stale: true,
    rf1hr: { value: 5, observedAt: NOW - 3 * HOUR, stale: true }, rf24hr: { value: 9, observedAt: NOW - MINUTE, stale: false } }];
  it('marks the stale cell and shows the stored unit', () => {
    render(<RainCard rain={rain} now={NOW} maxAgeMs={HOUR} />);
    expect(screen.getByText(/ไม่ใช้เป็นข้อมูลปัจจุบัน/)).toBeTruthy();
    expect(screen.getAllByText(/ข้อมูลเก่า/).length).toBe(1);
    expect(screen.getByText(/ฝนสถานีใกล้เคียง \(mm\)/)).toBeTruthy();
  });
  it('falls back when unit unknown; missing metric is a dash', () => {
    render(<RainCard rain={[{ ...rain[0]!, unit: null, stale: false, rf1hr: null, rf24hr: { value: 9, observedAt: NOW, stale: false } }]} now={NOW} maxAgeMs={HOUR} />);
    expect(screen.getByText(/หน่วยตามที่หน่วยงานรายงาน/)).toBeTruthy();
    expect(screen.getByText('–')).toBeTruthy();
  });
});

describe('WarningList', () => {
  const w = (id: string, url: string) => ({ id, title: `t${id}`, body: 'b', url, issuedAt: NOW - HOUR, mentionsBangkok: false });
  it('renders only safe links and notes the hidden remainder', () => {
    const { container } = render(<WarningList now={NOW} warnings={[w('1', 'javascript:alert(1)'), w('2', 'https://tmd.go.th/a'), w('3', ''), w('4', 'https://x.y'), w('5', 'https://x.y')]} />);
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://tmd.go.th/a']);
    expect(links[0]!.getAttribute('rel')).toBe('noreferrer noopener');
    expect(screen.getByText(/\+2 รายการเก่ากว่า/)).toBeTruthy();
  });
});
