import { isFreshCapture, fitWithin, readVideoDuration } from './media';
import { vi } from 'vitest';

const NOW = 1_000_000_000_000;
describe('isFreshCapture', () => {
  it('accepts a file captured moments ago', () => expect(isFreshCapture({ lastModified: NOW - 20_000 }, NOW)).toBe(true));
  it('rejects a gallery file from yesterday', () => expect(isFreshCapture({ lastModified: NOW - 86_400_000 }, NOW)).toBe(false));
  it('rejects a file dated in the future by more than a minute', () => expect(isFreshCapture({ lastModified: NOW + 120_000 }, NOW)).toBe(false));
});
describe('fitWithin', () => {
  it('keeps small images', () => expect(fitWithin(800, 600, 1280)).toEqual({ w: 800, h: 600 }));
  it('scales landscape by the long side', () => expect(fitWithin(4000, 3000, 1280)).toEqual({ w: 1280, h: 960 }));
  it('scales portrait by the long side', () => expect(fitWithin(3000, 4000, 1280)).toEqual({ w: 960, h: 1280 }));
});
describe('readVideoDuration (stubbed video element)', () => {
  it('rejects with video_unreadable when duration is not finite', async () => {
    const originalCreate = document.createElement;
    const mockVideo = {
      preload: '',
      src: '',
      onloadedmetadata: null as ((this: HTMLVideoElement, ev: Event) => any) | null,
      onerror: null as ((this: HTMLVideoElement, ev: Event) => any) | null,
      duration: Infinity,
    } as unknown as HTMLVideoElement;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'video') {
        setTimeout(() => mockVideo.onloadedmetadata?.call(mockVideo, new Event('loadedmetadata')), 0);
        return mockVideo;
      }
      return originalCreate.call(document, tag);
    });
    const file = new File([], 'test.mp4', { type: 'video/mp4' });
    await expect(readVideoDuration(file, 100)).rejects.toThrow('video_unreadable');
    vi.restoreAllMocks();
  });
  it('rejects with video_unreadable when duration is zero', async () => {
    const originalCreate = document.createElement;
    const mockVideo = {
      preload: '',
      src: '',
      onloadedmetadata: null as ((this: HTMLVideoElement, ev: Event) => any) | null,
      onerror: null as ((this: HTMLVideoElement, ev: Event) => any) | null,
      duration: 0,
    } as unknown as HTMLVideoElement;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'video') {
        setTimeout(() => mockVideo.onloadedmetadata?.call(mockVideo, new Event('loadedmetadata')), 0);
        return mockVideo;
      }
      return originalCreate.call(document, tag);
    });
    const file = new File([], 'test.mp4', { type: 'video/mp4' });
    await expect(readVideoDuration(file, 100)).rejects.toThrow('video_unreadable');
    vi.restoreAllMocks();
  });
  it('rejects with video_timeout when metadata does not load within timeout', async () => {
    const originalCreate = document.createElement;
    const mockVideo = {
      preload: '',
      src: '',
      onloadedmetadata: null as ((this: HTMLVideoElement, ev: Event) => any) | null,
      onerror: null as ((this: HTMLVideoElement, ev: Event) => any) | null,
      duration: NaN,
    } as unknown as HTMLVideoElement;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'video') {
        return mockVideo;
      }
      return originalCreate.call(document, tag);
    });
    const file = new File([], 'test.mp4', { type: 'video/mp4' });
    vi.useFakeTimers();
    const promise = readVideoDuration(file, 100);
    vi.advanceTimersByTime(101);
    await expect(promise).rejects.toThrow('video_timeout');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
