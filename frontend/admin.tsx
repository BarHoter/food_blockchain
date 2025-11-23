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
  const [onchainItemsMap, setOnchainItemsMap] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [contractAddress, setContractAddress] = useState<string>(
    window.CONTRACT_ADDRESS || ''
  );
  const [adminAddress, setAdminAddress] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [networkName, setNetworkName] = useState('');
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
  const [syncingActors, setSyncingActors] = useState(false);
  const [syncingItems, setSyncingItems] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshingIndex, setRefreshingIndex] = useState(false);
  const [transferChanges, setTransferChanges] = useState<any[]>([]);

  function formatNetwork(n: ethers.Network): string {
    if (!n) return '';
    if (n.name && n.name !== 'unknown') return n.name;
    return `chainId ${n.chainId}`;
  }

  function shortAddress(addr: string, visible = 6) {
    if (!addr) return '';
    if (addr.length <= visible * 2) return addr;
    return `${addr.slice(0, visible)}…${addr.slice(-visible)}`;
  }

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
    loadChanges();
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
    // Ensure index is fresh before loading on-chain lists
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
      try {
        const res2 = await fetch('/indexer/items-map.json');
        const data2 = res2.ok ? await res2.json() : {};
        setOnchainItemsMap(data2 || {});
      } catch (_) { setOnchainItemsMap({}); }
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

  async function loadChanges() {
    try {
      const res = await fetch('/api/transfer-changes');
      if (!res.ok) return;
      const list = await res.json();
      setTransferChanges(list);
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

  async function syncMissingActors() {
    if (!dbStatus.connected) {
      window.showToast?.('Database not connected');
      return;
    }
    setSyncingActors(true);
    try {
      const res = await fetch('/api/actors/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const count = data?.inserted || 0;
        if (count > 0) {
          window.showToast?.(`Imported ${count} actor${count === 1 ? '' : 's'} from on-chain approvals`);
        } else {
          window.showToast?.('Database already includes all on-chain actors');
        }
        await loadActors();
        await loadDbStatus();
      } else {
        window.showToast?.(data?.error || 'Failed to sync actors');
      }
    } catch (_) {
      window.showToast?.('Failed to sync actors');
    } finally {
      setSyncingActors(false);
    }
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
    const s = await p.getSigner();
    setSigner(s);
    try {
      setWalletAddress(await s.getAddress());
      const net = await p.getNetwork();
      setNetworkName(formatNetwork(net));
    } catch {
      setWalletAddress('');
      setNetworkName('');
    }
    window.showToast?.('Wallet connected');
  }

  async function loadContract() {
    if (!ethers.isAddress(contractAddress)) {
      window.showToast?.('Invalid contract address');
      setAdminAddress('');
      return;
    }
    const runner = signer || readProvider;
    const c = new ethers.Contract(contractAddress, abi, runner);
    const required = ['addActor', 'removeActor', 'isActor'];
    const ok = required.every(fn => typeof (c as any)[fn] === 'function');
    if (!ok) {
      setStatusMsg('Contract mismatch');
      setAdminAddress('');
      return;
    }
    setContract(c);
    setStatusMsg(signer ? 'Contract loaded' : 'Contract loaded (read-only)');
    window.showToast?.('Contract loaded');
    try {
      const onchainAdmin = await c.admin();
      setAdminAddress(onchainAdmin);
      try {
        const net = await runner.getNetwork();
        setNetworkName(formatNetwork(net));
      } catch (_) { /* ignore network fetch errors */ }
    } catch (_) {
      setAdminAddress('');
    }
  }

  const missingActorCount = onchainList.filter(addr =>
    !actors.some(a => (a.blockchain_address || '').toLowerCase() === addr)
  ).length;
  const syncButtonLabel = syncingActors
    ? 'Syncing...'
    : missingActorCount > 0
      ? `Import ${missingActorCount} missing actor${missingActorCount === 1 ? '' : 's'}`
      : 'Sync on-chain actors';

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

  const walletIsAdmin =
    adminAddress &&
    walletAddress &&
    adminAddress.toLowerCase() === walletAddress.toLowerCase();
  const connectionRole = walletAddress ? (walletIsAdmin ? 'admin' : 'user') : 'read-only';

  async function syncBatchItems() {
    if (!dbStatus.connected) {
      window.showToast?.('Database not connected');
      return;
    }
    setSyncingItems(true);
    try {
      const res = await fetch('/api/items/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        const added = data.inserted || 0;
        const updated = data.updated || 0;
        const created = data.itemsCreated || 0;
        window.showToast?.(
          `Synced batch→item links (${added} new, ${updated} updated, ${created} items created)`
        );
        await loadItems();
        // refresh map view
        try {
          const res2 = await fetch('/indexer/items-map.json');
          const data2 = res2.ok ? await res2.json() : {};
          setOnchainItemsMap(data2 || {});
        } catch (_) { /* ignore */ }
      } else {
        window.showToast?.(data.error || 'Failed to sync items');
      }
    } catch (_) {
      window.showToast?.('Failed to sync items');
    } finally {
      setSyncingItems(false);
    }
  }

  async function exportTransfersCsv() {
    setExporting(true);
    try {
      const res = await fetch('/api/transfers.csv');
      if (!res.ok) {
        window.showToast?.('Failed to export transfers');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transfers.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (_) {
      window.showToast?.('Failed to export transfers');
    } finally {
      setExporting(false);
    }
  }

  async function exportChangesCsv() {
    try {
      const res = await fetch('/api/transfer-changes.csv');
      if (!res.ok) {
        window.showToast?.('Failed to export changes');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transfer-changes.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (_) {
      window.showToast?.('Failed to export changes');
    }
  }

  const formattedChanges = transferChanges.map(ch => ({
    ...ch,
    when: ch.block_time ? new Date(Number(ch.block_time) * 1000).toLocaleString() : '',
  }));

  function flowGraph() {
    if (!transferChanges.length) return null;
    const edgesMap = new Map<string, { sender: string; recipient: string; qty: number }>();
    const actorsSet = new Set<string>();
    transferChanges.forEach(ch => {
      const s = (ch.sender || '').toLowerCase();
      const r = (ch.recipient || '').toLowerCase();
      const qty = Number(ch.quantity) || 0;
      if (!s || !r) return;
      actorsSet.add(s);
      actorsSet.add(r);
      const key = `${s}|${r}`;
      const existing = edgesMap.get(key);
      edgesMap.set(key, { sender: s, recipient: r, qty: (existing?.qty || 0) + qty });
    });
    if (!edgesMap.size) return null;
    const actors = Array.from(actorsSet);
    actors.sort();
    const width = 900;
    const height = 260;
    const x = (addr: string) => {
      const idx = actors.indexOf(addr);
      if (idx === -1) return width / 2;
      if (actors.length === 1) return width / 2;
      return 60 + (idx / Math.max(1, actors.length - 1)) * (width - 120);
    };
    const y = (addr: string) => {
      return height / 2 + ((actors.indexOf(addr) % 2 === 0) ? -30 : 30);
    };
    const maxQty = Math.max(...Array.from(edgesMap.values()).map(e => Math.abs(e.qty)), 1);
    const edges = Array.from(edgesMap.values());
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="flow-graph">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L10,5 L0,10 z" fill="#0ea5e9" />
          </marker>
        </defs>
        <g>
          {edges.map((e, idx) => {
            const sx = x(e.sender);
            const sy = y(e.sender);
            const rx = x(e.recipient);
            const ry = y(e.recipient);
            const stroke = Math.max(2, (Math.abs(e.qty) / maxQty) * 14);
            return (
              <line
                key={`${e.sender}-${e.recipient}-${idx}`}
                x1={sx}
                y1={sy}
                x2={rx}
                y2={ry}
                stroke="#0ea5e9"
                strokeWidth={stroke}
                opacity="0.75"
                markerEnd="url(#arrow)"
              />
            );
          })}
          {actors.map(addr => (
            <g key={addr}>
              <circle cx={x(addr)} cy={y(addr)} r={16} fill="#0f172a" stroke="#0ea5e9" strokeWidth="3" />
              <text x={x(addr)} y={y(addr) + 4} textAnchor="middle" fontSize="10" fill="#e2e8f0">
                {shortAddress(addr, 4)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    );
  }

  function inventoryGraph() {
    if (!transferChanges.length) return null;
    const points = transferChanges
      .filter(ch => ch.block_time && ch.quantity !== null && ch.quantity !== undefined)
      .slice(-40);
    if (!points.length) return null;
    const times = points.map(p => Number(p.block_time) * 1000);
    const qtys = points.map(p => Math.abs(Number(p.quantity) || 0));
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const maxAbs = Math.max(...qtys, 1);
    const width = 820;
    const height = 240;
    const x = (t: number) => {
      if (maxT === minT) return width / 2;
      return ((t - minT) / (maxT - minT)) * (width - 60) + 30;
    };
    const y = (q: number) => {
      const pad = maxAbs * 0.2;
      return height / 2 - ((q) / (maxAbs + pad)) * (height / 2 - 20);
    };
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="flow-graph">
        <g>
          <line x1={30} y1={height / 2} x2={width - 20} y2={height / 2} stroke="#cbd5e1" strokeWidth="1" />
          {points.map((p, idx) => {
            const q = Number(p.quantity) || 0;
            const cx = x(Number(p.block_time) * 1000);
            const posY = y(Math.abs(q));
            const negY = height - posY;
            return (
              <g key={`${p.tx_hash}-${p.log_index}-inv-${idx}`}>
                <rect
                  x={cx - 6}
                  y={q >= 0 ? posY : height / 2}
                  width={12}
                  height={Math.abs((height / 2) - posY)}
                  fill={q >= 0 ? '#22c55e' : '#ef4444'}
                  opacity="0.85"
                />
                <rect
                  x={cx + 6}
                  y={q >= 0 ? height / 2 : posY}
                  width={12}
                  height={Math.abs((height / 2) - posY)}
                  fill={q >= 0 ? '#0ea5e9' : '#fb7185'}
                  opacity="0.7"
                />
                <text x={cx + 10} y={posY - 6} fontSize="10" fill="#334155">
                  {shortAddress(p.sender || '', 3)} → {shortAddress(p.recipient || '', 3)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    );
  }

  async function refreshIndex() {
    setRefreshingIndex(true);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        window.showToast?.(data.error || 'Index refresh failed');
      } else {
        window.showToast?.('Index refreshed');
      }
      await loadActors();
      await loadItems();
      try {
        const res2 = await fetch('/indexer/actors.json');
        const data2 = res2.ok ? await res2.json() : { addresses: [] };
        setOnchainList((data2.addresses || []).map((a: string) => a.toLowerCase()));
      } catch (_) { /* ignore */ }
      try {
        const res3 = await fetch('/indexer/items-map.json');
        const data3 = res3.ok ? await res3.json() : {};
        setOnchainItemsMap(data3 || {});
      } catch (_) { /* ignore */ }
    } catch (_) {
      window.showToast?.('Index refresh failed');
    } finally {
      setRefreshingIndex(false);
    }
    await loadChanges();
  }

  return (
    <div className="admin-page">
      <header className="admin-hero">
        <div>
          <p className="eyebrow">Admin console</p>
          <h2 className="hero-title">Govern the network</h2>
          <p className="subtitle">Manage actors, items, contract links, and exports.</p>
        </div>
        <div className="hero-actions">
          <button onClick={connectWallet}>Connect Wallet</button>
          <button className="ghost" onClick={loadContract}>Load Contract</button>
        </div>
      </header>

      <section className="summary-grid">
        <div className="summary-card">
          <div className="label">Connection</div>
          <div className="value">{networkName || 'unknown network'} · {connectionRole}</div>
          <div className="muted">
            {walletAddress ? (
              <>
                <code>{shortAddress(walletAddress, 6)}</code>
                {walletIsAdmin ? <span className="pill success">admin</span> : null}
              </>
            ) : 'No wallet connected'}
          </div>
        </div>
        <div className="summary-card">
          <div className="label">Contract</div>
          <div className="value">{contractAddress ? <code>{shortAddress(contractAddress, 6)}</code> : 'set address'}</div>
          <div className="muted">
            {statusMsg || 'Not loaded'}
            {adminAddress ? (
              <>
                {' · admin '}<code>{shortAddress(adminAddress, 6)}</code>
                {walletIsAdmin ? <span className="pill success">you</span> : null}
              </>
            ) : null}
          </div>
        </div>
        <div className="summary-card">
          <div className="label">Database</div>
          <div className="value">
            {dbStatus.connected ? 'Connected' : 'Not connected'}
            {dbStatus.configured ? '' : ' · not configured'}
          </div>
          <div className="muted">
            {dbStatus.source || 'default'} {dbStatus.ssl ? '· SSL' : ''}
            {dbStatus.error ? <span style={{ color: '#b00', marginLeft: '0.35rem' }}>({dbStatus.error})</span> : null}
          </div>
        </div>
        <div className="summary-card actions">
          <div className="label">Shortcuts</div>
          <div className="actions-inline">
            <button onClick={exportTransfersCsv} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button className="ghost" onClick={refreshIndex} disabled={refreshingIndex}>
              {refreshingIndex ? 'Refreshing…' : 'Refresh index'}
            </button>
            <button className="ghost" onClick={exportChangesCsv}>
              Export changes
            </button>
          </div>
          <div className="muted">Export transfers and manually refresh the indexer.</div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Network & Contract</p>
            <h3 className="section-title">Control plane</h3>
          </div>
        </div>
        <div className="contract-row">
          <input
            value={contractAddress}
            onChange={e => setContractAddress(e.target.value)}
            placeholder="Contract Address"
            size={42}
          />
          <button onClick={loadContract}>Load Contract</button>
          <span className="muted inline">{statusMsg}</span>
        </div>
        <div className="badge-row">
          <span className="pill">Admin: {adminAddress ? shortAddress(adminAddress, 6) : 'unknown'}</span>
          <span className="pill">DB: {dbStatus.connected ? 'ready' : 'not ready'}</span>
          <span className="pill">{indexing ? 'indexing…' : 'index cached'}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Actors</p>
            <h3 className="section-title">Manage participants</h3>
          </div>
          <button onClick={syncMissingActors} disabled={syncingActors || !dbStatus.connected}>
            {syncButtonLabel}
          </button>
        </div>
        <form onSubmit={createActor} className="form-grid">
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
          <div className="form-actions">
            <button type="submit" disabled={!dbStatus.connected}>Add actor</button>
          </div>
        </form>
        <div className="list">
          {actors.length === 0 ? <div className="muted">No actors in DB</div> : null}
          {actors.map(a => (
            <div key={a.id} className="card-row">
              <div className="stack">
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
              </div>
              <div className="stack">
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
              </div>
              <div className="row-actions">
                <button onClick={() => saveActor(a)}>Save</button>
                <button className="ghost" onClick={() => deleteActor(a.id)}>Delete</button>
                {loadingAddr === a.blockchain_address ? (
                  <span className="spinner" />
                ) : chainActors[a.blockchain_address] ? (
                  <button className="ghost" onClick={() => revoke(a.blockchain_address)}>Revoke</button>
                ) : (
                  <button onClick={() => approve(a.blockchain_address)}>Approve</button>
                )}
                <span className="pill muted">
                  {chainActors[a.blockchain_address] ? 'approved' : 'not approved'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">On-chain</p>
            <h3 className="section-title">Approval registry {indexing ? '(refreshing...)' : ''}</h3>
          </div>
        </div>
        <ul className="authorized-list">
          {onchainList.length ? (
            onchainList.map(addr => {
              const match = actors.find(a => a.blockchain_address.toLowerCase() === addr);
              const name = match?.name || '';
              return (
                <li key={addr} className="inline-row">
                  <code>{addr}</code>
                  {name ? <> — {name}</> : null}
                  <span className="pill muted">
                    {match ? 'in DB' : 'not in DB'}
                  </span>
                </li>
              );
            })
          ) : (
            <li>None</li>
          )}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Batch → Item</p>
            <h3 className="section-title">Link map {indexing ? '(refreshing...)' : ''}</h3>
          </div>
          <button onClick={syncBatchItems} disabled={syncingItems || !dbStatus.connected}>
            {syncingItems ? 'Syncing…' : 'Sync to DB'}
          </button>
        </div>
        <ul className="authorized-list">
          {Object.keys(onchainItemsMap).length ? (
            Object.entries(onchainItemsMap).map(([batch, item]) => (
              <li key={batch} className="inline-row">
                <code>{batch}</code>
                <span> → </span>
                <code>{item}</code>
              </li>
            ))
          ) : (
            <li>None</li>
          )}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Transfers</p>
            <h3 className="section-title">Change log</h3>
          </div>
          <span className="muted">{formattedChanges.length} change(s)</span>
        </div>
        <div className="table-scroll">
          <table className="changes-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Transfer</th>
                <th>Flow</th>
                <th>Item</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {formattedChanges.map(change => (
                <tr key={`${change.tx_hash}-${change.log_index}`}>
                  <td>{change.when}</td>
                  <td>{change.event}</td>
                  <td>{change.transfer_id}</td>
                  <td>
                    <div className="inline-row">
                      <code>{shortAddress(change.sender || '', 4)}</code>
                      <span>→</span>
                      <code>{shortAddress(change.recipient || '', 4)}</code>
                    </div>
                  </td>
                  <td>{change.item_id ? <>{change.item_id}</> : ''}</td>
                  <td>{change.quantity ?? ''}</td>
                </tr>
              ))}
              {formattedChanges.length === 0 ? (
                <tr><td colSpan={6}>No changes yet</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Flow</p>
            <h3 className="section-title">Item movement over time</h3>
          </div>
        </div>
        {flowGraph() || <div className="muted">No data to plot yet.</div>}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Inventory</p>
            <h3 className="section-title">Per-actor quantity changes</h3>
          </div>
        </div>
        {inventoryGraph() || <div className="muted">No inventory deltas yet.</div>}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Items</p>
            <h3 className="section-title">Catalog</h3>
          </div>
          <span className="muted">{items.length} item(s)</span>
        </div>
        <form onSubmit={createItem} className="form-grid">
          <input value={newItem.item_id || ''} onChange={e => setNewItem({ ...newItem, item_id: e.target.value })} placeholder="Item ID" />
          <input value={newItem.name || ''} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="Name" />
          <input value={newItem.protein ?? ''} onChange={e => setNewItem({ ...newItem, protein: e.target.value ? Number(e.target.value) : undefined })} placeholder="Protein" type="number" step="0.01" />
          <input value={newItem.carbs ?? ''} onChange={e => setNewItem({ ...newItem, carbs: e.target.value ? Number(e.target.value) : undefined })} placeholder="Carbs" type="number" step="0.01" />
          <input value={newItem.fat ?? ''} onChange={e => setNewItem({ ...newItem, fat: e.target.value ? Number(e.target.value) : undefined })} placeholder="Fat" type="number" step="0.01" />
          <input value={newItem.unit || ''} onChange={e => setNewItem({ ...newItem, unit: e.target.value })} placeholder="Unit (e.g., kg, units)" />
          <div className="form-actions">
            <button type="submit" disabled={!dbStatus.connected}>Add Item</button>
          </div>
        </form>
        <div className="list">
          {items.map(row => (
            <div key={row.item_id} className="card-row">
              <code style={{ minWidth: '12ch' }}>{row.item_id}</code>
              <input value={row.name || ''} onChange={e => setItems(items.map(r => r.item_id === row.item_id ? { ...r, name: e.target.value } : r))} placeholder="Name" />
              <input value={row.protein ?? ''} onChange={e => setItems(items.map(r => r.item_id === row.item_id ? { ...r, protein: e.target.value ? Number(e.target.value) : undefined } : r))} placeholder="Protein" type="number" step="0.01" />
              <input value={row.carbs ?? ''} onChange={e => setItems(items.map(r => r.item_id === row.item_id ? { ...r, carbs: e.target.value ? Number(e.target.value) : undefined } : r))} placeholder="Carbs" type="number" step="0.01" />
              <input value={row.fat ?? ''} onChange={e => setItems(items.map(r => r.item_id === row.item_id ? { ...r, fat: e.target.value ? Number(e.target.value) : undefined } : r))} placeholder="Fat" type="number" step="0.01" />
              <input value={row.unit || ''} onChange={e => setItems(items.map(r => r.item_id === row.item_id ? { ...r, unit: e.target.value } : r))} placeholder="Unit" />
              <div className="row-actions">
                <button onClick={() => saveItem(row)}>Save</button>
                <button className="ghost" onClick={() => deleteItem(row.item_id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Admin;
