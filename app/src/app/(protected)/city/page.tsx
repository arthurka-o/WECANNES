'use client';

import { Page } from '@/components/PageLayout';
import type { Campaign, Goal, RewardSummary } from '@/lib/db';
import { Button, Chip, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
      <Page.Header className="p-0">
        <TopBar title="New Goal" startAdornment={<button onClick={onBack}>← Back</button>} />
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">
        <div>
          <label className="text-sm font-semibold block mb-1">Title</label>
          <input className="w-full border rounded-lg p-3" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Category</label>
          <select className="w-full border rounded-lg p-3" value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option>Environment</option>
            <option>Education</option>
            <option>Social</option>
            <option>Health</option>
            <option>Culture</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Description</label>
          <textarea className="w-full border rounded-lg p-3" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <Button size="lg" variant="primary" className="w-full" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating...' : 'Create Goal'}
        </Button>
      </Page.Main>
    </>
  );
}

function AddRewardForm({ onCreated, onBack }: { onCreated: () => void; onBack: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);

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
      <Page.Header className="p-0">
        <TopBar title="Add Rewards" startAdornment={<button onClick={onBack}>← Back</button>} />
      </Page.Header>
      <Page.Main className="flex flex-col gap-4">
        <div>
          <label className="text-sm font-semibold block mb-1">Reward name</label>
          <input className="w-full border rounded-lg p-3" placeholder="e.g. Museum Pass" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Ticket files ({files.length} selected)</label>
          {files.length > 0 && (
            <div className="space-y-1 mb-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between border rounded-lg p-2">
                  <p className="text-sm truncate">{f.name}</p>
                  <button className="text-red-500 text-xs" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <label className="block border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer">
            <p className="text-gray-400 text-sm">Tap to add files (image, PDF, pkpass)</p>
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
        <Button size="lg" variant="primary" className="w-full" onClick={handleSubmit} disabled={submitting || !name || files.length === 0}>
          {submitting ? 'Uploading...' : `Add ${files.length} Reward${files.length !== 1 ? 's' : ''}`}
        </Button>
      </Page.Main>
    </>
  );
}

export default function CityPage() {
  const router = useRouter();
  const [view, setView] = useState<'dashboard' | 'goal' | 'rewards' | 'addReward' | 'newGoal'>('dashboard');
  const [selectedGoal, setSelectedGoal] = useState<number | null>(null);
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
    return <AddRewardForm onCreated={() => { setView('rewards'); setRefreshKey((k) => k + 1); }} onBack={() => setView('rewards')} />;
  }

  // Global rewards management
  if (view === 'rewards') {
    return (
      <>
        <Page.Header className="p-0">
          <TopBar title="Civic Rewards" startAdornment={<button onClick={() => setView('dashboard')}>← Back</button>} />
        </Page.Header>
        <Page.Main className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{totalRewards} total remaining</p>
            <Button size="sm" variant="secondary" onClick={() => setView('addReward')}>
              + Add
            </Button>
          </div>
          {rewards.map((r) => (
            <div key={r.name} className="bg-white border rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-gray-400">Available to all volunteers</p>
              </div>
              <p className="text-sm">
                <span className="font-bold">{r.remaining}</span>
                <span className="text-gray-400">/{r.total}</span>
              </p>
            </div>
          ))}
        </Page.Main>
      </>
    );
  }

  // Goal detail
  if (view === 'goal' && goal) {
    const goalCampaigns = campaigns.filter((c) => c.goal_id === goal.id);
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title={goal.title}
            startAdornment={<button onClick={() => { setView('dashboard'); setSelectedGoal(null); }}>← Back</button>}
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">{goal.description}</p>

          <p className="font-semibold mt-2">Campaigns</p>
          {goalCampaigns.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-4">No campaigns yet</p>
          )}
          {goalCampaigns.map((c) => (
            <div key={c.id} className="bg-white border rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-start">
                <p className="font-semibold">{c.title}</p>
                <Chip label={c.status} />
              </div>
              <p className="text-sm text-gray-600">by {c.ngo}</p>
              <p className="text-sm">
                {c.volunteer_count}/{c.max_volunteers} volunteers · {c.funding_required} EURC
              </p>
            </div>
          ))}
        </Page.Main>
      </>
    );
  }

  // Dashboard
  return (
    <>
      <Page.Header className="p-0">
        <TopBar
          title="City Dashboard"
        />
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">
        <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-3 text-center">
          <div>
            <p className="text-xl font-bold">{goals.length}</p>
            <p className="text-xs text-gray-500">Goals</p>
          </div>
          <div>
            <p className="text-xl font-bold">{campaigns.length}</p>
            <p className="text-xs text-gray-500">Campaigns</p>
          </div>
          <div>
            <p className="text-xl font-bold">{totalVolunteers}</p>
            <p className="text-xs text-gray-500">Volunteers</p>
          </div>
        </div>

        <button
          onClick={() => setView('rewards')}
          className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex justify-between items-center"
        >
          <div>
            <p className="font-semibold text-sm">Civic Rewards</p>
            <p className="text-xs text-amber-700">{totalRewards} remaining</p>
          </div>
          <span className="text-gray-400">→</span>
        </button>

        <div className="flex justify-between items-center mt-2">
          <p className="font-semibold">Goals</p>
          <Button size="sm" variant="secondary" onClick={() => setView('newGoal')}>
            + New Goal
          </Button>
        </div>

        {goals.map((g) => {
          const count = campaigns.filter((c) => c.goal_id === g.id).length;
          return (
            <button
              key={g.id}
              onClick={() => { setSelectedGoal(g.id); setView('goal'); }}
              className="text-left bg-white border rounded-xl p-4 space-y-1"
            >
              <div className="flex justify-between items-start">
                <p className="font-semibold">{g.title}</p>
                <Chip label={g.category} />
              </div>
              <p className="text-sm text-gray-500">{count} campaign(s)</p>
            </button>
          );
        })}
      </Page.Main>
    </>
  );
}
