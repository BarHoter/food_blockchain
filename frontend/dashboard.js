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
      tr.append(tdBlock, tdEvent, tdDetails);
      tbody.appendChild(tr);
    }
    if (!lines.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.textContent = 'No events indexed yet';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  } catch (_) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'No events indexed yet';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

window.addEventListener('load', () => {
  loadCheckpoint();
  loadEvents();
});
