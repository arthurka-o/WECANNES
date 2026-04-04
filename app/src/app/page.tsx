import { auth } from '@/auth';
import { Page } from '@/components/PageLayout';
import { redirect } from 'next/navigation';
import { AuthButton } from '../components/AuthButton';

export default async function Home() {
  const session = await auth();
  if (session) redirect('/home');

  return (
    <Page>
      <Page.Main className="flex flex-col items-center justify-center">
        <AuthButton />
      </Page.Main>
    </Page>
  );
}
