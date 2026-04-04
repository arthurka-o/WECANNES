'use client';

import { Page } from '@/components/PageLayout';
import { campaigns, civicRewards, goals } from '@/lib/mock-data';
import { Button, Chip, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CityPage() {
  const router = useRouter();
  const [view, setView] = useState<'dashboard' | 'goal' | 'rewards' | 'addReward'>('dashboard');
  const [selectedGoal, setSelectedGoal] = useState<number | null>(null);

  const goal = selectedGoal !== null ? goals[selectedGoal] : null;

  // Add reward form
  if (view === 'addReward') {
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title="Add Reward"
            startAdornment={
              <button onClick={() => setView('rewards')}>← Back</button>
            }
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold block mb-1">Reward type</label>
              <select className="w-full border rounded-lg p-3">
                <option>Museum Pass</option>
                <option>Theater Ticket</option>
                <option>Pool Access</option>
                <option>Transit Pass</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold block mb-1">Quantity</label>
              <input type="number" placeholder="e.g. 50" className="w-full border rounded-lg p-3" />
            </div>
            <Button size="lg" variant="primary" className="w-full">
              Add Reward
            </Button>
          </div>
        </Page.Main>
      </>
    );
  }

  // Global rewards management
  if (view === 'rewards') {
    const totalRewards = civicRewards.reduce((s, r) => s + r.remaining, 0);
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title="Civic Rewards"
            startAdornment={
              <button onClick={() => setView('dashboard')}>← Back</button>
            }
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{totalRewards} total remaining</p>
            <Button size="sm" variant="secondary" onClick={() => setView('addReward')}>
              + Add
            </Button>
          </div>
          {civicRewards.map((r) => (
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
    const goalCampaigns = campaigns.filter((c) => c.goalId === goal.id);
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title={goal.title}
            startAdornment={
              <button onClick={() => { setView('dashboard'); setSelectedGoal(null); }}>← Back</button>
            }
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">{goal.description}</p>

          <p className="font-semibold mt-2">Campaigns</p>
          {goalCampaigns.map((c) => (
            <div key={c.id} className="bg-white border rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-start">
                <p className="font-semibold">{c.title}</p>
                <Chip label={c.status} />
              </div>
              <p className="text-sm text-gray-600">by {c.ngo}</p>
              <p className="text-sm">
                {c.volunteerCount}/{c.maxVolunteers} volunteers · {c.fundingRequired} USDC
              </p>
              {c.status === 'Funded' && (
                <Button size="sm" variant="primary" className="w-full mt-2">
                  Activate Campaign
                </Button>
              )}
            </div>
          ))}
        </Page.Main>
      </>
    );
  }

  // Dashboard
  const totalRewards = civicRewards.reduce((s, r) => s + r.remaining, 0);

  return (
    <>
      <Page.Header className="p-0">
        <TopBar
          title="City Dashboard"
          startAdornment={
            <button onClick={() => router.push('/home')}>← Back</button>
          }
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
            <p className="text-xl font-bold">
              {campaigns.reduce((s, c) => s + c.volunteerCount, 0)}
            </p>
            <p className="text-xs text-gray-500">Volunteers</p>
          </div>
        </div>

        {/* Rewards shortcut */}
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
          <Button size="sm" variant="secondary">
            + New Goal
          </Button>
        </div>

        {goals.map((g) => {
          const count = campaigns.filter((c) => c.goalId === g.id).length;
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
