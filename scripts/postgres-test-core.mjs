import {readFileSync, readdirSync, realpathSync, lstatSync} from 'node:fs';
import {resolve, relative, isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';

export const manifestFile = 'scripts/postgres/bootstrap-manifest.json';
export function parseArguments(args) {
  let mode = 'docker', bin;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plan') mode = 'plan';
    else if (args[i] === '--docker') mode = 'docker';
    else if (args[i] === '--postgres-bin' && args[i + 1] && !args[i + 1].startsWith('--')) {mode = 'portable'; bin = args[++i];}
    else throw Error('Argumento não permitido. Use --plan, --docker ou --postgres-bin <diretório>. DSN/URL externos não são aceitos.');
  }
  if (args.filter(x => ['--plan', '--docker', '--postgres-bin'].includes(x)).length > 1) throw Error('Escolha exatamente um modo.');
  return {mode, bin};
}
export function freshEnvironment(source = process.env) {
  const env = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'PATHEXT']) if (source[name]) env[name] = source[name];
  return env; // No .env, PG*, database URLs, provider keys or production secrets.
}
export function createRun(id = randomUUID()) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw Error('Identificador de teste inválido.');
  return {id, name: 'anotei-qa-' + id, database: 'anotei_test_' + id.replaceAll('-', ''), marker: 'anotei-disposable:' + id};
}
export function safeSqlPath(root, file) {
  if (typeof file !== 'string' || !/^(?:database|supabase\/migrations|tests\/sql|scripts\/postgres)\/[A-Za-z0-9_./-]+\.sql$/.test(file) || file.split('/').includes('..')) throw Error('Caminho SQL não permitido.');
  const base = realpathSync(root), full = resolve(base, file), real = realpathSync(full), part = relative(base, real);
  if (!part || part.startsWith('..') || isAbsolute(part) || lstatSync(full).isSymbolicLink()) throw Error('SQL deve pertencer ao checkout isolado.');
  return real;
}
export function loadManifest(root) {
  const manifest = JSON.parse(readFileSync(resolve(root, manifestFile), 'utf8'));
  if (manifest.version !== 1 || manifest.purpose !== 'disposable-anotei-sql-tests-only' || manifest.postgres_major !== 17 || !/^postgres:17\.\d+-bookworm(?:@sha256:[a-f0-9]{64})?$/.test(manifest.docker_image)) throw Error('Manifesto de bootstrap inválido.');
  for (const group of ['base', 'migrations', 'fixtures']) if (!Array.isArray(manifest[group]) || !manifest[group].length || new Set(manifest[group]).size !== manifest[group].length) throw Error('Lista incompleta ou duplicada: ' + group);
  const expected = (folder, items) => {
    const actual = readdirSync(resolve(root, folder)).filter(x => x.endsWith('.sql')).map(x => folder + '/' + x).sort();
    if (JSON.stringify(actual) !== JSON.stringify([...items].sort())) throw Error('Arquivos SQL fora do manifesto: ' + folder + '. Atualize a ordem após revisão.');
  };
  expected('database', manifest.base);
  expected('supabase/migrations', manifest.migrations);
  expected('tests/sql', manifest.fixtures);
  for (const file of [manifest.auth_bootstrap, ...manifest.base, ...manifest.migrations, ...manifest.fixtures]) safeSqlPath(root, file);
  return manifest;
}

// Split only top-level statements; ignore quoted strings, nested comments and
// dollar-quoted PL/pgSQL bodies. Never rewrite BEGIN inside a function.
export function sqlStatements(sql) {
  const result = []; let start = 0, flat = '', i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {const end = sql.indexOf('\n', i + 2); i = end < 0 ? sql.length : end + 1; flat += ' '; continue;}
    if (sql.startsWith('/*', i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {if (sql.startsWith('/*', i)) {depth++; i += 2;} else if (sql.startsWith('*/', i)) {depth--; i += 2;} else i++;}
      if (depth) throw Error('Comentário SQL não terminado.'); flat += ' '; continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++]; let closed = false;
      while (i < sql.length) {if (sql[i] === quote) {if (sql[i + 1] === quote) {i += 2; continue;} i++; closed = true; break;} if (sql[i] === '\\') i += 2; else i++;}
      if (!closed) throw Error('Texto SQL não terminado.'); flat += ' quoted '; continue;
    }
    const dollar = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (dollar) {const end = sql.indexOf(dollar, i + dollar.length); if (end < 0) throw Error('Bloco SQL não terminado.'); i = end + dollar.length; flat += ' quoted '; continue;}
    if (sql[i] === '\\') throw Error('Meta-comandos psql não são permitidos nos fixtures.');
    if (sql[i] === ';') {result.push({sql: sql.slice(start, i + 1), flat: flat.trim()}); start = ++i; flat = ''; continue;}
    flat += sql[i++];
  }
  if (flat.trim()) throw Error('Toda instrução SQL deve terminar com ponto e vírgula.');
  return result;
}
export function fixtureTransaction(sql) {
  if (/__[A-Z_]+__/.test(sql)) throw Error('Placeholder SQL não resolvido.');
  const parts = sqlStatements(sql).filter(part => {
    if (/^(?:begin(?:\s+(?:work|transaction))?|rollback(?:\s+(?:work|transaction))?)$/i.test(part.flat)) return false;
    if (/^(?:commit|end|abort|start\s+transaction|rollback)\b/i.test(part.flat)) throw Error('Fixture não pode confirmar ou controlar a transação.');
    if (/^(?:create|drop)\s+database\b|^alter\s+system\b/i.test(part.flat)) throw Error('Fixture não pode alterar o servidor/alvo.');
    return !!part.flat;
  });
  return 'BEGIN;\nSET LOCAL statement_timeout=\'30s\';\nSET LOCAL lock_timeout=\'5s\';\n' + parts.map(p => p.sql).join('\n') + '\nROLLBACK;\n';
}
export function assertMarker(actual, run) {
  if (actual.trim() !== run.marker) throw Error('Servidor não pertence a este teste. Nenhum bootstrap foi aplicado.');
}
export function assertContainerLabels(labels, run) {
  if (labels?.['anotei.test.run'] !== run.id || labels?.['anotei.test.purpose'] !== 'disposable-sql') throw Error('Container não pertence a este teste.');
}
export function dockerStartArguments(run, image) {
  if (!/^postgres:17\.\d+-bookworm(?:@sha256:[a-f0-9]{64})?$/.test(image)) throw Error('Imagem Postgres não permitida.');
  return ['run', '--detach', '--rm', '--name', run.name, '--label', 'anotei.test.run=' + run.id, '--label', 'anotei.test.purpose=disposable-sql', '--network', 'none', '--tmpfs', '/var/lib/postgresql/data:rw', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image, 'postgres', '-c', 'anotei.test_run=' + run.marker];
}
