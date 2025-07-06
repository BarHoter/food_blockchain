const abi = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"BatchReceived","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"BatchShipped","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"batchId","type":"uint256"},{"indexed":true,"internalType":"address","name":"by","type":"address"}],"name":"TransferConfirmed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"batchId","type":"uint256"},{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"plannedShipDate","type":"uint256"}],"name":"TransferProposed","type":"event"},{"inputs":[{"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"confirmTransfer","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"batchId","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"plannedShipDate","type":"uint256"}],"name":"proposeTransfer","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"receiveBatch","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"batchId","type":"uint256"}],"name":"shipBatch","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"status","outputs":[{"internalType":"enum BatchToken.Status","name":"","type":"uint8"}],"stateMutability":"view","type":"function"}];

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
  const required = ['proposeTransfer', 'confirmTransfer', 'shipBatch', 'receiveBatch', 'status'];
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
  await contract.proposeTransfer(id, to, ts);
};

document.getElementById('btnConfirm').onclick = async () => {
  const id = document.getElementById('confirmBatchId').value;
  await contract.confirmTransfer(id);
};

document.getElementById('btnShip').onclick = async () => {
  const id = document.getElementById('shipBatchId').value;
  await contract.shipBatch(id);
};

document.getElementById('btnReceive').onclick = async () => {
  const id = document.getElementById('receiveBatchId').value;
  await contract.receiveBatch(id);
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
