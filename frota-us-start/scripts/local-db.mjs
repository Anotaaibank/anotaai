import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function createDb(filename=':memory:',bundled={}){
 const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
 const table=sqlite.prepare("SELECT name FROM sqlite_master WHERE name='vehicles'").get();
 const tracked=sqlite.prepare("SELECT name FROM sqlite_master WHERE name='fleet_migrations'").get();
 const journal=bundled.journal||JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
 const applied=new Set(tracked?sqlite.prepare('SELECT tag FROM fleet_migrations').all().map(r=>r.tag):table?['0000_fleet']:[]);
 const pending=journal.entries.filter(e=>!applied.has(e.tag));
 // Preserve an on-disk snapshot before upgrading an existing local database.
 if(table&&pending.length&&filename!==':memory:')sqlite.prepare('VACUUM INTO ?').run(filename+'.before-upgrade-'+Date.now()+'.bak');
 sqlite.exec('BEGIN');
 try{
  sqlite.exec('CREATE TABLE IF NOT EXISTS fleet_migrations (tag TEXT PRIMARY KEY NOT NULL)');
  if(table&&!tracked)sqlite.prepare('INSERT INTO fleet_migrations(tag) VALUES(?)').run('0000_fleet');
  for(const migration of pending){sqlite.exec(bundled.migrations?.[migration.tag]||readFileSync(new URL('../drizzle/'+migration.tag+'.sql',import.meta.url),'utf8'));sqlite.prepare('INSERT INTO fleet_migrations(tag) VALUES(?)').run(migration.tag);}
  sqlite.exec('COMMIT');
 }catch(error){sqlite.exec('ROLLBACK');sqlite.close();throw error;}
 return {sqlite,prepare(sql){const statement=sqlite.prepare(sql);let args=[];return{bind(...values){args=values;return this;},first(){return statement.get(...args)||null;},run(){return statement.run(...args);},all(){return{results:statement.all(...args)};}};},batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(s.all());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
