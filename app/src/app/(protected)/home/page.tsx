'use client';

import { Page } from '@/components/PageLayout';
import { Button, TopBar } from '@worldcoin/mini-apps-ui-kit-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const SLIDES = [
  {
    title: 'Welcome to Civic Impact',
    description: 'A marketplace connecting cities, businesses, and volunteers for real civic change.',
  },
  {
    title: 'How it works',
    description: 'NGOs create campaigns, businesses sponsor them with EURC, and verified volunteers make it happen.',
  },
  {
    title: 'Powered by World ID',
    description: 'Every check-in is verified on-chain with zero-knowledge proofs. One person, one check-in — no fakes.',
  },
];

const ROLES = [
  {
    id: 'volunteer',
    label: 'Volunteer',
    description: 'Join campaigns, check in at events, earn civic rewards.',
  },
  {
    id: 'ngo',
    label: 'NGO',
    description: 'Create campaigns, organize events, submit results.',
  },
  {
    id: 'business',
    label: 'Business',
    description: 'Sponsor campaigns with EURC, review completions.',
  },
];

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();
  const walletAddress = session?.user?.walletAddress;

  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const [showRolePicker, setShowRolePicker] = useState(false);

  // Check if user already has a role
  useEffect(() => {
    if (!walletAddress) return;
    fetch(`/api/user-role?wallet=${walletAddress}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.role) {
          router.replace(`/${data.role}`);
        } else {
          setLoading(false);
        }
      });
  }, [walletAddress, router]);

  const handleSelectRole = async (role: string) => {
    if (!walletAddress) return;
    await fetch('/api/user-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, role }),
    });
    router.push(`/${role}`);
  };

  if (loading) {
    return (
      <Page>
        <Page.Main className="flex items-center justify-center">
          <p className="text-gray-400">Loading...</p>
        </Page.Main>
      </Page>
    );
  }

  // Role picker
  if (showRolePicker) {
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title="Choose your role"
            startAdornment={<button onClick={() => setShowRolePicker(false)}>← Back</button>}
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-3">
          <p className="text-sm text-gray-500">This determines your experience in the app.</p>
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => handleSelectRole(role.id)}
              className="text-left bg-white border rounded-xl p-4 space-y-1"
            >
              <p className="font-semibold text-lg">{role.label}</p>
              <p className="text-sm text-gray-500">{role.description}</p>
            </button>
          ))}
        </Page.Main>
      </>
    );
  }

  // Intro slides
  const currentSlide = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  return (
    <Page>
      <Page.Main className="flex flex-col items-center justify-center text-center gap-6 px-8">
        <div className="space-y-3">
          <p className="text-2xl font-bold">{currentSlide.title}</p>
          <p className="text-gray-500">{currentSlide.description}</p>
        </div>

        {/* Dots */}
        <div className="flex gap-2">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${i === slide ? 'bg-black' : 'bg-gray-300'}`}
            />
          ))}
        </div>
      </Page.Main>
      <Page.Footer>
        <Button
          size="lg"
          variant="primary"
          className="w-full"
          onClick={() => {
            if (isLast) {
              setShowRolePicker(true);
            } else {
              setSlide((s) => s + 1);
            }
          }}
        >
          {isLast ? 'Get Started' : 'Next'}
        </Button>
        {!isLast && (
          <button
            onClick={() => setShowRolePicker(true)}
            className="w-full text-center text-sm text-gray-400 mt-3"
          >
            Skip
          </button>
        )}
      </Page.Footer>
    </Page>
  );
}
