'use client';
import { walletAuth } from '@/auth/wallet';
import { Button, LiveFeedback } from '@worldcoin/mini-apps-ui-kit-react';
import { useMiniKit } from '@worldcoin/minikit-js/minikit-provider';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * This component is an example of how to authenticate a user
 * We will use Next Auth for this example, but you can use any auth provider
 * Read More: https://docs.world.org/mini-apps/commands/wallet-auth
 */
export const AuthButton = () => {
  const [isPending, setIsPending] = useState(false);
  const { isInstalled } = useMiniKit();
  const hasAttemptedAuth = useRef(false);
  const router = useRouter();

  const doAuth = useCallback(async () => {
    if (!isInstalled || isPending) return;
    setIsPending(true);
    try {
      await walletAuth();
      router.push('/home');
    } catch (error) {
      console.error('Wallet authentication error', error);
    } finally {
      setIsPending(false);
    }
  }, [isInstalled, isPending, router]);

  // Auto-authenticate on load when MiniKit is ready
  useEffect(() => {
    if (isInstalled === true && !hasAttemptedAuth.current) {
      hasAttemptedAuth.current = true;
      doAuth();
    }
  }, [isInstalled, doAuth]);

  return (
    <LiveFeedback
      label={{
        failed: 'Failed to login',
        pending: 'Logging in',
        success: 'Logged in',
      }}
      state={isPending ? 'pending' : undefined}
    >
      <Button
        onClick={doAuth}
        disabled={isPending}
        size="lg"
        variant="primary"
      >
        Login with Wallet
      </Button>
    </LiveFeedback>
  );
};
