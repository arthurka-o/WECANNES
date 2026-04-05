'use client';

import { Page } from '@/components/PageLayout';
import { Button, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// TODO: remove this page before production
const ROLES = [
  { id: 'volunteer', label: 'Volunteer', name: undefined, email: undefined },
  { id: 'ngo', label: 'NGO (Food Policy Council)', name: 'Food Policy Council', email: 'info@foodcouncil.com' },
  { id: 'business', label: 'Business (Pierre\'s)', name: "Pierre's Restaurant", email: undefined },
  { id: 'city', label: 'City', name: undefined, email: undefined },
];

export default function DebugSwitchRole() {
  const router = useRouter();
  const { data: session } = useSession();
  const walletAddress = session?.user?.walletAddress;

  const handleSwitch = async (role: typeof ROLES[number]) => {
    if (!walletAddress) return;
    await fetch('/api/user-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, role: role.id, name: role.name, email: role.email }),
    });
    router.push(`/${role.id}`);
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
            onClick={() => handleSwitch(role)}
          >
            {role.label}
          </Button>
        ))}
      </Page.Main>
    </>
  );
}
