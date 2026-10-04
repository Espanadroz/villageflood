export interface Reading {
  source: 'bma_canal' | 'bma_rain' | 'thaiwater'; stationId: string; stationName: string;
  lat: number | null; lng: number | null; metric: string; value: number; unit: string; observedAt: Date;
}
export interface Warning { id: string; title: string; body: string; url: string; issuedAt: Date; mentionsBangkok: boolean }
export interface Incident { id: string; title: string; lat: number; lng: number; severity: number; startAt: Date; stopAt: Date }
