import React, { useEffect, useState } from 'react';

interface Actor {
  id: number;
  name: string;
  physical_address: string;
  blockchain_address: string;
  logo_url: string;
}

function Admin(): JSX.Element {
  const [actors, setActors] = useState<Actor[]>([]);
  const [name, setName] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [blockchainAddress, setBlockchainAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    loadActors();
  }, []);

  async function loadActors() {
    const res = await fetch('/api/actors');
    if (res.ok) {
      setActors(await res.json());
    }
  }

  async function createActor(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/actors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        physical_address: physicalAddress,
        blockchain_address: blockchainAddress,
        logo_url: logoUrl
      })
    });
    if (res.ok) {
      setName('');
      setPhysicalAddress('');
      setBlockchainAddress('');
      setLogoUrl('');
      await loadActors();
    }
  }

  async function saveActor(a: Actor) {
    await fetch(`/api/actors/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: a.name,
        physical_address: a.physical_address,
        blockchain_address: a.blockchain_address,
        logo_url: a.logo_url
      })
    });
    await loadActors();
  }

  async function deleteActor(id: number) {
    await fetch(`/api/actors/${id}`, { method: 'DELETE' });
    await loadActors();
  }

  function changeActor(id: number, field: keyof Actor, value: string) {
    setActors(actors.map(a => (a.id === id ? { ...a, [field]: value } : a)));
  }

  return (
    <div>
      <h2>Manage Actors</h2>
      <form onSubmit={createActor} className="actor-form">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
        />
        <input
          value={physicalAddress}
          onChange={e => setPhysicalAddress(e.target.value)}
          placeholder="Physical Address"
        />
        <input
          value={blockchainAddress}
          onChange={e => setBlockchainAddress(e.target.value)}
          placeholder="Blockchain Address"
        />
        <input
          value={logoUrl}
          onChange={e => setLogoUrl(e.target.value)}
          placeholder="Logo URL"
        />
        <button type="submit">Add</button>
      </form>
      <ul className="actor-list">
        {actors.map(a => (
          <li key={a.id} className="actor-item">
            <input
              value={a.name}
              onChange={e => changeActor(a.id, 'name', e.target.value)}
              placeholder="Name"
            />
            <input
              value={a.physical_address}
              onChange={e => changeActor(a.id, 'physical_address', e.target.value)}
              placeholder="Physical Address"
            />
            <input
              value={a.blockchain_address}
              onChange={e => changeActor(a.id, 'blockchain_address', e.target.value)}
              placeholder="Blockchain Address"
            />
            <input
              value={a.logo_url}
              onChange={e => changeActor(a.id, 'logo_url', e.target.value)}
              placeholder="Logo URL"
            />
            <button onClick={() => saveActor(a)}>Save</button>
            <button onClick={() => deleteActor(a.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Admin;
