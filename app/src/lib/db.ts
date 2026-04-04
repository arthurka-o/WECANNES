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

  CREATE TABLE IF NOT EXISTS civic_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    total INTEGER NOT NULL,
    remaining INTEGER NOT NULL,
    file_path TEXT
  );

  CREATE TABLE IF NOT EXISTS reward_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nullifier TEXT NOT NULL,
    reward_id INTEGER NOT NULL,
    campaign_id INTEGER NOT NULL,
    claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(nullifier, campaign_id)
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

// --- Civic rewards ---

export interface CivicReward {
  id: number;
  name: string;
  total: number;
  remaining: number;
  file_path: string | null;
}

export function getRewards(): CivicReward[] {
  return db.prepare('SELECT * FROM civic_rewards').all() as CivicReward[];
}

export function claimReward(
  nullifier: string,
  rewardId: number,
  campaignId: number
): { success: boolean; error?: string } {
  // Check if already claimed for this campaign
  const existing = db.prepare(
    'SELECT 1 FROM reward_claims WHERE nullifier = ? AND campaign_id = ?'
  ).get(nullifier, campaignId);
  if (existing) return { success: false, error: 'Already claimed for this campaign' };

  // Check reward has stock
  const reward = db.prepare(
    'SELECT remaining FROM civic_rewards WHERE id = ?'
  ).get(rewardId) as { remaining: number } | undefined;
  if (!reward || reward.remaining <= 0) return { success: false, error: 'Reward unavailable' };

  // Decrement and record
  db.prepare('UPDATE civic_rewards SET remaining = remaining - 1 WHERE id = ? AND remaining > 0').run(rewardId);
  db.prepare(
    'INSERT INTO reward_claims (nullifier, reward_id, campaign_id) VALUES (?, ?, ?)'
  ).run(nullifier, rewardId, campaignId);

  return { success: true };
}

export function getClaimedCampaigns(nullifier: string): number[] {
  const rows = db.prepare(
    'SELECT campaign_id FROM reward_claims WHERE nullifier = ?'
  ).all(nullifier) as { campaign_id: number }[];
  return rows.map((r) => r.campaign_id);
}

export function getClaimForCampaign(nullifier: string, campaignId: number): CivicReward | null {
  const row = db.prepare(`
    SELECT r.* FROM civic_rewards r
    JOIN reward_claims c ON c.reward_id = r.id
    WHERE c.nullifier = ? AND c.campaign_id = ?
  `).get(nullifier, campaignId) as CivicReward | undefined;
  return row ?? null;
}

// --- Seed rewards (call once) ---

export function seedRewardsIfEmpty(): void {
  const count = db.prepare('SELECT COUNT(*) as c FROM civic_rewards').get() as { c: number };
  if (count.c === 0) {
    const insert = db.prepare('INSERT INTO civic_rewards (name, total, remaining, file_path) VALUES (?, ?, ?, ?)');
    insert.run('Museum Pass', 100, 100, null);
    insert.run('Pool Access', 50, 50, null);
    insert.run('Theater Ticket', 30, 30, null);
    insert.run('Transit Pass', 80, 80, null);
  }
}

seedRewardsIfEmpty();
