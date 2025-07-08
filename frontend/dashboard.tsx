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

  useEffect(() => {
    loadCheckpoint();
    loadEvents();
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

  async function runIndexer() {
    await fetch('/api/refresh', { method: 'POST' });
    await loadCheckpoint();
    await loadEvents();
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
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Dashboard />);
