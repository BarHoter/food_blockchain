
declare const abi: any[];

// Use globals loaded by index.html
declare const React: any;
declare const ReactDOM: any;
const { useState, useEffect } = React;
const ethers = (window as any).ethers;

declare global {
  interface Window {
    ethereum?: any;
    CONTRACT_ADDRESS?: string;
  }
}

interface Contact {
  name: string;
  addr: string;
}

function App(): JSX.Element {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [contractAddress, setContractAddress] = useState<string>(window.CONTRACT_ADDRESS || '');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [confirmable, setConfirmable] = useState<bigint[]>([]);
  const [shippable, setShippable] = useState<bigint[]>([]);
  const [receivable, setReceivable] = useState<bigint[]>([]);
  const [statusId, setStatusId] = useState<string>('');
  const [statusOutput, setStatusOutput] = useState<string>('');

  function parseError(err: any): string {
    if (!err) return 'Transaction failed';
    if (err.shortMessage) return err.shortMessage;
    if (err.error && err.error.message) return err.error.message;
    if (err.message) return err.message;
    return 'Transaction failed';
  }

  useEffect(() => {
    fetch('contacts.csv')
      .then(res => res.text())
      .then(text => {
        const lines = text.trim().split('\n').slice(1);
        const cs = lines.map(l => {
          const [name, addr] = l.split(',');
          return { name: name.trim(), addr: addr.trim() };
        });
        setContacts(cs);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    if (contract && signer) updateSelects();
  }, [contract, signer]);

  useEffect(() => {
    if (signer && contractAddress && !contract) {
      loadContract();
    }
  }, [signer]);

  async function connectWallet() {
    if (!window.ethereum) {
      alert('MetaMask not detected');
      return;
    }
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    const p = new ethers.BrowserProvider(window.ethereum);
    setProvider(p);
    setSigner(await p.getSigner());
  }

  function loadContract() {
    if (!ethers.isAddress(contractAddress)) {
      alert('Invalid contract address');
      return;
    }
    const tmp = new ethers.Contract(contractAddress, abi, signer);
    const required = [
      'proposeTransfer',
      'confirmTransfer',
      'shipBatch',
      'receiveBatch',
      'status',
      'batchesInStatus'
    ];
    const ok = required.every(fn => typeof tmp[fn] === 'function');
    if (!ok) {
      setStatusMsg('Contract mismatch');
      return;
    }
    setContract(tmp);
    setStatusMsg('Contract loaded');
  }

  async function proposeTransfer() {
    if (!contract) return;
    const idStr = (document.getElementById('proposeBatchId') as HTMLInputElement).value;
    const to = (document.getElementById('proposeTo') as HTMLInputElement).value.trim();
    if (!idStr || !ethers.isAddress(to)) {
      alert('Invalid batch ID or recipient address');
      return;
    }
    const from = (await signer!.getAddress()).toLowerCase();
    if (to.toLowerCase() === from) {
      alert('Recipient must be different from sender');
      return;
    }
    const dateStr = (document.getElementById('proposeShipDate') as HTMLInputElement).value;
    let ts = 0;
    if (dateStr) {
      const ms = new Date(dateStr).getTime();
      if (Number.isFinite(ms)) ts = Math.floor(ms / 1000);
    }
    try {
      const tx = await contract.proposeTransfer(idStr, to, ts);
      await tx.wait();
      updateSelects();
    } catch (err: any) {
      console.error('propose failed', err);
      alert(parseError(err));
    }
  }

  async function confirmTransfer() {
    if (!contract) return;
    const id = (document.getElementById('confirmBatchId') as HTMLSelectElement).value;
    console.log("🔍 confirmBatchId value:", id);
    if (!id) {
      alert('Select a batch to confirm');
      return;
    }
    try {
      const tx = await contract.confirmTransfer(id);
      await tx.wait();
      updateSelects();
    } catch (err: any) {
      console.error('confirm failed', err);
      alert(parseError(err));
    }
  }

  async function shipBatch() {
    if (!contract) return;
    const id = (document.getElementById('shipBatchId') as HTMLSelectElement).value;
    console.log("🔍 shipBatchId value:", id);
    if (!id) {
      alert('Select a batch to ship');
      return;
    }
    try {
      const tx = await contract.shipBatch(id);
      await tx.wait();
      updateSelects();
    } catch (err: any) {
      console.error('ship failed', err);
      alert(parseError(err));
    }
  }

  async function receiveBatch() {
    if (!contract) return;
    const id = (document.getElementById('receiveBatchId') as HTMLSelectElement).value;
    console.log("🔍 receiveBatchId value:", id);
    if (!id) {
      alert('Select a batch to receive');
      return;
    }
    try {
      const tx = await contract.receiveBatch(id);
      await tx.wait();
      updateSelects();
    } catch (err: any) {
      console.error('receive failed', err);
      alert(parseError(err));
    }
  }

  async function checkStatus() {
    if (!contract) return;
    try {
      const s = await contract.status(statusId);
      setStatusOutput(s.toString());
    } catch (err: any) {
      console.error('status failed', err);
      alert(parseError(err));
    }
  }

  async function updateSelects() {
    if (!contract || !signer) return;
    const addr = (await signer.getAddress()).toLowerCase();

    const proposed = await contract.batchesInStatus(1);
    const confirmableIds: bigint[] = [];
    for (const id of proposed) {
      const rec = (await contract.recipientOf(id)).toLowerCase();
      if (rec === addr) confirmableIds.push(id);
    }
    setConfirmable(confirmableIds);

    const confirmed = await contract.batchesInStatus(2);
    const shippableIds: bigint[] = [];
    for (const id of confirmed) {
      const from = (await contract.senderOf(id)).toLowerCase();
      if (from === addr) shippableIds.push(id);
    }
    setShippable(shippableIds);

    const shipped = await contract.batchesInStatus(3);
    const receivableIds: bigint[] = [];
    for (const id of shipped) {
      const rec = (await contract.recipientOf(id)).toLowerCase();
      if (rec === addr) receivableIds.push(id);
    }
    setReceivable(receivableIds);
  }

  console.log("🛠️ confirmable IDs:", confirmable);

  return (
    <>
      <button id="connect" onClick={connectWallet}>Connect Wallet</button>
      {signer && (
        <div id="controls">
          <label>
            Contract Address:
            <input
              id="contractAddress"
              value={contractAddress}
              onChange={e => setContractAddress(e.target.value)}
              placeholder="0x..."
              size="42"
            />
          </label>
          <button id="loadContract" onClick={loadContract}>Load Contract</button>
          <span id="contractStatus" style={{ marginLeft: '0.5rem' }}>{statusMsg}</span>
        </div>
      )}

      {contract && (
        <div id="contractControls">
          <h3>Propose Transfer</h3>
          <input id="proposeBatchId" placeholder="Batch ID" type="number" />
          <input id="proposeTo" placeholder="Recipient" size="42" list="contactsList" />
          <datalist id="contactsList">
            {contacts.map(c => (
              <option key={c.addr} value={c.addr}>{c.name}</option>
            ))}
          </datalist>
          <input id="proposeShipDate" placeholder="Ship date" type="datetime-local" />
          <button id="btnPropose" onClick={proposeTransfer}>Propose</button>

          <h3>Confirm Transfer</h3>
          <select id="confirmBatchId" defaultValue="">
            <option value="" disabled>Select a batch</option>
            {confirmable.map(id => (
              <option key={id.toString()} value={id.toString()}>{id.toString()}</option>
            ))}
          </select>
          <button id="btnConfirm" onClick={confirmTransfer}>Confirm</button>

          <h3>Ship Batch</h3>
          <select id="shipBatchId" defaultValue="">
            <option value="" disabled>Select a batch</option>
            {shippable.map(id => (
              <option key={id.toString()} value={id.toString()}>{id.toString()}</option>
            ))}
          </select>
          <button id="btnShip" onClick={shipBatch}>Ship</button>

          <h3>Receive Batch</h3>
          <select id="receiveBatchId" defaultValue="">
            <option value="" disabled>Select a batch</option>
            {receivable.map(id => (
              <option key={id.toString()} value={id.toString()}>{id.toString()}</option>
            ))}
          </select>
          <button id="btnReceive" onClick={receiveBatch}>Receive</button>

          <h3>Check Status</h3>
          <input
            id="statusBatchId"
            value={statusId}
            onChange={e => setStatusId(e.target.value)}
            placeholder="Batch ID"
            type="number"
          />
          <button id="btnStatus" onClick={checkStatus}>Get Status</button>
          <pre id="statusOutput">{statusOutput}</pre>
        </div>
      )}
    </>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error("❌ Could not find #root element to render into");
} else {
  ReactDOM.createRoot(rootEl).render(<App />);
}
