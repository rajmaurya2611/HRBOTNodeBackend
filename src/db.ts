// src/db.ts
import sqlite3 from 'sqlite3';
import { log, error } from './logger';

// Use verbose mode for stack traces
sqlite3.verbose();

// Open (or create) the hr_bot.sqlite file
export const db = new sqlite3.Database('hr_bot.sqlite', (err) => {
  if (err) {
    error('Failed to connect to hr_bot.sqlite:', err.message);
  } else {
    log('Connected to SQLite database hr_bot.sqlite');
  }
});

// Create hr_home table if it doesn’t exist
const createTableSql = `
CREATE TABLE IF NOT EXISTS hr_home (
  UID TEXT PRIMARY KEY,
  Email TEXT NOT NULL,
  time DATETIME NOT NULL,
  JD BLOB,
  CV BLOB,
  status INTEGER NOT NULL CHECK (status IN (0,1)),
  Active INTEGER NOT NULL CHECK (Active IN (0,1))
)`;

db.run(createTableSql, (err) => {
  if (err) {
    error('Error creating hr_home table:', err.message);
  } else {
    log('Table hr_home is ready');
  }
});
