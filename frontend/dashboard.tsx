const { useState, useEffect } = React;

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

  useEffect(() => {
    loadCheckpoint();
    loadEvents();
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
      const proposed = await c.batchesInStatus(1);
      const confirmed = await c.batchesInStatus(2);
      const shipped = await c.batchesInStatus(3);
      const received = await c.batchesInStatus(4);
      setStatusLists({ proposed, confirmed, shipped, received });
    } catch (_) {
      setStatusLists({ proposed: [], confirmed: [], shipped: [], received: [] });
    }
  }

  async function runIndexer() {
    await fetch('/api/refresh', { method: 'POST' });
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
      <h3>Batch IDs By Status</h3>
      <ul id="statusLists">
        <li>
          <strong>Proposed:</strong>{' '}
          {statusLists.proposed.length
            ? statusLists.proposed.map(id => id.toString()).join(', ')
            : 'none'}
        </li>
        <li>
          <strong>Confirmed:</strong>{' '}
          {statusLists.confirmed.length
            ? statusLists.confirmed.map(id => id.toString()).join(', ')
            : 'none'}
        </li>
        <li>
          <strong>Shipped:</strong>{' '}
          {statusLists.shipped.length
            ? statusLists.shipped.map(id => id.toString()).join(', ')
            : 'none'}
        </li>
        <li>
          <strong>Received:</strong>{' '}
          {statusLists.received.length
            ? statusLists.received.map(id => id.toString()).join(', ')
            : 'none'}
        </li>
      </ul>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Dashboard />);
