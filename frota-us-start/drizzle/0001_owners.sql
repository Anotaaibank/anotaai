CREATE TABLE owners (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT 'teal');
--> statement-breakpoint
ALTER TABLE vehicles ADD COLUMN owner_id TEXT REFERENCES owners(id);
--> statement-breakpoint
CREATE INDEX vehicles_owner ON vehicles(owner_id);
