'use client';

import { Page } from '@/components/PageLayout';
import { Button, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <>
      <Page.Header className="p-0">
        <TopBar title="Civic Impact" />
      </Page.Header>
      <Page.Main className="flex flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold mb-4">Choose your role</p>

        <Button
          size="lg"
          variant="primary"
          className="w-full"
          onClick={() => router.push('/volunteer')}
        >
          Volunteer
        </Button>

        <Button
          size="lg"
          variant="secondary"
          className="w-full"
          onClick={() => router.push('/city')}
        >
          City
        </Button>

        <Button
          size="lg"
          variant="secondary"
          className="w-full"
          onClick={() => router.push('/ngo')}
        >
          NGO
        </Button>

        <Button
          size="lg"
          variant="secondary"
          className="w-full"
          onClick={() => router.push('/business')}
        >
          Business
        </Button>
      </Page.Main>
    </>
  );
}
