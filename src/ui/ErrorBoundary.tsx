import { Component, lazy, type ComponentType, type ErrorInfo, type ReactNode } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Factory = () => Promise<{ default: ComponentType<any> }>;
const failed = new Set<() => void>();

/** React.lazy caches a rejected import forever; this wrapper can build a fresh lazy component on retry. */
export function lazyRetry(factory: Factory): ComponentType {
  const make = () => lazy(() => factory().catch((e) => { failed.add(rebuild); throw e; }));
  let Lazy = make();
  const rebuild = () => { Lazy = make(); };
  const Wrapper = () => <Lazy />;
  return Wrapper;
}
export function retryFailedLazies(): void {
  for (const r of failed) r();
  failed.clear();
}

interface State { error: Error | null }
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('page failed', error, info.componentStack); }
  retry = () => { retryFailedLazies(); this.setState({ error: null }); };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page" role="alert">
        <p>โหลดหน้านี้ไม่สำเร็จ — อาจเป็นเพราะอินเทอร์เน็ตไม่เสถียร</p>
        <button type="button" onClick={this.retry}>ลองอีกครั้ง</button>{' '}
        <button type="button" className="secondary" onClick={() => location.reload()}>โหลดหน้าใหม่</button>
      </div>
    );
  }
}
