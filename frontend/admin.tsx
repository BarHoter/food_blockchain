import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { abi } from './abi.js';

interface Actor {
  id: number;
  name: string;
  physical_address: string;
  blockchain_address: string;
  logo_url: string;
}

interface ItemRow {
  item_id: string;
  name?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  unit?: string;
}

function Admin(): JSX.Element {
  const [actors, setActors] = useState<Actor[]>([]);
  const [chainActors, setChainActors] = useState<Record<string, boolean>>({});
  const [indexing, setIndexing] = useState<boolean>(false);
  const [dbStatus, setDbStatus] = useState<{ configured: boolean; source?: string; maskedUrl?: string; ssl?: boolean; connected?: boolean; error?: string }>({ configured: false });
  const [onchainList, setOnchainList] = useState<string[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [contractAddress, setContractAddress] = useState<string>(
    window.CONTRACT_ADDRESS || ''
  );
  const readProvider = new ethers.JsonRpcProvider(
    window.PROVIDER_URL || 'http://localhost:8545'
  );
  const [loadingAddr, setLoadingAddr] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [name, setName] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [blockchainAddress, setBlockchainAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [newItem, setNewItem] = useState<ItemRow>({ item_id: '', name: '', protein: undefined, carbs: undefined, fat: undefined, unit: '' });

  function parseError(err: any): string {
    if (!err) return 'Transaction failed';
    if (err.shortMessage) return err.shortMessage;
    if (err.error && err.error.message) return err.error.message;
    if (err.message) return err.message;
    return 'Transaction failed';
  }

  // automatically load the default contract in either read-only or signer mode
  useEffect(() => {
    if (ethers.isAddress(contractAddress)) {
      loadContract();
    }
  }, [contractAddress, signer]);

  useEffect(() => {
    loadActors();
  }, [contract, contractAddress]);

  useEffect(() => {
    // Fetch DB status once on mount and after actor ops
    loadDbStatus();
    loadItems();
  }, []);

  async function loadDbStatus() {
    try {
      const res = await fetch('/api/db-status');
      const data = await res.json();
      setDbStatus(data);
    } catch (_) {
      setDbStatus({ configured: false, connected: false });
    }
  }

  useEffect(() => {
    // Ensure index is fresh before loading on-chain list
    const refreshThenLoad = async () => {
      try {
        setIndexing(true);
        await fetch('/api/refresh', { method: 'POST' });
      } catch (_) {}
      try {
        const res = await fetch('/indexer/actors.json');
        const data = res.ok ? await res.json() : { addresses: [] };
        setOnchainList((data.addresses || []).map((a: string) => a.toLowerCase()));
      } catch (_) {
        setOnchainList([]);
      } finally {
        setIndexing(false);
      }
    };
    refreshThenLoad();
  }, [contractAddress]);


  async function loadActors() {
    const res = await fetch('/api/actors');
    if (!res.ok) return;
    const list = await res.json();
    setActors(list);

    const addr = contractAddress;
    if (!ethers.isAddress(addr)) {
      setChainActors({});
      return;
    }

    // use the loaded contract when available to support external providers
    const readContract =
      contract || new ethers.Contract(addr, abi, signer || readProvider);
    const statuses: Record<string, boolean> = {};
    for (const a of list) {
      try {
        statuses[a.blockchain_address] = await readContract.isActor(a.blockchain_address);
      } catch (_) {
        statuses[a.blockchain_address] = false;
      }
    }
    setChainActors(statuses);
  }

  async function loadItems() {
    try {
      const res = await fetch('/api/items');
      if (!res.ok) return;
      const list = await res.json();
      setItems(list);
    } catch (_) { /* ignore */ }
  }

  async function createActor(e: React.FormEvent) {
    e.preventDefault();
    if (!dbStatus.connected) {
      window.showToast?.('Database not connected');
      return;
    }
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
      await loadDbStatus();
    } else {
      try {
        const data = await res.json();
        window.showToast?.(data.error || 'Failed to add actor');
      } catch (_) {
        window.showToast?.('Failed to add actor');
      }
    }
  }

  async function saveActor(a: Actor) {
    const res = await fetch(`/api/actors/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: a.name,
        physical_address: a.physical_address,
        blockchain_address: a.blockchain_address,
        logo_url: a.logo_url
      })
    });
    if (res.ok) {
      await loadActors();
    } else {
      try {
        const data = await res.json();
        window.showToast?.(data.error || 'Failed to save actor');
      } catch (_) {
        window.showToast?.('Failed to save actor');
      }
    }
  }

  async function deleteActor(id: number) {
    await fetch(`/api/actors/${id}`, { method: 'DELETE' });
    await loadActors();
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.item_id) {
      window.showToast?.('item_id is required');
      return;
    }
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    });
    if (res.ok) {
      setNewItem({ item_id: '', name: '', protein: undefined, carbs: undefined, fat: undefined, unit: '' });
      await loadItems();
      window.showToast?.('Item added');
    } else {
      try { const data = await res.json(); window.showToast?.(data.error || 'Failed to add item'); } catch { window.showToast?.('Failed to add item'); }
    }
  }

  async function saveItem(row: ItemRow) {
    const res = await fetch(`/api/items/${encodeURIComponent(row.item_id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: row.name, protein: row.protein, carbs: row.carbs, fat: row.fat, unit: row.unit })
    });
    if (res.ok) {
      await loadItems();
      window.showToast?.('Item saved');
    } else {
      try { const data = await res.json(); window.showToast?.(data.error || 'Failed to save item'); } catch { window.showToast?.('Failed to save item'); }
    }
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) { await loadItems(); window.showToast?.('Item deleted'); }
  }

  function changeActor(id: number, field: keyof Actor, value: string) {
    setActors(actors.map(a => (a.id === id ? { ...a, [field]: value } : a)));
  }

  async function connectWallet() {
    if (!window.ethereum) {
      window.showToast?.('MetaMask not detected');
      return;
    }
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    const p = new ethers.BrowserProvider(window.ethereum);
    setProvider(p);
    setSigner(await p.getSigner());
    window.showToast?.('Wallet connected');
  }

  function loadContract() {
    if (!ethers.isAddress(contractAddress)) {
      window.showToast?.('Invalid contract address');
      return;
    }
    const runner = signer || readProvider;
    const c = new ethers.Contract(contractAddress, abi, runner);
    const required = ['addActor', 'removeActor', 'isActor'];
    const ok = required.every(fn => typeof (c as any)[fn] === 'function');
    if (!ok) {
      setStatusMsg('Contract mismatch');
      return;
    }
    setContract(c);
    setStatusMsg(signer ? 'Contract loaded' : 'Contract loaded (read-only)');
    window.showToast?.('Contract loaded');
  }

  async function approve(addr: string) {
    if (!contract || !signer) {
      window.showToast?.('Connect wallet and load contract first');
      return;
    }
    try {
      setLoadingAddr(addr);
      const tx = await contract.addActor(addr);
      await tx.wait();
      window.showToast?.('Actor approved');
      await loadActors();
    } catch (err: any) {
      console.error('approve failed', err);
      window.showToast?.(parseError(err));
    } finally {
      setLoadingAddr(null);
    }
  }

  async function revoke(addr: string) {
    if (!contract || !signer) {
      window.showToast?.('Connect wallet and load contract first');
      return;
    }
    try {
      setLoadingAddr(addr);
      const tx = await contract.removeActor(addr);
      await tx.wait();
      window.showToast?.('Actor revoked');
      await loadActors();
    } catch (err: any) {
      console.error('revoke failed', err);
      window.showToast?.(parseError(err));
    } finally {
      setLoadingAddr(null);
    }
  }

  return (
    <div>
      <h2>Manage Actors</h2>
      <button onClick={connectWallet}>Connect Wallet</button>
      <div className="contract-controls">
        <input
          value={contractAddress}
          onChange={e => setContractAddress(e.target.value)}
          placeholder="Contract Address"
          size={42}
        />
        <button onClick={loadContract}>Load Contract</button>
        <span style={{ marginLeft: '0.5rem' }}>{statusMsg}</span>
      </div>
      <div className="db-status" style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
        <strong>DB:</strong>{' '}
        {dbStatus.configured ? (
          <>
            {dbStatus.source || 'default'} | {dbStatus.maskedUrl || ''} | SSL {dbStatus.ssl ? 'on' : 'off'} |{' '}
            {dbStatus.connected ? 'connected' : 'not connected'}
            {!dbStatus.connected && dbStatus.error ? (
              <span style={{ marginLeft: '0.5rem', color: '#b00' }}>({dbStatus.error})</span>
            ) : null}
          </>
        ) : (
          <>not configured</>
        )}
      </div>
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
        <button type="submit" disabled={!dbStatus.connected}>Add</button>
      </form>
      <h3>Database Actors (checked on-chain)</h3>
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
            {loadingAddr === a.blockchain_address ? (
              <span className="spinner" />
            ) : chainActors[a.blockchain_address] ? (
              <button onClick={() => revoke(a.blockchain_address)}>Revoke</button>
            ) : (
              <button onClick={() => approve(a.blockchain_address)}>Approve</button>
            )}
            <span style={{ marginLeft: '0.5rem' }}>
              {chainActors[a.blockchain_address] ? 'approved' : 'not approved'}
            </span>
          </li>
        ))}
      </ul>

      <h3>On-chain Actors (checked in DB) {indexing ? '(refreshing...)' : ''}</h3>
      <ul className="authorized-list">
        {onchainList.length ? (
          onchainList.map(addr => {
            const match = actors.find(a => a.blockchain_address.toLowerCase() === addr);
            const name = match?.name || '';
            return (
              <li key={addr}>
                <code>{addr}</code>
                {name ? <> — {name}</> : null}
                <span style={{ marginLeft: '0.5rem' }}>
                  {match ? 'in DB' : 'not in DB'}
                </span>
              </li>
            );
          })
        ) : (
          <li>None</li>
        )}
      </ul>

      <h2 style={{ marginTop: '2rem' }}>Items</h2>
      <form onSubmit={createItem} className="actor-form">
        <input value={newItem.item_id || ''} onChange={e => setNewItem({ ...newItem, item_id: e.target.value })} placeholder="Item ID" />
        <input value={newItem.name || ''} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="Name" />
        <input value={newItem.protein ?? ''} onChange={e => setNewItem({ ...newItem, protein: e.target.value ? Number(e.target.value) : undefined })} placeholder="Protein" type="number" step="0.01" />
        <input value={newItem.carbs ?? ''} onChange={e => setNewItem({ ...newItem, carbs: e.target.value ? Number(e.target.value) : undefined })} placeholder="Carbs" type="number" step="0.01" />
        <input value={newItem.fat ?? ''} onChange={e => setNewItem({ ...newItem, fat: e.target.value ? Number(e.target.value) : undefined })} placeholder="Fat" type="number" step="0.01" />
        <input value={newItem.unit || ''} onChange={e => setNewItem({ ...newItem, unit: e.target.value })} placeholder="Unit (e.g., kg, units)" />
        <button type="submit" disabled={!dbStatus.connected}>Add Item</button>
      </form>
      <ul className="actor-list">
        {items.map(row => (
          <li key={row.item_id} className="actor-item">
            <code style={{ minWidth: '12ch' }}>{row.item_id}</code>
            <input value={row.name || ''} onChange={e => setItems(items.map(r => r.item_id === row.item_id ? { ...r, name: e.target.value } : r))} placeholder="Name" />
            <input value={row.protein ?? ''} onChange={e => setItems(items.map(r => r.item_id === row.item_id ? { ...r, protein: e.target.value ? Number(e.target.value) : undefined } : r))} placeholder="Protein" type="number" step="0.01" />
            <input value={row.carbs ?? ''} onChange={e => setItems(items.map(r => r.item_id === row.item_id ? { ...r, carbs: e.target.value ? Number(e.target.value) : undefined } : r))} placeholder="Carbs" type="number" step="0.01" />
            <input value={row.fat ?? ''} onChange={e => setItems(items.map(r => r.item_id === row.item_id ? { ...r, fat: e.target.value ? Number(e.target.value) : undefined } : r))} placeholder="Fat" type="number" step="0.01" />
            <input value={row.unit || ''} onChange={e => setItems(items.map(r => r.item_id === row.item_id ? { ...r, unit: e.target.value } : r))} placeholder="Unit" />
            <button onClick={() => saveItem(row)}>Save</button>
            <button onClick={() => deleteItem(row.item_id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Admin;
