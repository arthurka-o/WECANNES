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
    fields: [],
  },
  {
    id: 'ngo',
    label: 'NGO',
    description: 'Create campaigns, organize events, submit results.',
    fields: [
      { key: 'name', label: 'Organization name', placeholder: 'e.g. OceanCare' },
      { key: 'email', label: 'Contact email', placeholder: 'e.g. contact@oceancare.org' },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    description: 'Sponsor campaigns with EURC, review completions.',
    fields: [
      { key: 'name', label: 'Company name', placeholder: "e.g. Pierre's Restaurant" },
    ],
  },
];

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();
  const walletAddress = session?.user?.walletAddress;

  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);
  const [view, setView] = useState<'slides' | 'roles' | 'details'>('slides');
  const [selectedRole, setSelectedRole] = useState<typeof ROLES[number] | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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

  const handleSelectRole = (role: typeof ROLES[number]) => {
    if (role.fields.length === 0) {
      // No extra info needed, save and go
      submitRole(role.id, {});
    } else {
      setSelectedRole(role);
      setFormData({});
      setView('details');
    }
  };

  const submitRole = async (roleId: string, data: Record<string, string>) => {
    if (!walletAddress) return;
    setSubmitting(true);
    await fetch('/api/user-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, role: roleId, ...data }),
    });
    router.push(`/${roleId}`);
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

  // Details form (NGO/Business extra fields)
  if (view === 'details' && selectedRole) {
    const allFilled = selectedRole.fields.every((f) => formData[f.key]?.trim());

    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title={selectedRole.label}
            startAdornment={<button onClick={() => setView('roles')}>← Back</button>}
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-4">
          <p className="text-sm text-gray-500">Tell us a bit about your organization.</p>
          {selectedRole.fields.map((field) => (
            <div key={field.key}>
              <label className="text-sm font-semibold block mb-1">{field.label}</label>
              <input
                className="w-full border rounded-lg p-3"
                placeholder={field.placeholder}
                value={formData[field.key] ?? ''}
                onChange={(e) => setFormData((d) => ({ ...d, [field.key]: e.target.value }))}
              />
            </div>
          ))}
        </Page.Main>
        <Page.Footer>
          <Button
            size="lg"
            variant="primary"
            className="w-full"
            disabled={!allFilled || submitting}
            onClick={() => submitRole(selectedRole.id, formData)}
          >
            {submitting ? 'Setting up...' : 'Continue'}
          </Button>
        </Page.Footer>
      </>
    );
  }

  // Role picker
  if (view === 'roles') {
    return (
      <>
        <Page.Header className="p-0">
          <TopBar
            title="Choose your role"
            startAdornment={<button onClick={() => setView('slides')}>← Back</button>}
          />
        </Page.Header>
        <Page.Main className="flex flex-col gap-3">
          <p className="text-sm text-gray-500">This determines your experience in the app.</p>
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => handleSelectRole(role)}
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
              setView('roles');
            } else {
              setSlide((s) => s + 1);
            }
          }}
        >
          {isLast ? 'Get Started' : 'Next'}
        </Button>
        {!isLast && (
          <button
            onClick={() => setView('roles')}
            className="w-full text-center text-sm text-gray-400 mt-3"
          >
            Skip
          </button>
        )}
      </Page.Footer>
    </Page>
  );
}
