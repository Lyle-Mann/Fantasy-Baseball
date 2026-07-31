const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mlb_game_pk INTEGER,
  away_team_id INTEGER,
  away_team_name TEXT,
  home_team_id INTEGER,
  home_team_name TEXT,
  game_date TEXT,
  status TEXT NOT NULL DEFAULT 'selecting', -- selecting | drafting | live | final | ended
  draft_order_json TEXT,      -- JSON array of human_player ids, snake-expanded pick sequence
  current_pick_index INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS human_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS roster_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  human_player_id INTEGER NOT NULL REFERENCES human_players(id),
  mlb_player_id INTEGER NOT NULL,
  mlb_player_name TEXT NOT NULL,
  mlb_team_id INTEGER NOT NULL,
  pick_number INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS score_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  mlb_player_id INTEGER NOT NULL,
  mlb_player_name TEXT,
  category TEXT NOT NULL,
  points INTEGER NOT NULL,
  description TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'auto', -- auto | manual
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_score_events_session ON score_events(session_id);
CREATE INDEX IF NOT EXISTS idx_roster_picks_session ON roster_picks(session_id);
CREATE INDEX IF NOT EXISTS idx_human_players_session ON human_players(session_id);
`);

// Lightweight migration for columns added after the first release, so an
// existing deployed database (with real rows already in it) picks them up
// without needing a full reset.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('sessions', 'draft_mode', "draft_mode TEXT NOT NULL DEFAULT 'both'"); // both | single
ensureColumn('sessions', 'fan_team_id', 'fan_team_id INTEGER');

module.exports = db;
