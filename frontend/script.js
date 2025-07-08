const abi = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"BatchReceived","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"BatchShipped","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"batchId","type":"uint256"},{"indexed":true,"internalType":"address","name":"by","type":"address"}],"name":"TransferConfirmed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"batchId","type":"uint256"},{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"plannedShipDate","type":"uint256"}],"name":"TransferProposed","type":"event"},{"inputs":[{"internalType":"enum BatchToken.Status","name":"s","type":"uint8"}],"name":"batchesInStatus","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"confirmTransfer","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"batchId","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"plannedShipDate","type":"uint256"}],"name":"proposeTransfer","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"receiveBatch","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"recipientOf","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"senderOf","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"shipBatch","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"status","outputs":[{"internalType":"enum BatchToken.Status","name":"","type":"uint8"}],"stateMutability":"view","type":"function"}]
;
;

let provider;
let signer;
let contract;

document.getElementById('connect').onclick = async () => {
  if (!window.ethereum) {
    alert('MetaMask not detected');
    return;
  }
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  document.getElementById('controls').style.display = 'block';
};

document.getElementById('loadContract').onclick = () => {
  const addr = document.getElementById('contractAddress').value.trim();
  const statusEl = document.getElementById('contractStatus');
  statusEl.textContent = '';
  if (!ethers.isAddress(addr)) {
    alert('Invalid contract address');
    return;
  }
  const tmp = new ethers.Contract(addr, abi, signer);
  const required = [
    'proposeTransfer',
    'confirmTransfer',
    'shipBatch',
    'receiveBatch',
    'status',
    'batchesInStatus',
  ];
  const ok = required.every(fn => typeof tmp[fn] === 'function');
  if (!ok) {
    statusEl.textContent = 'Contract mismatch';
    statusEl.style.color = 'red';
    return;
  }
  contract = tmp;
  statusEl.textContent = 'Contract loaded';
  statusEl.style.color = 'green';
  document.getElementById('contractControls').style.display = 'block';
  updateSelects();
};

document.getElementById('btnPropose').onclick = async () => {
  const id = document.getElementById('proposeBatchId').value;
  const to = document.getElementById('proposeTo').value;
  const dateStr = document.getElementById('proposeShipDate').value;
  let ts = 0;
  if (dateStr) {
    const ms = new Date(dateStr).getTime();
    if (Number.isFinite(ms)) {
      ts = Math.floor(ms / 1000);
    }
  }
  const tx = await contract.proposeTransfer(id, to, ts);
  await tx.wait();
  await updateSelects();
};

document.getElementById('btnConfirm').onclick = async () => {
  const id = document.getElementById('confirmBatchId').value;
  const tx = await contract.confirmTransfer(id);
  await tx.wait();
  await updateSelects();
};

document.getElementById('btnShip').onclick = async () => {
  const id = document.getElementById('shipBatchId').value;
  const tx = await contract.shipBatch(id);
  await tx.wait();
  await updateSelects();
};

document.getElementById('btnReceive').onclick = async () => {
  const id = document.getElementById('receiveBatchId').value;
  const tx = await contract.receiveBatch(id);
  await tx.wait();
  await updateSelects();
};

document.getElementById('btnStatus').onclick = async () => {
  const id = document.getElementById('statusBatchId').value;
  const s = await contract.status(id);
  document.getElementById('statusOutput').textContent = s.toString();
};

window.addEventListener('DOMContentLoaded', () => {
  if (window.CONTRACT_ADDRESS) {
    document.getElementById('contractAddress').value = window.CONTRACT_ADDRESS;
  }
  loadContacts();
  if (contract) updateSelects();
});

async function loadContacts() {
  try {
    const res = await fetch('contacts.csv');
    const text = await res.text();
    const lines = text.trim().split('\n').slice(1); // skip header
    const contacts = lines.map(l => {
      const [name, addr] = l.split(',');
      return { name: name.trim(), addr: addr.trim() };
    });
    const list = document.getElementById('contactsList');
    for (const c of contacts) {
      const opt = document.createElement('option');
      opt.value = c.addr;
      opt.textContent = c.name;
      list.appendChild(opt);
    }
  } catch (err) {
    console.error('failed to load contacts', err);
  }
}

async function updateSelects() {
  if (!contract || !signer) return;
  const confirmSel = document.getElementById('confirmBatchId');
  const shipSel = document.getElementById('shipBatchId');
  const receiveSel = document.getElementById('receiveBatchId');

  const addr = (await signer.getAddress()).toLowerCase();

  const proposed = await contract.batchesInStatus(1);
  const confirmable = [];
  for (const id of proposed) {
    const rec = (await contract.recipientOf(id)).toLowerCase();
    if (rec === addr) confirmable.push(id);
  }
  await populateSelect(confirmSel, confirmable);

  const confirmed = await contract.batchesInStatus(2);
  const shippable = [];
  for (const id of confirmed) {
    const from = (await contract.senderOf(id)).toLowerCase();
    if (from === addr) shippable.push(id);
  }
  await populateSelect(shipSel, shippable);

  const shipped = await contract.batchesInStatus(3);
  const receivable = [];
  for (const id of shipped) {
    const rec = (await contract.recipientOf(id)).toLowerCase();
    if (rec === addr) receivable.push(id);
  }
  await populateSelect(receiveSel, receivable);
}

async function populateSelect(sel, values) {
  sel.innerHTML = '';
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v.toString();
    sel.appendChild(opt);
  }
}
