import {ApiError} from './api.ts';

export type SnapshotState<T> = {data: T | null; error: string; status: number | null; loading: boolean};
export function initialSnapshotState<T>(): SnapshotState<T> {
  return {data: null, error: '', status: null, loading: true};
}

/** One read per active epoch. Background/blur invalidates older responses. */
export function createSnapshotResource<T>(read: () => Promise<T>, publish: (state: SnapshotState<T>) => void) {
  let active = false, epoch = 0;
  let pending: Promise<void> | undefined;
  let state = initialSnapshotState<T>();
  const emit = (change: Partial<SnapshotState<T>>) => {state = {...state, ...change}; publish(state);};

  function refresh(): Promise<void> {
    if (!active) return Promise.resolve();
    if (pending) return pending;
    const revision = epoch;
    emit({loading: true, error: '', status: null});
    const work = Promise.resolve().then(async () => {
      if (!active || revision !== epoch) return;
      try {
        const data = await read();
        if (active && revision === epoch) emit({data, error: '', status: null, loading: false});
      } catch (error) {
        if (active && revision === epoch) emit({
          data: null, loading: false,
          error: error instanceof Error ? error.message : 'Não foi possível atualizar seus dados.',
          status: error instanceof ApiError ? error.status : null,
        });
      }
    }).finally(() => {if (pending === work) pending = undefined;});
    pending = work;
    return work;
  }
  return {
    refresh,
    activate() {if (!active) {active = true; epoch++;} return refresh();},
    deactivate() {active = false; epoch++; pending = undefined;},
  };
}
