'use client';

import { CampaignCard } from '@/components/CampaignCard';
import { Page } from '@/components/PageLayout';
import { formatDate, formatStatus } from '@/lib/utils';
import type { Campaign, Goal, RewardSummary } from '@/lib/db';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const inputStyle = "w-full bg-surface-container-lowest border border-outline-variant/20 rounded-[16px] p-3.5 text-sm text-on-surface focus:outline-none focus:border-primary/50";
const labelStyle = "text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1.5";
const btnStyle = { background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '20px 40px', borderRadius: '12px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

function NewGoalForm({ onCreated, onBack }: { onCreated: () => void; onBack: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'Environment', description: '' });
  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    setSubmitting(true);
    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    onCreated();
  };

  return (
    <>
      <Page.Header>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">New Goal</h2>
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col gap-4 pt-2">
        <div>
          <label className={labelStyle}>Title</label>
          <input className={inputStyle} value={form.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <label className={labelStyle}>Category</label>
          <select className={inputStyle} value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option>Environment</option>
            <option>Education</option>
            <option>Social</option>
            <option>Health</option>
            <option>Culture</option>
          </select>
        </div>
        <div>
          <label className={labelStyle}>Description</label>
          <textarea className={inputStyle} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <button style={btnStyle} className="shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Goal'}
        </button>
      </Page.Main>
    </>
  );
}

function AddRewardForm({ onCreated, onBack, existingNames }: { onCreated: () => void; onBack: () => void; existingNames: string[] }) {
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const suggestions = existingNames.filter(
    (n) => n.toLowerCase().includes(name.toLowerCase()) && n.toLowerCase() !== name.toLowerCase()
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    const formData = new FormData();
    formData.append('name', name);
    files.forEach((f) => formData.append('files', f));

    await fetch('/api/rewards/add', { method: 'POST', body: formData });
    setSubmitting(false);
    onCreated();
  };

  return (
    <>
      <Page.Header>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">Add Rewards</h2>
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col gap-4 pt-2">
        <div className="relative">
          <label className={labelStyle}>Reward name</label>
          <input
            className={inputStyle}
            placeholder="e.g. Museum Pass"
            value={name}
            onChange={(e) => { setName(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-surface-container-lowest border border-outline-variant/20 rounded-[16px] shadow-lg overflow-hidden">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="w-full text-left px-4 py-3 text-sm text-on-surface hover:bg-surface-container-low"
                  onMouseDown={() => { setName(s); setShowSuggestions(false); }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className={labelStyle}>Ticket files ({files.length} selected)</label>
          {files.length > 0 && (
            <div className="space-y-2 mb-3">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-surface-container-lowest border border-outline-variant/10 rounded-[12px] p-3">
                  <p className="text-sm text-on-surface truncate">{f.name}</p>
                  <button className="text-error text-xs font-semibold" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <label className="block bg-surface-container-lowest border-2 border-dashed border-outline-variant/30 rounded-[16px] p-6 text-center cursor-pointer">
            <span className="material-symbols-outlined text-on-surface-variant text-2xl mb-1">upload_file</span>
            <p className="text-on-surface-variant text-xs">Tap to add files (image, PDF, pkpass)</p>
            <input
              type="file"
              accept="image/*,.pdf,.pkpass"
              multiple
              className="hidden"
              onChange={(e) => {
                const newFiles = Array.from(e.target.files ?? []);
                setFiles((prev) => [...prev, ...newFiles]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <button style={btnStyle} className="shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50" onClick={handleSubmit} disabled={submitting || !name || files.length === 0}>
          {submitting ? 'Uploading...' : `Add ${files.length} Reward${files.length !== 1 ? 's' : ''}`}
        </button>
      </Page.Main>
    </>
  );
}

export default function CityPage() {
  const router = useRouter();
  const [view, setView] = useState<'dashboard' | 'goal' | 'campaign' | 'rewards' | 'addReward' | 'newGoal'>('dashboard');
  const [selectedGoal, setSelectedGoal] = useState<number | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [rewards, setRewards] = useState<RewardSummary[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch('/api/campaigns').then((r) => r.json()).then(setCampaigns);
    fetch('/api/goals').then((r) => r.json()).then(setGoals);
    fetch('/api/rewards').then((r) => r.json()).then((d) => setRewards(d.rewards));
  }, [refreshKey]);

  const goal = selectedGoal !== null ? goals.find((g) => g.id === selectedGoal) : null;
  const totalRewards = rewards.reduce((s, r) => s + r.remaining, 0);
  const totalVolunteers = campaigns.reduce((s, c) => s + c.volunteer_count, 0);

  // New goal form
  if (view === 'newGoal') {
    return <NewGoalForm onCreated={() => { setView('dashboard'); setRefreshKey((k) => k + 1); }} onBack={() => setView('dashboard')} />;
  }

  // Add reward form
  if (view === 'addReward') {
    return <AddRewardForm onCreated={() => { setView('rewards'); setRefreshKey((k) => k + 1); }} onBack={() => setView('rewards')} existingNames={rewards.map((r) => r.name)} />;
  }

  // Global rewards management
  if (view === 'rewards') {
    return (
      <>
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => setView('dashboard')} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">Civic Rewards</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col gap-3 pt-2">
          <div className="flex justify-between items-center">
            <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">{totalRewards} remaining</p>
            <button onClick={() => setView('addReward')} className="px-4 py-2 rounded-full bg-surface-container-low text-primary text-xs font-semibold">
              + Add
            </button>
          </div>
          {rewards.map((r) => (
            <div key={r.name} className="bg-surface-container-lowest rounded-[20px] p-4 flex justify-between items-center border border-outline-variant/10 shadow-sm">
              <div>
                <p className="font-headline font-bold text-on-surface">{r.name}</p>
                <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider mt-0.5">Available to all volunteers</p>
              </div>
              <div className="text-right">
                {r.remaining > 0 ? (
                  <>
                    <p className="font-headline text-xl font-extrabold text-primary">{r.remaining}</p>
                    <p className="text-[10px] text-on-surface-variant font-medium">of {r.total}</p>
                  </>
                ) : (
                  <span className="px-3 py-1.5 rounded-xl bg-red-100 text-red-800 text-xs font-bold uppercase tracking-wider">Sold out</span>
                )}
              </div>
            </div>
          ))}
        </Page.Main>
      </>
    );
  }

  // Campaign detail (read-only stats)
  if (view === 'campaign' && selectedCampaign !== null) {
    const c = campaigns.find((c) => c.id === selectedCampaign);
    const g = c ? goals.find((g) => g.id === c.goal_id) : null;
    if (c) {
      const days = Math.ceil((new Date(c.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return (
        <>
          <Page.Header>
            <div className="flex items-center gap-3">
              <button onClick={() => { setView('goal'); setSelectedCampaign(null); }} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface truncate">{c.title}</h2>
            </div>
          </Page.Header>
          <Page.Main className="flex flex-col gap-4 pt-2">
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-white/90 text-primary text-[10px] font-bold uppercase tracking-wider rounded-full border border-outline-variant/10">{g?.category}</span>
              <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                c.status === 'Completed' ? 'bg-primary-container/20 text-primary' :
                c.status === 'Active' ? 'bg-blue-100 text-blue-800' :
                c.status === 'Open' ? 'bg-amber-100 text-amber-800' :
                c.status === 'PendingReview' ? 'bg-purple-100 text-purple-800' :
                c.status === 'Expired' ? 'bg-red-100 text-red-800' :
                'bg-surface-container text-on-surface-variant'
              }`}>{c.status === 'PendingReview' ? 'In Review' : c.status}</span>
            </div>

            <p className="text-sm text-on-surface-variant">{c.description}</p>

            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">location_on</span>
                <span className="text-on-surface">{c.location}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">event</span>
                <span className="text-on-surface">
                  {formatDate(c.event_date)}
                  {days < 0 && <span className="text-on-surface-variant"> · {-days}d ago</span>}
                  {days === 0 && <span className="text-primary font-semibold"> · Today</span>}
                  {days > 0 && <span className="text-on-surface-variant"> · in {days}d</span>}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">apartment</span>
                <span className="text-on-surface">{c.ngo}</span>
              </div>
              {c.sponsor && (
                <div className="flex items-center gap-2.5 text-sm">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">handshake</span>
                  <span className="text-on-surface">{c.sponsor}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-sm">
                <span className="material-symbols-outlined text-on-surface-variant text-lg">payments</span>
                <span className="text-on-surface">{c.funding_required} EURC</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
                <p className="font-headline text-2xl font-extrabold text-tertiary">{c.interest_count}</p>
                <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">Signed up</p>
              </div>
              <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
                <p className="font-headline text-2xl font-extrabold text-primary">{c.volunteer_count}</p>
                <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">Checked in</p>
              </div>
              <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
                <p className="font-headline text-2xl font-extrabold text-on-surface">{c.max_volunteers}</p>
                <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">Max</p>
              </div>
            </div>
          </Page.Main>
        </>
      );
    }
  }

  // Goal detail
  if (view === 'goal' && goal) {
    const goalCampaigns = campaigns.filter((c) => c.goal_id === goal.id);
    return (
      <>
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('dashboard'); setSelectedGoal(null); }} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface truncate">{goal.title}</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col gap-4 pt-2">
          <p className="text-sm text-on-surface-variant">{goal.description}</p>

          <p className="font-headline font-bold text-on-surface">Campaigns</p>
          {goalCampaigns.length === 0 && (
            <div className="text-center mt-8">
              <span className="material-symbols-outlined text-4xl text-outline-variant mb-2">campaign</span>
              <p className="text-sm text-on-surface-variant">No campaigns yet</p>
            </div>
          )}
          {goalCampaigns.map((c) => {
            const cGoal = goals.find((g) => g.id === c.goal_id);
            return (
              <CampaignCard
                key={c.id}
                title={c.title}
                category={cGoal?.category ?? ''}
                location={c.location}
                coverImage={c.cover_image}
                ngo={c.ngo}
                sponsor={c.sponsor}
                onClick={() => { setSelectedCampaign(c.id); setView('campaign'); }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-primary font-bold text-sm">{c.funding_required} EURC</span>
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider ${
                    c.status === 'Completed' ? 'bg-primary-container/20 text-primary' :
                    c.status === 'Active' ? 'bg-blue-100 text-blue-800' :
                    c.status === 'Open' ? 'bg-amber-100 text-amber-800' :
                    c.status === 'PendingReview' ? 'bg-purple-100 text-purple-800' :
                    'bg-surface-container text-on-surface-variant'
                  }`}>{formatStatus(c.status)}</span>
                </div>
              </CampaignCard>
            );
          })}
        </Page.Main>
      </>
    );
  }

  // Dashboard
  return (
    <>
      <Page.Header>
        <div className="flex justify-between items-center">
          <h2 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface">City Dashboard</h2>
          <button onClick={() => router.push('/debug')} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </Page.Header>
      <Page.Main className="flex flex-col gap-4 pt-2">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
            <p className="font-headline text-2xl font-extrabold text-primary">{goals.length}</p>
            <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">Goals</p>
          </div>
          <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
            <p className="font-headline text-2xl font-extrabold text-primary">{campaigns.length}</p>
            <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">Campaigns</p>
          </div>
          <div className="bg-surface-container-lowest rounded-[20px] p-4 text-center border border-outline-variant/10">
            <p className="font-headline text-2xl font-extrabold text-primary">{totalVolunteers}</p>
            <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider mt-1">Volunteers</p>
          </div>
        </div>

        {/* Rewards card */}
        <button
          onClick={() => setView('rewards')}
          className="bg-surface-container-lowest rounded-[20px] p-4 flex justify-between items-center border border-outline-variant/10 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full impact-gradient flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>redeem</span>
            </div>
            <div>
              <p className="font-headline font-bold text-on-surface text-sm">Civic Rewards</p>
              <p className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">{totalRewards} remaining</p>
            </div>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
        </button>

        {/* Goals */}
        <div className="flex justify-between items-center">
          <p className="font-headline font-bold text-on-surface">Goals</p>
          <button onClick={() => setView('newGoal')} className="px-4 py-2 rounded-full bg-surface-container-low text-primary text-xs font-semibold">
            + New Goal
          </button>
        </div>

        {goals.map((g) => {
          const count = campaigns.filter((c) => c.goal_id === g.id).length;
          return (
            <button
              key={g.id}
              onClick={() => { setSelectedGoal(g.id); setView('goal'); }}
              className="text-left bg-surface-container-lowest rounded-[20px] p-4 border border-outline-variant/10 shadow-sm space-y-1"
            >
              <div className="flex justify-between items-start">
                <p className="font-headline font-bold text-on-surface">{g.title}</p>
                <span className="px-3 py-1 bg-white/90 text-primary text-[10px] font-bold uppercase tracking-wider rounded-full border border-outline-variant/10">{g.category}</span>
              </div>
              <p className="text-xs text-on-surface-variant">{count} campaign{count !== 1 ? 's' : ''}</p>
            </button>
          );
        })}
      </Page.Main>
    </>
  );
}
