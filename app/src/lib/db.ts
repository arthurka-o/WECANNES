import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS checkin_tokens (
    campaign_id INTEGER PRIMARY KEY,
    token TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS checkins (
    campaign_id INTEGER NOT NULL,
    nullifier TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (campaign_id, nullifier)
  );

  CREATE TABLE IF NOT EXISTS user_nullifiers (
    wallet_address TEXT PRIMARY KEY,
    nullifier TEXT NOT NULL
  );
`);

// --- Check-in tokens ---

export function setCheckinToken(campaignId: number, token: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO checkin_tokens (campaign_id, token) VALUES (?, ?)'
  ).run(campaignId, token);
}

export function validateCheckinToken(campaignId: number, token: string): boolean {
  const row = db.prepare(
    'SELECT token FROM checkin_tokens WHERE campaign_id = ?'
  ).get(campaignId) as { token: string } | undefined;
  return row?.token === token;
}

// --- Nullifier tracking ---

export function hasCheckedIn(campaignId: number, nullifier: string): boolean {
  const row = db.prepare(
    'SELECT 1 FROM checkins WHERE campaign_id = ? AND nullifier = ?'
  ).get(campaignId, nullifier);
  return !!row;
}

export function recordCheckIn(campaignId: number, nullifier: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO checkins (campaign_id, nullifier) VALUES (?, ?)'
  ).run(campaignId, nullifier);
}

export function getCheckInCount(campaignId: number): number {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM checkins WHERE campaign_id = ?'
  ).get(campaignId) as { count: number };
  return row.count;
}

export function getCheckedInCampaigns(nullifier: string): number[] {
  const rows = db.prepare(
    'SELECT campaign_id FROM checkins WHERE nullifier = ?'
  ).all(nullifier) as { campaign_id: number }[];
  return rows.map((r) => r.campaign_id);
}

export function setUserNullifier(walletAddress: string, nullifier: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO user_nullifiers (wallet_address, nullifier) VALUES (?, ?)'
  ).run(walletAddress, nullifier);
}

export function getNullifierByWallet(walletAddress: string): string | null {
  const row = db.prepare(
    'SELECT nullifier FROM user_nullifiers WHERE wallet_address = ?'
  ).get(walletAddress) as { nullifier: string } | undefined;
  return row?.nullifier ?? null;
}
