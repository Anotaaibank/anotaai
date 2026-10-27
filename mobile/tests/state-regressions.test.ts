import test from 'node:test';
import assert from 'node:assert/strict';
import {ApiError} from '../src/core/api.ts';
import {createTextConversation} from '../src/core/text-conversation.ts';
import {createSnapshotResource,initialSnapshotState,type SnapshotState} from '../src/core/snapshot-resource.ts';
import {moveMonthSelection} from '../src/core/calendar.ts';
const tick=()=>new Promise<void>(resolve=>queueMicrotask(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}


test('410 discards only the expired conversation; next explicit request starts fresh without automatic retry', async () => {
  const inputs: Record<string, unknown>[] = [];
  const client = createTextConversation(async input => {
    inputs.push(input);
    if (input.conversation_id === 'expired') throw new ApiError('A conversa expirou.', 410);
    return {answer: 'Consulta pronta', conversation_id: inputs.length === 1 ? 'expired' : 'fresh'};
  });
  await client.send('Qual meu saldo?', 'r1');
  await assert.rejects(client.send('Tenho contas para hoje?', 'r2'), (error: unknown) => error instanceof ApiError && error.status === 410);
  assert.equal(inputs.length, 2, 'A failed command must not be retried in the background');
  await client.send('Tenho contas para hoje?', 'r3');
  assert.equal(inputs[2].conversation_id, undefined);
  assert.equal(inputs[2].text, 'Tenho contas para hoje?');
  assert.equal(inputs[2].request_id, 'r3');
  assert.ok(inputs.every(input => input.action === 'interpret'), 'No confirmation/write can be synthesized');
});

test('network failure preserves context and never retries a potentially uncertain request', async () => {
  const inputs: Record<string, unknown>[] = [];
  const client = createTextConversation(async input => {
    inputs.push(input);
    if (inputs.length === 2) throw new ApiError('Sem resposta', 0);
    return {answer: 'Ok', conversation_id: 'same'};
  });
  await client.send('Agenda amanhã', 'n1');
  await assert.rejects(client.send('Troca para 15h', 'n2'));
  assert.equal(inputs.length, 2);
  await client.send('Qual minha agenda?', 'n3');
  assert.equal(inputs[2].conversation_id, 'same');
});

test('month navigation keeps selected details within the displayed month, including year boundaries', () => {
  assert.deepEqual(moveMonthSelection('2026-12', 1), {month: '2027-01', day: '2027-01-01'});
  assert.deepEqual(moveMonthSelection('2027-01', -1), {month: '2026-12', day: '2026-12-01'});
  assert.deepEqual(moveMonthSelection('2028-01', 1), {month: '2028-02', day: '2028-02-01'});
});

test('snapshot deduplicates reads in the same epoch and refreshes on the next foreground epoch', async () => {
  const reading = deferred<{balance: number}>();
  let count = 0;
  const states: SnapshotState<{balance: number}>[] = [];
  const resource = createSnapshotResource(() => {count++; return count === 1 ? reading.promise : Promise.resolve({balance: 500});}, state => states.push(state));
  const first = resource.activate();
  assert.equal(resource.refresh(), first);
  assert.equal(resource.activate(), first);
  await tick();
  assert.equal(count, 1);
  reading.resolve({balance: 100});
  await first;
  resource.deactivate();
  await resource.activate();
  assert.equal(count, 2);
  assert.equal(states.at(-1)?.data?.balance, 500);
});

test('background/blur epoch prevents a late old response from overwriting fresh financial values', async () => {
  const old = deferred<number>(), fresh = deferred<number>();
  let count = 0, current: SnapshotState<number> = initialSnapshotState();
  const resource = createSnapshotResource(() => ++count === 1 ? old.promise : fresh.promise, state => {current = state;});
  const first = resource.activate(); await tick();
  resource.deactivate();
  const second = resource.activate(); await tick();
  fresh.resolve(500); await second;
  old.resolve(100); await first;
  assert.equal(current.data, 500);
  resource.deactivate(); await resource.refresh();
  assert.equal(count, 2, 'Inactive views do not poll');
});

test('snapshot failures expose status, clear stale values and recover through an explicit retry', async () => {
  let step = 0, current: SnapshotState<number> = initialSnapshotState();
  const resource = createSnapshotResource(async () => {
    step++;
    if (step === 2) throw new ApiError('Acesso pendente', 402);
    return step === 1 ? 150 : 250;
  }, state => {current = state;});
  await resource.activate(); assert.equal(current.data, 150);
  await resource.refresh();
  assert.deepEqual(current, {data: null, error: 'Acesso pendente', status: 402, loading: false});
  await resource.refresh();
  assert.equal(current.data, 250); assert.equal(current.error, ''); assert.equal(current.status, null);
});
