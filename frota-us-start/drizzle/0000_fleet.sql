CREATE TABLE vehicles (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, plate TEXT NOT NULL UNIQUE, year TEXT NOT NULL DEFAULT '', purchase INTEGER NOT NULL, purchased_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Disponível', notes TEXT NOT NULL DEFAULT '');
--> statement-breakpoint
CREATE TABLE entries (id TEXT PRIMARY KEY NOT NULL, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), kind TEXT NOT NULL, category TEXT NOT NULL, amount INTEGER NOT NULL, date TEXT NOT NULL, description TEXT NOT NULL DEFAULT '');
--> statement-breakpoint
CREATE INDEX entries_vehicle ON entries(vehicle_id);
--> statement-breakpoint
CREATE TABLE settings (id INTEGER PRIMARY KEY NOT NULL, company TEXT NOT NULL);
