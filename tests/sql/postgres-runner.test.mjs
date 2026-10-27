import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {parseArguments, freshEnvironment, createRun, loadManifest, safeSqlPath, fixtureTransaction, assertMarker, assertContainerLabels, dockerStartArguments} from '../../scripts/postgres-test-core.mjs';
import {runChecks} from '../../scripts/test-postgres.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('runner não aceita DSN/URL, modos ambíguos ou alvos fornecidos pelo usuário', () => {
  assert.deepEqual(parseArguments([]), {mode: 'docker', bin: undefined});
  assert.equal(parseArguments(['--postgres-bin', 'local-tools']).mode, 'portable');
  for (const args of [['--url', 'postgres://prod'], ['--host', 'db.supabase.co'], ['--docker', '--plan'], ['--postgres-bin'], ['--database', 'real']]) assert.throws(() => parseArguments(args));
  assert.deepEqual(freshEnvironment({PGHOST: 'production', DATABASE_URL: 'private', SUPABASE_SERVICE_ROLE_KEY: 'private', OPENAI_API_KEY: 'private', PATH: 'tools'}), {PATH: 'tools'});
});
test('container nasce sem rede/portas/volumes externos e só pode ser removido após verificar dono', () => {
  const run = createRun(), args = dockerStartArguments(run, 'postgres:17.11-bookworm');
  assert.equal(args[args.indexOf('--network') + 1], 'none');
  assert.equal(args.includes('--publish'), false); assert.equal(args.includes('-v'), false); assert.equal(args.includes('--privileged'), false);
  assert.throws(() => createRun('../other')); assert.throws(() => dockerStartArguments(run, 'untrusted/image'));
  assert.throws(() => assertContainerLabels({'anotei.test.run': createRun().id}, run));
  assert.doesNotThrow(() => assertContainerLabels({'anotei.test.run': run.id, 'anotei.test.purpose': 'disposable-sql'}, run));
});
test('manifesto inclui toda a base e migrações; caminhos fora do checkout são recusados', () => {
  const manifest = loadManifest(root); assert.equal(manifest.base.length, 9); assert.ok(manifest.migrations.length >= 7);
  assert.equal(manifest.base.indexOf('database/household-billing.sql') < manifest.base.indexOf('database/household-routing-fix.sql'), true);
  for (const path of ['../production.sql', 'database/../private.sql', '/tmp/arbitrary.sql', 'database/.env.local']) assert.throws(() => safeSqlPath(root, path));
});
test('wrapper garante rollback sem alterar BEGIN do PL/pgSQL ou texto comentado/citado', () => {
  const sql = "begin; -- COMMIT não é comando\ndo $body$ begin perform 'ROLLBACK;'; end $body$;\nselect 'a;''b';\nrollback;";
  const wrapped = fixtureTransaction(sql); assert.match(wrapped, /^BEGIN;/); assert.match(wrapped, /ROLLBACK;\n$/); assert.ok(wrapped.includes("do $body$ begin perform 'ROLLBACK;'; end $body$;"));
  for (const bad of ['select 1; COMMIT;', '\\connect production\nselect 1;', 'CREATE DATABASE another;', "select '__USER__';", 'select 1']) assert.throws(() => fixtureTransaction(bad));
  const real = readFileSync(resolve(root, 'tests/sql/subscription-plans.sql'), 'utf8'); assert.match(fixtureTransaction(real), /ROLLBACK;\n$/);
});
test('marker divergente impede qualquer bootstrap e cleanup sempre é chamado', async () => {
  const run = createRun(), calls = []; let stopped = false;
  const backend = {start: async () => calls.push('start'), query: async sql => {calls.push(sql); return 'foreign-server';}, stop: async () => {stopped = true;}};
  await assert.rejects(() => runChecks(backend, run, 'create table never_run();', []), /não pertence/);
  assert.equal(stopped, true); assert.equal(calls.length, 2);
});
test('fixture falha ou deixa resíduo: não aprova Postgres e encerra backend', async () => {
  const run = createRun(); let stopped = false, n = 0;
  const backend = {start: async () => {}, query: async () => ++n === 1 ? run.marker : n === 5 ? '1' : '', stop: async () => {stopped = true;}};
  await assert.rejects(() => runChecks(backend, run, 'select 1;', [{file: 'synthetic.sql', sql: 'select 1;'}]), /resíduos/); assert.equal(stopped, true);
});

test('falha conserva stdout de casos, fixture responsável e aprovações anteriores sem aprovar a falha', async () => {
  const run = createRun(); let n = 0, stopped = false;
  const failure = Object.assign(Error('EXPECTED_ASSERTION'), {stdout: '20|7|13\nmissing status|f|t\n', stderr: 'FINANCE_VALIDATION_REGRESSION'});
  const backend = {start: async () => {}, query: async () => {
    n++; if (n === 1) return run.marker; if (n === 5) return '0'; if (n === 6) throw failure; return '';
  }, stop: async () => {stopped = true;}};
  await assert.rejects(() => runChecks(backend, run, 'select 1;', [
    {file: 'first.sql', sql: 'select 1;'}, {file: 'regression.sql', sql: 'select 2;'}
  ]), error => {
    assert.equal(error.fixture, 'regression.sql'); assert.equal(error.stdout, failure.stdout);
    assert.equal(error.stderr, failure.stderr);
    assert.deepEqual(error.completed_checks, [{file: 'first.sql', passed: true, rolled_back: true}]); return true;
  });
  assert.equal(stopped, true);
});
