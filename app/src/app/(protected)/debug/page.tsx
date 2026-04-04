'use client';

import { Page } from '@/components/PageLayout';
import { Button, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// TODO: remove this page before production
const ROLES = [
  { id: 'volunteer', label: 'Volunteer' },
  { id: 'ngo', label: 'NGO' },
  { id: 'business', label: 'Business' },
  { id: 'city', label: 'City' },
];

export default function DebugSwitchRole() {
  const router = useRouter();
  const { data: session } = useSession();
  const walletAddress = session?.user?.walletAddress;

  const handleSwitch = async (role: string) => {
    if (!walletAddress) return;
    await fetch('/api/user-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, role }),
    });
    router.push(`/${role}`);
  };

  return (
    <>
      <Page.Header className="p-0">
        <TopBar
          title="Switch Role"
          startAdornment={<button onClick={() => router.back()}>← Back</button>}
        />
      </Page.Header>
      <Page.Main className="flex flex-col gap-3">
        <p className="text-sm text-gray-500">Debug only — switch your role.</p>
        {ROLES.map((role) => (
          <Button
            key={role.id}
            size="lg"
            variant="secondary"
            className="w-full"
            onClick={() => handleSwitch(role.id)}
          >
            {role.label}
          </Button>
        ))}
      </Page.Main>
    </>
  );
}
