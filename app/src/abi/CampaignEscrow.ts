export const CAMPAIGN_ESCROW_ADDRESS = '0x4f30b830E630AdD9F9916a9Dfd3E30c5dC9c9BAC' as const;

export const CAMPAIGN_ESCROW_ABI = [
  {
    type: 'function',
    name: 'checkIn',
    inputs: [
      { name: 'campaignId', type: 'uint256' },
      { name: 'root', type: 'uint256' },
      { name: 'nullifierHash', type: 'uint256' },
      { name: 'proof', type: 'uint256[8]' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getCampaign',
    inputs: [{ name: 'campaignId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'ngo', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'fundingRequired', type: 'uint256' },
          { name: 'minVolunteers', type: 'uint256' },
          { name: 'volunteerCount', type: 'uint256' },
          { name: 'sponsorshipDeadline', type: 'uint256' },
          { name: 'eventDeadline', type: 'uint256' },
          { name: 'reviewDeadline', type: 'uint256' },
          { name: 'status', type: 'uint8' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'checkins',
    inputs: [
      { name: 'campaignId', type: 'uint256' },
      { name: 'nullifierHash', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'fundCampaign',
    inputs: [{ name: 'campaignId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'approveRelease',
    inputs: [{ name: 'campaignId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'rejectCompletion',
    inputs: [{ name: 'campaignId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'submitCompletion',
    inputs: [{ name: 'campaignId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'createCampaign',
    inputs: [
      { name: 'campaignId', type: 'uint256' },
      { name: 'fundingRequired', type: 'uint256' },
      { name: 'minVolunteers', type: 'uint256' },
      { name: 'sponsorshipDeadline', type: 'uint256' },
      { name: 'eventDeadline', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claimRefund',
    inputs: [{ name: 'campaignId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'autoRelease',
    inputs: [{ name: 'campaignId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addNgo',
    inputs: [{ name: 'ngo', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'VolunteerCheckedIn',
    inputs: [
      { name: 'campaignId', type: 'uint256', indexed: true },
      { name: 'nullifierHash', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CampaignFunded',
    inputs: [
      { name: 'campaignId', type: 'uint256', indexed: true },
      { name: 'sponsor', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'FundsReleased',
    inputs: [
      { name: 'campaignId', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;
