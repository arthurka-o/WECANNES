import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    wallet_address TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    name TEXT,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS interests (
    campaign_id INTEGER NOT NULL,
    nullifier TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (campaign_id, nullifier)
  );

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
    ngo_contact TEXT,
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
    file_path TEXT NOT NULL,
    claimed_by TEXT,
    claimed_campaign_id INTEGER,
    claimed_at TEXT
  );
`);

// --- Users ---

export interface UserProfile {
  wallet_address: string;
  role: string;
  name: string | null;
  email: string | null;
}

export function getUserProfile(walletAddress: string): UserProfile | null {
  return (db.prepare('SELECT * FROM users WHERE wallet_address = ?').get(walletAddress) as UserProfile) ?? null;
}

export function getUserRole(walletAddress: string): string | null {
  const row = db.prepare('SELECT role FROM users WHERE wallet_address = ?').get(walletAddress) as { role: string } | undefined;
  return row?.role ?? null;
}

export function setUserRole(walletAddress: string, role: string, name?: string, email?: string): void {
  db.prepare(
    'INSERT INTO users (wallet_address, role, name, email) VALUES (?, ?, ?, ?) ON CONFLICT(wallet_address) DO UPDATE SET role = ?, name = ?, email = ?'
  ).run(walletAddress, role, name ?? null, email ?? null, role, name ?? null, email ?? null);
}

// --- Interests ---

export function hasExpressedInterest(campaignId: number, nullifier: string): boolean {
  const row = db.prepare('SELECT 1 FROM interests WHERE campaign_id = ? AND nullifier = ?').get(campaignId, nullifier);
  return !!row;
}

export function recordInterest(campaignId: number, nullifier: string): void {
  db.prepare('INSERT OR IGNORE INTO interests (campaign_id, nullifier) VALUES (?, ?)').run(campaignId, nullifier);
}

export function getInterestCount(campaignId: number): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM interests WHERE campaign_id = ?').get(campaignId) as { count: number };
  return row.count;
}

export function getInterestedCampaigns(nullifier: string): number[] {
  const rows = db.prepare('SELECT campaign_id FROM interests WHERE nullifier = ?').all(nullifier) as { campaign_id: number }[];
  return rows.map(r => r.campaign_id);
}

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

export interface RewardSummary {
  name: string;
  total: number;
  remaining: number;
}

export interface CivicReward {
  id: number;
  name: string;
  file_path: string;
  claimed_by: string | null;
  claimed_campaign_id: number | null;
  claimed_at: string | null;
}

export function getRewardSummaries(): RewardSummary[] {
  return db.prepare(`
    SELECT name, COUNT(*) as total, SUM(CASE WHEN claimed_by IS NULL THEN 1 ELSE 0 END) as remaining
    FROM civic_rewards GROUP BY name
  `).all() as RewardSummary[];
}

export function addRewards(name: string, filePaths: string[]): void {
  const insert = db.prepare('INSERT INTO civic_rewards (name, file_path) VALUES (?, ?)');
  for (const fp of filePaths) {
    insert.run(name, fp);
  }
}

export function claimReward(
  nullifier: string,
  rewardName: string,
  campaignId: number
): { success: boolean; error?: string; reward?: CivicReward } {
  // Check if already claimed for this campaign
  const existing = db.prepare(
    'SELECT 1 FROM civic_rewards WHERE claimed_by = ? AND claimed_campaign_id = ?'
  ).get(nullifier, campaignId);
  if (existing) return { success: false, error: 'Already claimed for this campaign' };

  // Find an unclaimed reward of this type
  const reward = db.prepare(
    'SELECT * FROM civic_rewards WHERE name = ? AND claimed_by IS NULL LIMIT 1'
  ).get(rewardName) as CivicReward | undefined;
  if (!reward) return { success: false, error: 'No rewards of this type available' };

  // Claim it
  db.prepare(
    'UPDATE civic_rewards SET claimed_by = ?, claimed_campaign_id = ?, claimed_at = datetime(\'now\') WHERE id = ?'
  ).run(nullifier, campaignId, reward.id);

  reward.claimed_by = nullifier;
  reward.claimed_campaign_id = campaignId;
  return { success: true, reward };
}

export function getClaimedCampaigns(nullifier: string): number[] {
  const rows = db.prepare(
    'SELECT DISTINCT claimed_campaign_id FROM civic_rewards WHERE claimed_by = ?'
  ).all(nullifier) as { claimed_campaign_id: number }[];
  return rows.map((r) => r.claimed_campaign_id);
}

export function getClaimedRewards(nullifier: string): CivicReward[] {
  return db.prepare(
    'SELECT * FROM civic_rewards WHERE claimed_by = ?'
  ).all(nullifier) as CivicReward[];
}

export function getClaimForCampaign(nullifier: string, campaignId: number): CivicReward | null {
  return (db.prepare(
    'SELECT * FROM civic_rewards WHERE claimed_by = ? AND claimed_campaign_id = ?'
  ).get(nullifier, campaignId) as CivicReward) ?? null;
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

export function createGoal(title: string, category: string, description: string): number {
  const result = db.prepare('INSERT INTO goals (title, category, description) VALUES (?, ?, ?)').run(title, category, description);
  return Number(result.lastInsertRowid);
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
  ngo_contact: string | null;
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
  interest_count: number;
}

export function getCampaigns(): Campaign[] {
  const rows = db.prepare(`
    SELECT c.*, COALESCE(ch.cnt, 0) as volunteer_count, COALESCE(i.cnt, 0) as interest_count
    FROM campaigns c
    LEFT JOIN (SELECT campaign_id, COUNT(*) as cnt FROM checkins GROUP BY campaign_id) ch
      ON ch.campaign_id = c.id
    LEFT JOIN (SELECT campaign_id, COUNT(*) as cnt FROM interests GROUP BY campaign_id) i
      ON i.campaign_id = c.id
  `).all() as Campaign[];
  return rows;
}

export function getCampaign(id: number): Campaign | null {
  const row = db.prepare(`
    SELECT c.*, COALESCE(ch.cnt, 0) as volunteer_count, COALESCE(i.cnt, 0) as interest_count
    FROM campaigns c
    LEFT JOIN (SELECT campaign_id, COUNT(*) as cnt FROM checkins GROUP BY campaign_id) ch
      ON ch.campaign_id = c.id
    LEFT JOIN (SELECT campaign_id, COUNT(*) as cnt FROM interests GROUP BY campaign_id) i
      ON i.campaign_id = c.id
    WHERE c.id = ?
  `).get(id) as Campaign | undefined;
  return row ?? null;
}

export function getCampaignsByStatus(status: string): Campaign[] {
  const rows = db.prepare(`
    SELECT c.*, COALESCE(ch.cnt, 0) as volunteer_count, COALESCE(i.cnt, 0) as interest_count
    FROM campaigns c
    LEFT JOIN (SELECT campaign_id, COUNT(*) as cnt FROM checkins GROUP BY campaign_id) ch
      ON ch.campaign_id = c.id
    LEFT JOIN (SELECT campaign_id, COUNT(*) as cnt FROM interests GROUP BY campaign_id) i
      ON i.campaign_id = c.id
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
  ngo_contact?: string;
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
    INSERT INTO campaigns (goal_id, title, description, ngo, ngo_contact, funding_required, min_volunteers, max_volunteers, event_date, sponsorship_deadline, event_deadline, location, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')
  `).run(data.goal_id, data.title, data.description, data.ngo, data.ngo_contact ?? null, data.funding_required, data.min_volunteers, data.max_volunteers, data.event_date, sponsorshipDeadline, eventDeadline, data.location);
  return Number(result.lastInsertRowid);
}

export function updateCampaignStatus(campaignId: number, status: string): void {
  db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(status, campaignId);
}

export function fundCampaign(campaignId: number, sponsor: string): void {
  db.prepare('UPDATE campaigns SET sponsor = ?, status = \'Active\' WHERE id = ?').run(sponsor, campaignId);
}

export function getCampaignPhotos(campaignId: number): string[] {
  const rows = db.prepare('SELECT file_path FROM campaign_photos WHERE campaign_id = ?').all(campaignId) as { file_path: string }[];
  return rows.map((r) => r.file_path);
}

export function addCampaignPhoto(campaignId: number, filePath: string): void {
  db.prepare('INSERT INTO campaign_photos (campaign_id, file_path) VALUES (?, ?)').run(campaignId, filePath);
}

// --- Seed ---

function seed(): void {
  const goalCount = db.prepare('SELECT COUNT(*) as c FROM goals').get() as { c: number };
  if (goalCount.c > 0) return;

  // --- Goals ---
  const insertGoal = db.prepare('INSERT INTO goals (title, category, description) VALUES (?, ?, ?)');
  insertGoal.run('Beach Cleanup — Summer 2026', 'Environment', 'Clean up beaches before tourist season');
  insertGoal.run('Youth Literacy Program', 'Education', 'Improve reading skills for children aged 6-12');
  insertGoal.run('Homeless Shelter Support', 'Social', 'Provide meals and supplies to local shelters');

  // --- Campaigns (single business: Pierre's Restaurant) ---
  const ins = db.prepare(`
    INSERT INTO campaigns (goal_id, title, description, ngo, ngo_contact, sponsor, funding_required, min_volunteers, max_volunteers, event_date, sponsorship_deadline, event_deadline, status, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 1: Open, future event — business can sponsor, volunteers sign up
  ins.run(1, 'Plage du Midi Cleanup',
    '2km beach cleanup before summer season. Equipment provided.',
    'OceanCare', 'contact@oceancare.org', null,
    500, 20, 40, '2026-06-15', '2026-05-15', '2026-07-15', 'Open', 'Plage du Midi, Cannes');

  // 2: Open, future event — another sponsorship opportunity, has signups
  ins.run(3, 'Summer Meal Prep',
    'Prepare and distribute meals to three local shelters.',
    'SolidaritéCannes', 'info@solidarite-cannes.fr', null,
    800, 10, 25, '2026-07-20', '2026-06-20', '2026-08-20', 'Open', 'Centre Social, Cannes');

  // 3: Active (Pierre's), future event — volunteers can sign up but not check in
  ins.run(1, 'Port Canto Shore Cleanup',
    'Cleanup around the marina area. Gloves and bags provided.',
    'OceanCare', 'contact@oceancare.org', "Pierre's Restaurant",
    350, 15, 30, '2026-05-10', '2026-04-05', '2026-06-10', 'Active', 'Port Canto, Cannes');

  // 4: Active (Pierre's), event is TODAY — volunteers can check in
  ins.run(1, 'La Croisette Morning Cleanup',
    'Early morning cleanup along the Croisette promenade.',
    'OceanCare', 'contact@oceancare.org', "Pierre's Restaurant",
    300, 10, 20, '2026-04-05', '2026-03-05', '2026-05-05', 'Active', 'La Croisette, Cannes');

  // 5: Active (Pierre's), past event — NGO can submit (enough volunteers)
  ins.run(1, 'Mouré Rouge Beach Cleanup',
    'Clear plastic waste from Mouré Rouge beach before nesting season.',
    'OceanCare', 'contact@oceancare.org', "Pierre's Restaurant",
    400, 10, 25, '2026-04-01', '2026-03-01', '2026-05-01', 'Active', 'Plage du Mouré Rouge, Cannes');

  // 6: PendingReview (Pierre's) — business reviews photos
  ins.run(3, 'Soup Kitchen Weekend',
    'Prepare hot meals for 200 people at the downtown shelter.',
    'SolidaritéCannes', 'info@solidarite-cannes.fr', "Pierre's Restaurant",
    550, 12, 20, '2026-03-20', '2026-02-20', '2026-04-20', 'PendingReview', 'Centre Social, Cannes');

  // 7: Completed (Pierre's) — volunteer can claim reward
  ins.run(2, 'Weekend Reading Buddies',
    'Pair volunteers with kids for Saturday morning reading sessions.',
    'LireEnsemble', 'hello@lireensemble.fr', "Pierre's Restaurant",
    200, 8, 15, '2026-03-15', '2026-02-15', '2026-04-15', 'Completed', 'Bibliothèque Municipale, Cannes');

  // 8: Completed (Pierre's) — another completed, demo volunteer already claimed
  ins.run(1, 'Îles de Lérins Beach Restoration',
    'Restore beach areas on Sainte-Marguerite island.',
    'OceanCare', 'contact@oceancare.org', "Pierre's Restaurant",
    450, 15, 25, '2026-02-20', '2026-01-20', '2026-03-20', 'Completed', 'Île Sainte-Marguerite, Cannes');

  // 9: Expired (Pierre's) — sponsored but deadline passed, refund
  ins.run(1, 'Spring Coast Sweep',
    'Early spring cleanup of the eastern coast.',
    'OceanCare', 'contact@oceancare.org', "Pierre's Restaurant",
    250, 10, 20, '2026-02-01', '2026-01-01', '2026-03-01', 'Expired', 'Plage du Mouré Rouge, Cannes');

  // 10: Expired — never got a sponsor
  ins.run(2, 'After-School Tutoring',
    'Weekly tutoring sessions for middle school students.',
    'LireEnsemble', 'hello@lireensemble.fr', null,
    300, 12, 20, '2026-02-01', '2026-01-01', '2026-03-01', 'Expired', 'Médiathèque de Cannes, Cannes');

  // --- Demo volunteer ---
  const demoNullifier = '0x2bfe4b2f1b17853598ecd565629c0fbed11d1acd6bff1d726ce8b4fad99763a3';
  const demoWallet = '0x239572713847b7341ce40d4665ab36e601137d43';
  db.prepare('INSERT INTO user_nullifiers (wallet_address, nullifier) VALUES (?, ?)').run(demoWallet, demoNullifier);

  // Demo volunteer checked into: 5 (past active), 7 (completed), 8 (completed)
  // Campaign 4 (today) left unchecked so tester can try the check-in flow
  for (const cid of [5, 7, 8]) {
    db.prepare('INSERT INTO checkins (campaign_id, nullifier) VALUES (?, ?)').run(cid, demoNullifier);
  }

  // Fake signups (interests) on open/active campaigns to show demand
  for (let i = 0; i < 8; i++) {
    db.prepare('INSERT INTO interests (campaign_id, nullifier) VALUES (?, ?)').run(1, `fake-interest-${i}`);
  }
  for (let i = 0; i < 15; i++) {
    db.prepare('INSERT INTO interests (campaign_id, nullifier) VALUES (?, ?)').run(2, `fake-interest-meal-${i}`);
  }
  for (let i = 0; i < 12; i++) {
    db.prepare('INSERT INTO interests (campaign_id, nullifier) VALUES (?, ?)').run(3, `fake-interest-port-${i}`);
  }
  for (let i = 0; i < 6; i++) {
    db.prepare('INSERT INTO interests (campaign_id, nullifier) VALUES (?, ?)').run(4, `fake-interest-croisette-${i}`);
  }

  // Fake check-ins for campaigns that need volunteer counts
  // Campaign 5 (Active, past) — 12 volunteers so NGO can submit (min 10)
  for (let i = 0; i < 12; i++) {
    db.prepare('INSERT INTO checkins (campaign_id, nullifier) VALUES (?, ?)').run(5, `fake-volunteer-estuary-${i}`);
  }
  // Campaign 6 (PendingReview) — 15 volunteers
  for (let i = 0; i < 15; i++) {
    db.prepare('INSERT INTO checkins (campaign_id, nullifier) VALUES (?, ?)').run(6, `fake-volunteer-soup-${i}`);
  }
  // Campaign 7 (Completed) — 10 volunteers
  for (let i = 0; i < 10; i++) {
    db.prepare('INSERT INTO checkins (campaign_id, nullifier) VALUES (?, ?)').run(7, `fake-volunteer-reading-${i}`);
  }
  // Campaign 8 (Completed) — 18 volunteers
  for (let i = 0; i < 18; i++) {
    db.prepare('INSERT INTO checkins (campaign_id, nullifier) VALUES (?, ?)').run(8, `fake-volunteer-lerins-${i}`);
  }

  // --- Civic rewards ---
  const insertReward = db.prepare('INSERT INTO civic_rewards (name, file_path) VALUES (?, ?)');
  for (let i = 0; i < 10; i++) insertReward.run('Free Ice Cream', '/icecream.png');
}

seed();
