'use client';

import { useEffect, useState } from 'react';
import { AssistantClient } from '@ai-assistant/sdk';

const client = new AssistantClient(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
);

export default function DashboardPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<{ user?: { email: string } } | null>(null);
  const [automations, setAutomations] = useState<unknown[]>([]);
  const [memory, setMemory] = useState<unknown[]>([]);

  useEffect(() => {
    client.getSession().then(setSession);
  }, []);

  const signIn = async () => {
    const s = await client.signIn(email, password);
    setSession(s);
  };

  const loadData = async () => {
    const [autoRes, memRes] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/automations`, {
        credentials: 'include',
      }),
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/memory`, {
        credentials: 'include',
      }),
    ]);
    setAutomations(await autoRes.json());
    setMemory(await memRes.json());
  };

  return (
    <main style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h1>AI Assistant Dashboard</h1>

      {!session?.user ? (
        <section style={{ marginTop: 24 }}>
          <h2>Sign in</h2>
          <input
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: 'block', marginBottom: 8, padding: 8, width: 300 }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ display: 'block', marginBottom: 8, padding: 8, width: 300 }}
          />
          <button onClick={signIn}>Sign in</button>
        </section>
      ) : (
        <>
          <p>Signed in as {session.user.email}</p>
          <button onClick={loadData} style={{ marginTop: 16 }}>
            Load memory & automations
          </button>
          <section style={{ marginTop: 24 }}>
            <h2>Automations</h2>
            <pre>{JSON.stringify(automations, null, 2)}</pre>
          </section>
          <section style={{ marginTop: 24 }}>
            <h2>Memory</h2>
            <pre>{JSON.stringify(memory, null, 2)}</pre>
          </section>
        </>
      )}
    </main>
  );
}
