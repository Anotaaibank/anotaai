import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, realpathSync, lstatSync, rmSync, existsSync} from 'node:fs';
import {resolve, join, basename, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {parseArguments, freshEnvironment, createRun, loadManifest, safeSqlPath, fixtureTransaction, assertMarker, assertContainerLabels, dockerStartArguments} from './postgres-test-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const queryOptions = ['--no-psqlrc', '--no-password', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--username=postgres'];
const markerSql = "select current_setting('anotei.test_run',true);";
function execute(command, args, {input, env = freshEnvironment(), timeout = 60000, capture = true} = {}) {
  const result = spawnSync(command, args, {input, env, stdio: capture ? 'pipe' : 'ignore', encoding: 'utf8', windowsHide: true, shell: false, timeout, maxBuffer: 8 * 1024 * 1024});
  if (result.error) throw Error('Falha ao executar ' + basename(command) + ': ' + result.error.code);
  if (result.status !== 0) throw Error(basename(command) + ' falhou: ' + String(result.stderr || result.stdout).slice(-5000));
  return result.stdout ?? '';
}
function databaseName(name, run) {if (name !== 'postgres' && name !== run.database) throw Error('Banco fora do teste.'); return name;}
async function dockerBackend(run, manifest) {
  let created = false;
  const labels = () => JSON.parse(execute('docker', ['inspect', '--format', '{{json .Config.Labels}}', run.name]));
  return {
    async start() {
      execute('docker', ['version', '--format', '{{.Server.Version}}']);
      execute('docker', ['run', '--help']);
      // Inspect/clean our nonce-labelled name even if Docker times out after
      // creating it. An unrelated existing name is never removed.
      created = true;
      execute('docker', dockerStartArguments(run, manifest.docker_image), {timeout: 180000});
      assertContainerLabels(labels(), run);
      for (let n = 0; n < 60; n++) {
        try {execute('docker', ['exec', run.name, 'pg_isready', '--username=postgres']); return;} catch {await delay(500);}
      }
      throw Error('Postgres descartável não ficou pronto.');
    },
    query(sql, database = run.database) {
      if (!created) throw Error('Container não iniciado.');
      assertContainerLabels(labels(), run);
      return execute('docker', ['exec', '-i', run.name, 'psql', ...queryOptions, '--dbname=' + databaseName(database, run)], {input: sql});
    },
    async stop() {
      if (!created) return;
      const own = execute('docker', ['ps', '--all', '--quiet', '--filter', 'name=^/' + run.name + '$']);
      if (own.trim()) {assertContainerLabels(labels(), run); execute('docker', ['rm', '--force', run.name]);}
      created = false;
    },
    metadata: {engine: 'docker', image: manifest.docker_image, networking: 'none', published_ports: false}
  };
}
function unusedPort() {return new Promise((ok, fail) => {const server = createServer(); server.once('error', fail); server.listen(0, '127.0.0.1', () => {const port = server.address().port; server.close(error => error ? fail(error) : ok(port));});});}
async function portableBackend(bin, run, manifest) {
  const directory = realpathSync(bin), executable = name => join(directory, name + (process.platform === 'win32' ? '.exe' : ''));
  for (const name of ['initdb', 'pg_ctl', 'psql']) {
    const version = execute(executable(name), ['--version']);
    if (!new RegExp('PostgreSQL\\)? ' + manifest.postgres_major + '\\.').test(version)) throw Error('Versão incompatível de ' + name);
  }
  const parent = realpathSync(tmpdir()), temporary = mkdtempSync(join(parent, 'anotei-pg-' + run.id + '-')), data = join(temporary, 'cluster');
  const passwordFile = join(temporary, 'password.txt'), password = randomBytes(32).toString('hex');
  writeFileSync(join(temporary, 'owner.json'), JSON.stringify({id: run.id}), {flag: 'wx'});
  writeFileSync(passwordFile, password, {mode: 0o600, flag: 'wx'});
  const port = await unusedPort(), env = {...freshEnvironment(), PGPASSWORD: password, PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8'};
  let started = false;
  return {
    async start() {
      execute(executable('initdb'), ['--pgdata', data, '--username=postgres', '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', '--pwfile', passwordFile], {env});
      // No service installation, inherited PG settings or wildcard listener.
      // Do not let the long-lived Windows server inherit Node's capture pipes.
      // The server writes to its own private log, rather than a parent pipe.
      try {execute(executable('pg_ctl'), ['--pgdata', data, '--log', join(temporary, 'server.log'), '--wait', '--timeout=30', '--options', '-h 127.0.0.1 -p ' + port + ' -c anotei.test_run=' + run.marker, 'start'], {env, capture: false});}
      catch (error) {const log = join(temporary, 'server.log'); throw Error(error.message + (existsSync(log) ? '\n' + readFileSync(log, 'utf8').slice(-4000) : ''));}
      started = true;
    },
    query(sql, database = run.database) {
      if (!started) throw Error('Cluster não iniciado.');
      return execute(executable('psql'), [...queryOptions, '--host=127.0.0.1', '--port=' + port, '--dbname=' + databaseName(database, run)], {input: sql, env});
    },
    async stop() {
      // Recursive removal is restricted to the exact fresh directory owned by
      // this invocation, after shutdown. Never remove a supplied data directory.
      if (lstatSync(temporary).isSymbolicLink() || dirname(realpathSync(temporary)) !== parent || !basename(temporary).startsWith('anotei-pg-' + run.id + '-') || JSON.parse(readFileSync(join(temporary, 'owner.json'), 'utf8')).id !== run.id) throw Error('Limpeza recusada: pasta não pertence ao teste.');
      // pg_ctl can start Postgres and still time out. Never remove a live data
      // directory merely because the start call did not return successfully.
      if (started || existsSync(join(data, 'postmaster.pid'))) {execute(executable('pg_ctl'), ['--pgdata', data, '--wait', '--timeout=30', '--mode=immediate', 'stop'], {env, capture: false}); started = false;}
      if (existsSync(join(data, 'postmaster.pid'))) throw Error('Cluster ainda ativo: diretório preservado.');
      rmSync(temporary, {recursive: true, force: false});
    },
    metadata: {engine: 'portable', postgres_major: manifest.postgres_major, host: '127.0.0.1', port, fresh_cluster: true}
  };
}
async function renderFixture(file, sql) {
  if (!sql.includes('__PLAN__')) return sql;
  if (file !== 'tests/sql/whatsapp-calendar-persistence.sql') throw Error('Renderer não definido: ' + file);
  const {buildFinancePlan} = await import('../lib/finance.ts');
  const user = randomUUID(), empty = {documents: [], expenses: []}, today = '2026-10-15';
  const monthly = buildFinancePlan({action: 'expense_schedule', description: 'Carro QA sintético', amount_cents: 150000, category: 'Transporte', date: '2026-11-05', schedule_type: 'MENSAL', amount_mode: 'PARCELA', recurring: true, due_day: 5}, empty, user, randomUUID(), today);
  const appointment = buildFinancePlan({action: 'appointment_upsert', description: 'Filme QA sintético', date: '2026-11-07', time: '19:00'}, empty, user, randomUUID(), today);
  const plan = {...monthly, documents: [...monthly.documents, ...appointment.documents]};
  const replacements = {__USER__: user, __OTHER__: randomUUID(), __MESSAGE__: randomUUID(), __LEASE__: randomUUID(), __PLAN__: JSON.stringify(plan).replaceAll("'", "''")};
  return sql.replace(/__[A-Z_]+__/g, name => {if (!(name in replacements)) throw Error('Placeholder desconhecido.'); return replacements[name];});
}
export async function runChecks(backend, run, bootstrap, fixtures) {
  try {
    await backend.start();
    assertMarker(await backend.query(markerSql, 'postgres'), run);
    await backend.query('CREATE DATABASE ' + run.database + ';', 'postgres');
    await backend.query('BEGIN;\n' + bootstrap + '\nCOMMIT;');
    const checks = [];
    for (const {file, sql} of fixtures) {
      await backend.query(fixtureTransaction(sql));
      const leftover = await backend.query('select count(*) from auth.users;');
      if (leftover.trim() !== '0') throw Error('Fixture deixou resíduos: ' + file);
      checks.push({file, passed: true, rolled_back: true});
    }
    return checks;
  } finally {await backend.stop();}
}
async function main() {
  const options = parseArguments(process.argv.slice(2)), manifest = loadManifest(root), run = createRun();
  if (options.mode === 'plan') {console.log(JSON.stringify({executed: false, purpose: manifest.purpose, order: [manifest.auth_bootstrap, ...manifest.base, ...manifest.migrations], fixtures: manifest.fixtures, docker_image: manifest.docker_image, accepts_external_dsn: false}, null, 2)); return;}
  const bootstrap = [manifest.auth_bootstrap, ...manifest.base, ...manifest.migrations].map(file => readFileSync(safeSqlPath(root, file), 'utf8')).join('\n');
  const fixtures = await Promise.all(manifest.fixtures.map(async file => ({file, sql: await renderFixture(file, readFileSync(safeSqlPath(root, file), 'utf8'))})));
  // Validate every fixture BEFORE starting any server.
  fixtures.forEach(fixture => fixtureTransaction(fixture.sql));
  const backend = options.mode === 'portable' ? await portableBackend(options.bin, run, manifest) : await dockerBackend(run, manifest);
  const start = Date.now(), evidence = {at: new Date().toISOString(), ...backend.metadata, bootstrap_sha256: createHash('sha256').update(bootstrap).digest('hex'), production_access: false, supabase_auth_service_tested: false, checks: []};
  try {evidence.checks = await runChecks(backend, run, bootstrap, fixtures); evidence.passed = true; console.log('Postgres descartável: ' + evidence.checks.length + ' fixtures passaram, com rollback.');}
  catch (error) {evidence.passed = false; evidence.error = error.message; throw error;}
  finally {evidence.duration_ms = Date.now() - start; mkdirSync(resolve(root, '.data'), {recursive: true}); writeFileSync(resolve(root, '.data/postgres-test-results.json'), JSON.stringify(evidence, null, 2) + '\n');}
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {console.error(error.message); process.exitCode = 1;});
