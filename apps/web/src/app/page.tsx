'use client';

import { AuthGate } from '@/components/AuthGate';
import { SubjectExplorer } from '@/components/SubjectExplorer';

export default function HomePage() {
  return (
    <AuthGate>
      <SubjectExplorer />
    </AuthGate>
  );
}
