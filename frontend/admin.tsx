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

function Admin(): JSX.Element {
  const [actors, setActors] = useState<Actor[]>([]);
  const [chainActors, setChainActors] = useState<Record<string, boolean>>({});
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [contractAddress, setContractAddress] = useState<string>(window.CONTRACT_ADDRESS || '');
  const [statusMsg, setStatusMsg] = useState('');
  const [name, setName] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [blockchainAddress, setBlockchainAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  function parseError(err: any): string {
    if (!err) return 'Transaction failed';
    if (err.shortMessage) return err.shortMessage;
    if (err.error && err.error.message) return err.error.message;
    if (err.message) return err.message;
    return 'Transaction failed';
  }

  useEffect(() => {
    loadActors();
  }, [contract]);

  async function loadActors() {
    const res = await fetch('/api/actors');
    if (res.ok) {
      const list = await res.json();
      setActors(list);
      if (contract) {
        const statuses: Record<string, boolean> = {};
        for (const a of list) {
          try {
            statuses[a.blockchain_address] = await contract.isActor(a.blockchain_address);
          } catch (_) {
            statuses[a.blockchain_address] = false;
          }
        }
        setChainActors(statuses);
      }
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
    if (!signer) return;
    if (!ethers.isAddress(contractAddress)) {
      window.showToast?.('Invalid contract address');
      return;
    }
    const c = new ethers.Contract(contractAddress, abi, signer);
    const required = ['addActor', 'removeActor', 'isActor'];
    const ok = required.every(fn => typeof (c as any)[fn] === 'function');
    if (!ok) {
      setStatusMsg('Contract mismatch');
      return;
    }
    setContract(c);
    setStatusMsg('Contract loaded');
    window.showToast?.('Contract loaded');
  }

  async function approve(addr: string) {
    if (!contract) {
      window.showToast?.('Load contract first');
      return;
    }
    try {
      const tx = await contract.addActor(addr);
      await tx.wait();
      window.showToast?.('Actor approved');
      await loadActors();
    } catch (err: any) {
      console.error('approve failed', err);
      window.showToast?.(parseError(err));
    }
  }

  async function revoke(addr: string) {
    if (!contract) {
      window.showToast?.('Load contract first');
      return;
    }
    try {
      const tx = await contract.removeActor(addr);
      await tx.wait();
      window.showToast?.('Actor revoked');
      await loadActors();
    } catch (err: any) {
      console.error('revoke failed', err);
      window.showToast?.(parseError(err));
    }
  }

  return (
    <div>
      <h2>Manage Actors</h2>
      <button onClick={connectWallet}>Connect Wallet</button>
      {signer && (
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
      )}
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
            {chainActors[a.blockchain_address] ? (
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
    </div>
  );
}

export default Admin;
