import { auth } from '@/auth';
import { Page } from '@/components/PageLayout';

export default async function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    console.log('Not authenticated');
  }

  return (
    <Page>
      {children}
    </Page>
  );
}
