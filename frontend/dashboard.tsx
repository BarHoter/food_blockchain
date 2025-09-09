import { useState, useEffect } from 'react';
import { abi } from './abi.js';
import { ethers } from 'ethers';

interface IndexedEvent {
  blockNumber: number;
  event: string;
  args: any;
  finalized: boolean;
}

function Dashboard(): JSX.Element {
  const [checkpoint, setCheckpoint] = useState<string>('');
  const [events, setEvents] = useState<IndexedEvent[]>([]);
  const [auto, setAuto] = useState<boolean>(false);
  const [statusLists, setStatusLists] = useState({
    proposed: [] as bigint[],
    confirmed: [] as bigint[],
    shipped: [] as bigint[],
    received: [] as bigint[],
  });
  const [items, setItems] = useState<Array<{ item_id: string; name?: string; unit?: string }>>([]);
  const [meta, setMeta] = useState<Record<string, { batch?: string; itemId?: string; name?: string; unit?: string; qty?: bigint }>>({});

  useEffect(() => {
    loadCheckpoint();
    loadEvents();
    loadItems();
    loadStatuses();
  }, []);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(runIndexer, 5000);
    return () => clearInterval(t);
  }, [auto]);

  async function loadCheckpoint() {
    try {
      const res = await fetch('../indexer/checkpoint.json');
      if (!res.ok) throw new Error('missing');
      const data = await res.json();
      setCheckpoint(`Last indexed block: ${data.lastIndexedBlock}`);
    } catch (_) {
      setCheckpoint('No checkpoint found');
    }
  }

  async function loadEvents() {
    try {
      const res = await fetch('../indexer/events.json');
      if (!res.ok) throw new Error('missing');
      const text = await res.text();
      const lines = text.trim().split('\n').filter(Boolean);
      const evs = lines.map(l => JSON.parse(l));
      setEvents(evs);
      if (!lines.length) setEvents([]);
    } catch (_) {
      setEvents([]);
    }
  }

  async function loadStatuses() {
    const addr = window.CONTRACT_ADDRESS;
    const url = window.PROVIDER_URL || 'http://localhost:8545';
    if (!addr) {
      setStatusLists({ proposed: [], confirmed: [], shipped: [], received: [] });
      return;
    }
    try {
      const provider = new ethers.JsonRpcProvider(url);
      const c = new ethers.Contract(addr, abi, provider);
      const fn = (c as any).transfersInStatus || (c as any).batchesInStatus;
      const proposed = await fn(1);
      const confirmed = await fn(2);
      const shipped = await fn(3);
      const received = await fn(4);
      setStatusLists({ proposed, confirmed, shipped, received });

      const all = Array.from(new Set([...
        proposed.map((n: bigint) => n.toString()),
        ...confirmed.map((n: bigint) => n.toString()),
        ...shipped.map((n: bigint) => n.toString()),
        ...received.map((n: bigint) => n.toString())
      ]));
      const next: Record<string, { batch?: string; itemId?: string; name?: string; unit?: string; qty?: bigint }> = {};
      for (const id of all) {
        try {
          const batch = await (c as any).batchOf(id);
          let qty: bigint | undefined = undefined;
          try { qty = await (c as any).quantityOf(id); } catch (_) {}
          let itemId: string | undefined = undefined;
          try { itemId = await (c as any).itemOfBatch(String(batch)); } catch (_) {}
          const item = items.find(i => i.item_id === itemId);
          next[id] = { batch: String(batch || ''), itemId, name: item?.name || itemId, unit: item?.unit, qty };
        } catch (_) { /* ignore */ }
      }
      setMeta(next);
    } catch (_) {
      setStatusLists({ proposed: [], confirmed: [], shipped: [], received: [] });
    }
  }

  async function loadItems() {
    try {
      const res = await fetch('/api/items');
      const list = await res.json();
      setItems(list || []);
    } catch (_) {
      setItems([]);
    }
  }

  async function runIndexer() {
    const res = await fetch('/api/refresh', { method: 'POST' });
    if (res.ok) {
      window.showToast?.('Index refreshed');
    } else {
      window.showToast?.('Indexer error');
    }
    await loadCheckpoint();
    await loadEvents();
    await loadStatuses();
  }

  return (
    <>
      <div>
        <button id="refreshBtn" onClick={runIndexer}>Refresh Index</button>
        <label>
          <input
            type="checkbox"
            id="autoRefresh"
            checked={auto}
            onChange={e => setAuto(e.target.checked)}
          />{' '}
          Auto refresh
        </label>
      </div>
      <div id="checkpoint">{checkpoint}</div>
      <table id="eventsTable">
        <thead>
          <tr>
            <th>Block</th>
            <th>Event</th>
            <th>Details</th>
            <th>Finalized</th>
          </tr>
        </thead>
        <tbody>
          {events.length ? (
            events.map((ev, i) => (
              <tr key={i}>
                <td>{ev.blockNumber}</td>
                <td>{ev.event}</td>
                <td>{JSON.stringify(ev.args)}</td>
                <td>{ev.finalized ? 'yes' : 'no'}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4">No events indexed yet</td>
            </tr>
          )}
        </tbody>
      </table>
      <h3>Transfer IDs By Status</h3>
      <ul id="statusLists">
        <li>
          <strong>Proposed:</strong>{' '}
          {statusLists.proposed.length
            ? statusLists.proposed.map(id => {
                const k = id.toString();
                const m = meta[k] || {};
                const parts = [k];
                if (m.batch) parts.push(m.batch);
                if (m.name) parts.push(m.name + (m.unit ? ` (${m.unit})` : ''));
                if (m.qty !== undefined) parts.push(`qty ${m.qty.toString()}`);
                return parts.join(' — ');
              }).join(', ')
            : 'none'}
        </li>
        <li>
          <strong>Confirmed:</strong>{' '}
          {statusLists.confirmed.length
            ? statusLists.confirmed.map(id => {
                const k = id.toString();
                const m = meta[k] || {};
                const parts = [k];
                if (m.batch) parts.push(m.batch);
                if (m.name) parts.push(m.name + (m.unit ? ` (${m.unit})` : ''));
                if (m.qty !== undefined) parts.push(`qty ${m.qty.toString()}`);
                return parts.join(' — ');
              }).join(', ')
            : 'none'}
        </li>
        <li>
          <strong>Shipped:</strong>{' '}
          {statusLists.shipped.length
            ? statusLists.shipped.map(id => {
                const k = id.toString();
                const m = meta[k] || {};
                const parts = [k];
                if (m.batch) parts.push(m.batch);
                if (m.name) parts.push(m.name + (m.unit ? ` (${m.unit})` : ''));
                if (m.qty !== undefined) parts.push(`qty ${m.qty.toString()}`);
                return parts.join(' — ');
              }).join(', ')
            : 'none'}
        </li>
        <li>
          <strong>Received:</strong>{' '}
          {statusLists.received.length
            ? statusLists.received.map(id => {
                const k = id.toString();
                const m = meta[k] || {};
                const parts = [k];
                if (m.batch) parts.push(m.batch);
                if (m.name) parts.push(m.name + (m.unit ? ` (${m.unit})` : ''));
                if (m.qty !== undefined) parts.push(`qty ${m.qty.toString()}`);
                return parts.join(' — ');
              }).join(', ')
            : 'none'}
        </li>
      </ul>
    </>
  );
}

export default Dashboard;
