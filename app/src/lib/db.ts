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

  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    ngo TEXT NOT NULL,
    sponsor TEXT,
    funding_required INTEGER NOT NULL,
    min_volunteers INTEGER NOT NULL,
    max_volunteers INTEGER NOT NULL,
    event_date TEXT NOT NULL,
    sponsorship_deadline TEXT NOT NULL,
    event_deadline TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'Open',
    location TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS campaign_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    file_path TEXT NOT NULL
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

// --- Goals ---

export interface Goal {
  id: number;
  title: string;
  category: string;
  description: string;
  active: number;
}

export function getGoals(): Goal[] {
  return db.prepare('SELECT * FROM goals WHERE active = 1').all() as Goal[];
}

export function getGoal(id: number): Goal | null {
  return (db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as Goal) ?? null;
}

// --- Campaigns ---

export interface Campaign {
  id: number;
  goal_id: number;
  title: string;
  description: string;
  ngo: string;
  sponsor: string | null;
  funding_required: number;
  min_volunteers: number;
  max_volunteers: number;
  event_date: string;
  sponsorship_deadline: string;
  event_deadline: string;
  created_at: string;
  status: string;
  location: string;
  volunteer_count: number;
}

export function getCampaigns(): Campaign[] {
  const rows = db.prepare(`
    SELECT c.*, COALESCE(ch.cnt, 0) as volunteer_count
    FROM campaigns c
    LEFT JOIN (SELECT campaign_id, COUNT(*) as cnt FROM checkins GROUP BY campaign_id) ch
      ON ch.campaign_id = c.id
  `).all() as Campaign[];
  return rows;
}

export function getCampaign(id: number): Campaign | null {
  const row = db.prepare(`
    SELECT c.*, COALESCE(ch.cnt, 0) as volunteer_count
    FROM campaigns c
    LEFT JOIN (SELECT campaign_id, COUNT(*) as cnt FROM checkins GROUP BY campaign_id) ch
      ON ch.campaign_id = c.id
    WHERE c.id = ?
  `).get(id) as Campaign | undefined;
  return row ?? null;
}

export function getCampaignsByStatus(status: string): Campaign[] {
  const rows = db.prepare(`
    SELECT c.*, COALESCE(ch.cnt, 0) as volunteer_count
    FROM campaigns c
    LEFT JOIN (SELECT campaign_id, COUNT(*) as cnt FROM checkins GROUP BY campaign_id) ch
      ON ch.campaign_id = c.id
    WHERE c.status = ?
  `).all(status) as Campaign[];
  return rows;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

export function createCampaign(data: {
  goal_id: number;
  title: string;
  description: string;
  ngo: string;
  funding_required: number;
  min_volunteers: number;
  max_volunteers: number;
  event_date: string;
  location: string;
}): number {
  const now = new Date().toISOString().split('T')[0];
  const sponsorshipDeadline = addMonths(now, 1);
  const eventDeadline = addMonths(data.event_date, 1);

  const result = db.prepare(`
    INSERT INTO campaigns (goal_id, title, description, ngo, funding_required, min_volunteers, max_volunteers, event_date, sponsorship_deadline, event_deadline, location, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')
  `).run(data.goal_id, data.title, data.description, data.ngo, data.funding_required, data.min_volunteers, data.max_volunteers, data.event_date, sponsorshipDeadline, eventDeadline, data.location);
  return Number(result.lastInsertRowid);
}

export function getCampaignPhotos(campaignId: number): string[] {
  const rows = db.prepare('SELECT file_path FROM campaign_photos WHERE campaign_id = ?').all(campaignId) as { file_path: string }[];
  return rows.map((r) => r.file_path);
}

// --- Seed ---

function seed(): void {
  const goalCount = db.prepare('SELECT COUNT(*) as c FROM goals').get() as { c: number };
  if (goalCount.c > 0) return;

  const insertGoal = db.prepare('INSERT INTO goals (title, category, description) VALUES (?, ?, ?)');
  insertGoal.run('Beach Cleanup — Summer 2026', 'Environment', 'Clean up beaches before tourist season');
  insertGoal.run('Youth Literacy Program', 'Education', 'Improve reading skills for children aged 6-12');
  insertGoal.run('Homeless Shelter Support', 'Social', 'Provide meals and supplies to local shelters');

  const insertCampaign = db.prepare(`
    INSERT INTO campaigns (goal_id, title, description, ngo, sponsor, funding_required, min_volunteers, max_volunteers, event_date, sponsorship_deadline, event_deadline, status, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  //                                                                                                                                          event_date   sponsor_dl   event_dl
  insertCampaign.run(1, 'Plage du Midi Cleanup',           '2km beach cleanup before summer season. Equipment provided.',       'OceanCare',        null, 500, 20, 40, '2026-06-15', '2026-05-15', '2026-07-15', 'Open',          'Plage du Midi, Cannes');
  insertCampaign.run(1, 'Port Canto Shore Cleanup',        'Cleanup around the marina area. Gloves and bags provided.',         'OceanCare',        "Pierre's Restaurant", 350, 15, 30, '2026-06-20', '2026-05-20', '2026-07-20', 'Active',        'Port Canto, Cannes');
  insertCampaign.run(2, 'Weekend Reading Buddies',         'Pair volunteers with kids for Saturday morning reading sessions.',  'LireEnsemble',     'Librairie Cannes',    200,  8, 15, '2026-03-15', '2026-02-15', '2026-04-15', 'Completed',     'Bibliothèque Municipale, Cannes');
  insertCampaign.run(3, 'Summer Meal Prep',                'Prepare and distribute meals to three local shelters.',             'SolidaritéCannes', null, 800, 10, 25, '2026-08-01', '2026-07-01', '2026-09-01', 'Open',          'Centre Social, Cannes');
  insertCampaign.run(1, 'La Croisette Shoreline Cleanup',  'Clear debris along La Croisette promenade shoreline.',             'OceanCare',        'Hôtel Martinez',      600, 20, 35, '2026-05-10', '2026-04-10', '2026-06-10', 'PendingReview', 'La Croisette, Cannes');
  insertCampaign.run(1, 'Îles de Lérins Beach Restoration','Restore beach areas on Sainte-Marguerite island.',                 'OceanCare',        'Club Nautique',       450, 15, 25, '2026-03-20', '2026-02-20', '2026-04-20', 'Completed',     'Île Sainte-Marguerite, Cannes');
  insertCampaign.run(1, 'Spring Coast Sweep',              'Early spring cleanup of the eastern coast.',                        'OceanCare',        'Café del Mar',        250, 10, 20, '2026-02-15', '2026-01-15', '2026-03-15', 'Expired',       'Plage du Mouré Rouge, Cannes');
  insertCampaign.run(2, 'After-School Tutoring',           'Weekly tutoring sessions for middle school students.',              'LireEnsemble',     'Fnac Cannes',         300, 12, 20, '2026-03-01', '2026-02-01', '2026-04-01', 'Expired',       'Collège Les Mûriers, Cannes');

  const insertReward = db.prepare('INSERT INTO civic_rewards (name, total, remaining, file_path) VALUES (?, ?, ?, ?)');
  insertReward.run('Museum Pass', 100, 100, null);
  insertReward.run('Pool Access', 50, 50, null);
  insertReward.run('Theater Ticket', 30, 30, null);
  insertReward.run('Transit Pass', 80, 80, null);

  // Demo: fake volunteer checked into completed campaign (id=3) and active campaign (id=2)
  const demoNullifier = '0x2bfe4b2f1b17853598ecd565629c0fbed11d1acd6bff1d726ce8b4fad99763a3';
  const demoWallet = '0x239572713847b7341ce40d4665ab36e601137d43';
  db.prepare('INSERT INTO user_nullifiers (wallet_address, nullifier) VALUES (?, ?)').run(demoWallet, demoNullifier);
  db.prepare('INSERT INTO checkins (campaign_id, nullifier) VALUES (?, ?)').run(2, demoNullifier);
  db.prepare('INSERT INTO checkins (campaign_id, nullifier) VALUES (?, ?)').run(3, demoNullifier);
  db.prepare('INSERT INTO checkins (campaign_id, nullifier) VALUES (?, ?)').run(5, demoNullifier);
  // Fake other volunteers for PendingReview campaign
  for (let i = 0; i < 22; i++) {
    db.prepare('INSERT INTO checkins (campaign_id, nullifier) VALUES (?, ?)').run(5, `fake-volunteer-${i}`);
  }
}

seed();
