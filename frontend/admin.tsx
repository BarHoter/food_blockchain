import React, { useEffect, useState } from 'react';

interface Actor {
  id: number;
  name: string;
  address: string;
}

function Admin(): JSX.Element {
  const [actors, setActors] = useState<Actor[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

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
      body: JSON.stringify({ name, address })
    });
    if (res.ok) {
      setName('');
      setAddress('');
      await loadActors();
    }
  }

  async function saveActor(a: Actor) {
    await fetch(`/api/actors/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: a.name, address: a.address })
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
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="Address"
        />
        <button type="submit">Add</button>
      </form>
      <ul className="actor-list">
        {actors.map(a => (
          <li key={a.id} className="actor-item">
            <input
              value={a.name}
              onChange={e => changeActor(a.id, 'name', e.target.value)}
            />
            <input
              value={a.address}
              onChange={e => changeActor(a.id, 'address', e.target.value)}
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
