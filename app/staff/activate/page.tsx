import { Suspense } from 'react';
import ActivationForm from './ActivationForm';

export default function Page() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, fontFamily: 'system-ui' }}>Loading activation…</main>}>
      <ActivationForm />
    </Suspense>
  );
}
