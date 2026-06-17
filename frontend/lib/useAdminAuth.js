import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { adminApi } from './adminApi';

export function useAdminAuth() {
  const router = useRouter();
  const [status, setStatus] = useState('checking'); // checking | authenticated | unauthenticated
  const [username, setUsername] = useState(null);

  useEffect(() => {
    let cancelled = false;

    adminApi
      .me()
      .then((data) => {
        if (cancelled) return;
        setUsername(data.username);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('unauthenticated');
        router.replace('/login/');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return { status, username };
}
