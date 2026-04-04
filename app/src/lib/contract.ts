import { CAMPAIGN_ESCROW_ABI, CAMPAIGN_ESCROW_ADDRESS } from '@/abi/CampaignEscrow';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { worldchain } from 'viem/chains';

const RPC_URL = 'https://worldchain-mainnet.g.alchemy.com/public';

export const publicClient = createPublicClient({
  chain: worldchain,
  transport: http(RPC_URL),
});

function getWalletClient() {
  const pk = process.env.RP_SIGNING_KEY as `0x${string}`;
  const account = privateKeyToAccount(pk);
  return createWalletClient({
    account,
    chain: worldchain,
    transport: http(RPC_URL),
  });
}

export async function checkInOnChain(
  campaignId: bigint,
  root: bigint,
  nullifierHash: bigint,
  proof: readonly bigint[],
) {
  const wallet = getWalletClient();
  const hash = await wallet.writeContract({
    address: CAMPAIGN_ESCROW_ADDRESS,
    abi: CAMPAIGN_ESCROW_ABI,
    functionName: 'checkIn',
    args: [campaignId, root, nullifierHash, proof as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}
