import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import React, {type ComponentType, type ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {createSnapshotResource, initialSnapshotState} from '../src/core/snapshot-resource.ts';

const require = createRequire(import.meta.url);
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
/** Execute actual view/hook code with fake native edges; this is not a device test. */
function moduleWithMocks(file: string, mocks: Record<string, unknown>) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {fileName: file, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  }}).outputText;
  const module = {exports: {} as Record<string, unknown>};
  runInNewContext(output, {module, exports: module.exports, require: (name: string) => name in mocks ? mocks[name] : require(name)});
  return module.exports;
}

test('actual snapshot hook subscribes to foreground only while focused, deduplicates duplicate active events and cleans up', async () => {
  let focus!: () => () => void, changed!: (state: string) => void, removed = false, count = 0;
  const effects: (() => () => void)[] = [];
  const states: unknown[] = [];
  const appState = {currentState: 'active', addEventListener: (_: string, fn: typeof changed) => {changed = fn; return {remove: () => {removed = true;}};}};
  const exports = moduleWithMocks('../src/components/use-snapshot.ts', {
    react: {
      useState: (initial: () => unknown) => [initial(), (value: unknown) => states.push(value)],
      useRef: (value: unknown) => ({current: value}), useMemo: (fn: () => unknown) => fn(),
      useCallback: (fn: unknown) => fn, useEffect: (fn: () => () => void) => effects.push(fn),
    },
    'react-native': {AppState: appState}, 'expo-router': {useFocusEffect: (fn: typeof focus) => {focus = fn;}},
    '@/providers/session': {useSession: () => ({call: async () => {count++; return {balance: count};}})},
    '@/core/snapshot-resource': {createSnapshotResource, initialSnapshotState},
  });
  (exports.useSnapshot as () => unknown)();
  const cleanup = effects.map(effect => effect());
  const blur = focus(); await tick(); await tick(); await tick();
  assert.equal(count, 1);
  appState.currentState = 'background'; changed('background');
  appState.currentState = 'active'; changed('active'); changed('active');
  await tick(); await tick(); await tick();
  assert.equal(count, 2);
  blur(); changed('background'); changed('active');
  await tick(); assert.equal(count, 2);
  cleanup.forEach(fn => fn()); assert.equal(removed, true); assert.ok(states.length > 0);
});

type ActionProps = {label: string; disabled?: boolean; onPress: () => void};
function accountView(snapshot: unknown) {
  const actions: ActionProps[] = [];
  const box = ({children}: {children?: ReactNode}) => React.createElement('div', null, children);
  const ui = {
    Card: box, Label: box,
    Page: ({children, title}: {children: ReactNode; title: string}) => React.createElement('main', null, React.createElement('h1', null, title), children),
    Busy: () => React.createElement('span', {role: 'progressbar'}, 'Carregando'),
    Notice: ({error}: {error: string}) => error ? React.createElement('p', {role: 'alert'}, error) : null,
    Action: (props: ActionProps) => {actions.push(props); return React.createElement('button', {disabled: props.disabled}, props.label);},
  };
  const component = moduleWithMocks('../src/app/(tabs)/settings.tsx', {
    '@/providers/session': {useSession: () => ({user: {name: 'Pessoa de teste', email: 'synthetic@example.test'}, logout: async () => {}})},
    '@/providers/theme': {useTheme: () => ({dark: false, toggle: () => {}})},
    '@/components/use-snapshot': {useSnapshot: () => snapshot}, '@/components/ui': ui,
  }).default as ComponentType;
  return {html: renderToStaticMarkup(React.createElement(component)), actions};
}

test('actual account view shows loading/error/retry instead of silently hiding usage or displaying fake zero', () => {
  const loading = accountView({data: null, error: '', status: null, loading: true, refresh: async () => {}});
  assert.match(loading.html, /Atualizando seu uso/); assert.doesNotMatch(loading.html, /Pedidos: 0/);
  let retries = 0;
  const failed = accountView({data: null, error: 'Rede de teste indisponível', status: 0, loading: false, refresh: async () => {retries++;}});
  assert.match(failed.html, /role="alert"/); assert.match(failed.html, /Rede de teste indisponível/);
  const action = failed.actions.find(a => a.label === 'Tentar atualizar meu uso');
  assert.ok(action); assert.equal(action.disabled, false); action.onPress(); assert.equal(retries, 1);
  assert.doesNotMatch(failed.html, /Pedidos: 0/);
});

test('account view distinguishes access pending from generic failure without enabling a new billing flow', () => {
  const expired = accountView({data: null, error: 'Acesso pendente', status: 402, loading: false, refresh: async () => {}});
  assert.match(expired.html, /Consulte sua assinatura no Anotei pela web/);
  assert.ok(expired.actions.some(a => a.label === 'Tentar atualizar meu uso'));
});
