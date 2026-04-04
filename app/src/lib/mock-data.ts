export interface Reward {
  name: string;
  total: number;
  remaining: number;
}

export interface Goal {
  id: number;
  title: string;
  category: string;
  description: string;
  active: boolean;
}

export interface NgoInfo {
  name: string;
  contactEmail: string;
  contactPhone: string;
}

export const ngoDirectory: Record<string, NgoInfo> = {
  'OceanCare': {
    name: 'OceanCare',
    contactEmail: 'contact@oceancare.org',
    contactPhone: '+33 6 12 34 56 78',
  },
  'LireEnsemble': {
    name: 'LireEnsemble',
    contactEmail: 'hello@lireensemble.fr',
    contactPhone: '+33 6 98 76 54 32',
  },
  'SolidaritéCannes': {
    name: 'SolidaritéCannes',
    contactEmail: 'info@solidarite-cannes.fr',
    contactPhone: '+33 6 55 44 33 22',
  },
};

export const civicRewards: Reward[] = [
  { name: 'Museum Pass', total: 100, remaining: 68 },
  { name: 'Pool Access', total: 50, remaining: 50 },
  { name: 'Theater Ticket', total: 30, remaining: 12 },
  { name: 'Transit Pass', total: 80, remaining: 80 },
];

export interface Campaign {
  id: number;
  goalId: number;
  title: string;
  description: string;
  ngo: string;
  sponsor: string | null;
  fundingRequired: number;
  minVolunteers: number;
  maxVolunteers: number;
  volunteerCount: number;
  deadline: string;
  status: 'Open' | 'Funded' | 'Active' | 'PendingReview' | 'Completed' | 'Expired';
  location: string;
  photos: string[];
}

export const goals: Goal[] = [
  {
    id: 0,
    title: 'Beach Cleanup — Summer 2026',
    category: 'Environment',
    description: 'Clean up beaches before tourist season',
    active: true,
  },
  {
    id: 1,
    title: 'Youth Literacy Program',
    category: 'Education',
    description: 'Improve reading skills for children aged 6-12',
    active: true,
  },
  {
    id: 2,
    title: 'Homeless Shelter Support',
    category: 'Social',
    description: 'Provide meals and supplies to local shelters',
    active: true,
  },
];

export const campaigns: Campaign[] = [
  {
    id: 0,
    goalId: 0,
    title: 'Plage du Midi Cleanup',
    description: '2km beach cleanup before summer season. Equipment provided.',
    ngo: 'OceanCare',
    sponsor: null,
    fundingRequired: 500,
    minVolunteers: 20,
    maxVolunteers: 40,
    volunteerCount: 0,
    deadline: '2026-06-15',
    status: 'Open',
    location: 'Plage du Midi, Cannes',
    photos: [],
  },
  {
    id: 1,
    goalId: 0,
    title: 'Port Canto Shore Cleanup',
    description: 'Cleanup around the marina area. Gloves and bags provided.',
    ngo: 'OceanCare',
    sponsor: "Pierre's Restaurant",
    fundingRequired: 350,
    minVolunteers: 15,
    maxVolunteers: 30,
    volunteerCount: 12,
    deadline: '2026-06-20',
    status: 'Active',
    location: 'Port Canto, Cannes',
    photos: [],
  },
  {
    id: 2,
    goalId: 1,
    title: 'Weekend Reading Buddies',
    description: 'Pair volunteers with kids for Saturday morning reading sessions.',
    ngo: 'LireEnsemble',
    sponsor: 'Librairie Cannes',
    fundingRequired: 200,
    minVolunteers: 8,
    maxVolunteers: 15,
    volunteerCount: 10,
    deadline: '2026-07-01',
    status: 'PendingReview',
    location: 'Bibliothèque Municipale, Cannes',
    photos: ['/mock-photo-1.jpg', '/mock-photo-2.jpg'],
  },
  {
    id: 3,
    goalId: 2,
    title: 'Summer Meal Prep',
    description: 'Prepare and distribute meals to three local shelters.',
    ngo: 'SolidaritéCannes',
    sponsor: null,
    fundingRequired: 800,
    minVolunteers: 10,
    maxVolunteers: 25,
    volunteerCount: 0,
    deadline: '2026-08-01',
    status: 'Open',
    location: 'Centre Social, Cannes',
    photos: [],
  },
];
