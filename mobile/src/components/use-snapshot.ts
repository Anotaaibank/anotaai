import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AppState} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useSession} from '@/providers/session';
import type {SnapshotResponse} from '@/core/contracts';
import {createSnapshotResource, initialSnapshotState} from '@/core/snapshot-resource';

export function useSnapshot() {
  const {call} = useSession();
  const [state, setState] = useState(initialSnapshotState<SnapshotResponse>);
  const focused = useRef(false);
  const resource = useMemo(() => createSnapshotResource(
    () => call<SnapshotResponse>({action: 'snapshot'}), setState,
  ), [call]);
  useEffect(() => {
    let previous = AppState.currentState;
    const listener = AppState.addEventListener('change', next => {
      const returned = next === 'active' && previous !== 'active';
      previous = next;
      if (next !== 'active') resource.deactivate();
      else if (returned && focused.current) void resource.activate();
    });
    return () => {listener.remove(); resource.deactivate();};
  }, [resource]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') void resource.activate();
    return () => {focused.current = false; resource.deactivate();};
  }, [resource]));
  return {...state, refresh: resource.refresh};
}
