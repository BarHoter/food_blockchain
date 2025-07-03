async function loadCheckpoint() {
  const el = document.getElementById('checkpoint');
  try {
    const res = await fetch('../indexer/checkpoint.json');
    if (!res.ok) throw new Error('missing checkpoint');
    const data = await res.json();
    el.textContent = `Last indexed block: ${data.lastIndexedBlock}`;
  } catch (_) {
    el.textContent = 'No checkpoint found';
  }
}

async function loadEvents() {
  const tbody = document.querySelector('#eventsTable tbody');
  tbody.innerHTML = '';
  try {
    const res = await fetch('../indexer/events.json');
    if (!res.ok) throw new Error('missing events');
    const text = await res.text();
    const lines = text.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const ev = JSON.parse(line);
      const tr = document.createElement('tr');
      const tdBlock = document.createElement('td');
      tdBlock.textContent = ev.blockNumber;
      const tdEvent = document.createElement('td');
      tdEvent.textContent = ev.event;
      const tdDetails = document.createElement('td');
      tdDetails.textContent = JSON.stringify(ev.args);
      const tdFinalized = document.createElement('td');
      tdFinalized.textContent = ev.finalized ? 'yes' : 'no';
      tr.append(tdBlock, tdEvent, tdDetails, tdFinalized);
      tbody.appendChild(tr);
    }
    if (!lines.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'No events indexed yet';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  } catch (_) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = 'No events indexed yet';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

window.addEventListener('load', () => {
  document.getElementById('refreshBtn').onclick = runIndexer;
  const auto = document.getElementById('autoRefresh');
  let timer;
  auto.onchange = () => {
    clearInterval(timer);
    if (auto.checked) {
      timer = setInterval(runIndexer, 5000);
    }
  };
  loadCheckpoint();
  loadEvents();
});

async function runIndexer() {
  await fetch('/api/refresh', { method: 'POST' });
  await loadCheckpoint();
  await loadEvents();
}
