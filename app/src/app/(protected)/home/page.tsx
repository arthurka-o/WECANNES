'use client';

import { Page } from '@/components/PageLayout';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const inputStyle = "w-full bg-surface-container-lowest border border-outline-variant/20 rounded-[16px] p-3.5 text-sm text-on-surface focus:outline-none focus:border-primary/50";
const labelStyle = "text-[10px] font-bold text-on-surface-variant uppercase tracking-widest block mb-1.5";
const btnStyle = { background: 'linear-gradient(135deg, #006c4f 0%, #00c896 100%)', color: 'white', padding: '20px 40px', borderRadius: '12px', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

const SLIDES = [
  {
    icon: 'public',
    title: 'Welcome to WECANNES',
    description: 'A marketplace connecting cities, businesses, and volunteers for real civic change.',
  },
  {
    icon: 'groups',
    title: 'How it works',
    description: 'NGOs create campaigns, businesses sponsor them with EURC, and verified volunteers make it happen.',
  },
  {
    icon: 'verified',
    title: 'Powered by World ID',
    description: 'Every check-in is verified on-chain with zero-knowledge proofs. One person, one check-in — no fakes.',
  },
];

const ROLES = [
  {
    id: 'volunteer',
    icon: 'volunteer_activism',
    label: 'Volunteer',
    description: 'Join campaigns, check in at events, earn civic rewards.',
    fields: [],
  },
  {
    id: 'ngo',
    icon: 'apartment',
    label: 'NGO',
    description: 'Create campaigns, organize events, submit results.',
    fields: [
      { key: 'name', label: 'Organization name', placeholder: 'e.g. OceanCare' },
      { key: 'email', label: 'Contact email', placeholder: 'e.g. contact@oceancare.org' },
    ],
  },
  {
    id: 'business',
    icon: 'storefront',
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
          <p className="text-on-surface-variant text-sm">Loading...</p>
        </Page.Main>
      </Page>
    );
  }

  // Details form (NGO/Business extra fields)
  if (view === 'details' && selectedRole) {
    const allFilled = selectedRole.fields.every((f) => formData[f.key]?.trim());

    return (
      <>
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => setView('roles')} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">{selectedRole.label}</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col gap-4 pt-2">
          <p className="text-sm text-on-surface-variant">Tell us a bit about your organization.</p>
          {selectedRole.fields.map((field) => (
            <div key={field.key}>
              <label className={labelStyle}>{field.label}</label>
              <input
                className={inputStyle}
                placeholder={field.placeholder}
                value={formData[field.key] ?? ''}
                onChange={(e) => setFormData((d) => ({ ...d, [field.key]: e.target.value }))}
              />
            </div>
          ))}
        </Page.Main>
        <Page.Footer>
          <button
            style={btnStyle}
            className="w-full shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-50"
            disabled={!allFilled || submitting}
            onClick={() => submitRole(selectedRole.id, formData)}
          >
            {submitting ? 'Setting up...' : 'Continue'}
          </button>
        </Page.Footer>
      </>
    );
  }

  // Role picker
  if (view === 'roles') {
    return (
      <>
        <Page.Header>
          <div className="flex items-center gap-3">
            <button onClick={() => setView('slides')} className="w-10 h-10 flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
            <h2 className="font-headline text-xl font-extrabold tracking-tight text-on-surface">Choose your role</h2>
          </div>
        </Page.Header>
        <Page.Main className="flex flex-col gap-4 pt-2">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">This determines your experience</p>
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => handleSelectRole(role)}
              className="text-left bg-surface-container-lowest rounded-[20px] p-5 border border-outline-variant/10 shadow-sm flex items-start gap-4"
            >
              <div className="w-12 h-12 rounded-[16px] impact-gradient flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>{role.icon}</span>
              </div>
              <div>
                <p className="font-headline font-bold text-on-surface text-lg">{role.label}</p>
                <p className="text-sm text-on-surface-variant mt-0.5">{role.description}</p>
              </div>
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
      <Page.Main className="flex flex-col items-center justify-center text-center gap-8 px-8">
        <div className="w-20 h-20 rounded-[24px] impact-gradient flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>{currentSlide.icon}</span>
        </div>
        <div className="space-y-3">
          <p className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">{currentSlide.title}</p>
          <p className="text-on-surface-variant">{currentSlide.description}</p>
        </div>

        {/* Dots */}
        <div className="flex gap-2">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${i === slide ? 'w-6 bg-primary' : 'w-2 bg-outline-variant'}`}
            />
          ))}
        </div>
      </Page.Main>
      <Page.Footer>
        <button
          style={btnStyle}
          className="w-full shadow-lg shadow-primary/20 active:scale-95 transition-transform"
          onClick={() => {
            if (isLast) {
              setView('roles');
            } else {
              setSlide((s) => s + 1);
            }
          }}
        >
          {isLast ? 'Get Started' : 'Next'}
        </button>
        {!isLast && (
          <button
            onClick={() => setView('roles')}
            className="w-full text-center text-sm text-on-surface-variant mt-3"
          >
            Skip
          </button>
        )}
      </Page.Footer>
    </Page>
  );
}
