
import { useState, useEffect } from 'react';
import { abi } from './abi.js';
import { ethers } from 'ethers';

declare global {
  interface Window {
    ethereum?: any;
    CONTRACT_ADDRESS?: string;
    PROVIDER_URL?: string;
  }
}

interface Contact {
  name: string;
  addr: string;
}

interface Item { item_id: string; name?: string; unit?: string }

function App(): JSX.Element {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [contractAddress, setContractAddress] = useState<string>(window.CONTRACT_ADDRESS || '');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [myAddress, setMyAddress] = useState<string>('');
  const [confirmable, setConfirmable] = useState<bigint[]>([]);
  const [shippable, setShippable] = useState<bigint[]>([]);
  const [receivable, setReceivable] = useState<bigint[]>([]);
  const [proposed, setProposed] = useState<bigint[]>([]);
  const [confirmed, setConfirmed] = useState<bigint[]>([]);
  const [shipped, setShipped] = useState<bigint[]>([]);
  const [received, setReceived] = useState<bigint[]>([]);
  const [myBatches, setMyBatches] = useState({
    proposed: [] as bigint[],
    confirmed: [] as bigint[],
    shipped: [] as bigint[],
    received: [] as bigint[],
  });

  const [myTurn, setMyTurn] = useState({
    confirm: [] as bigint[],
    ship: [] as bigint[],
    receive: [] as bigint[],
  });
  const [statusId, setStatusId] = useState<string>('');
  const [statusOutput, setStatusOutput] = useState<string>('');
  const [items, setItems] = useState<Item[]>([]);
  const [isItemLocked, setIsItemLocked] = useState<boolean>(false);
  const [linkedItemId, setLinkedItemId] = useState<string>("");
  const [selectedUnit, setSelectedUnit] = useState<string>("");
  const [transferMeta, setTransferMeta] = useState<Record<string, { batch?: string; itemId?: string; itemName?: string; unit?: string; quantity?: bigint }>>({});
  const [pending, setPending] = useState<{ propose?: boolean; confirm?: boolean; ship?: boolean; receive?: boolean; cancelPropose?: boolean; cancelShip?: boolean }>({});
  const [approvedAddrs, setApprovedAddrs] = useState<string[]>([]);
  const [checkedApprovedFallback, setCheckedApprovedFallback] = useState<boolean>(false);

  const readProvider = new ethers.JsonRpcProvider(
    window.PROVIDER_URL || 'http://localhost:8545'
  );

  function parseError(err: any): string {
    if (!err) return 'Transaction failed';
    if (err.shortMessage) return err.shortMessage;
    if (err.error && err.error.message) return err.error.message;
    if (err.message) return err.message;
    return 'Transaction failed';
  }

  useEffect(() => {
    // Prefer DB actors; fallback to CSV contacts
    (async () => {
      // Load approved actors from the on-chain indexer (if available)
      try {
        const resApproved = await fetch('/indexer/actors.json');
        if (resApproved.ok) {
          const data = await resApproved.json();
          const addrs = (data.addresses || []).map((a: string) => (a || '').toLowerCase());
          setApprovedAddrs(addrs);
        }
      } catch (_) { /* ignore */ }
      let haveContacts = false;
      try {
        const res = await fetch('/api/actors');
        if (res.ok) {
          const list = await res.json();
          let cs: Contact[] = (list || []).map((a: any) => ({ name: a.name, addr: (a.blockchain_address || '').trim() }));
          // If we have an approved list, filter to only approved actors
          if (approvedAddrs && approvedAddrs.length) {
            const approvedSet = new Set(approvedAddrs);
            cs = cs.filter(c => approvedSet.has((c.addr || '').toLowerCase()));
          }
          setContacts(cs);
          haveContacts = true;
        }
      } catch (_) { /* ignore */ }
      try {
        const resItems = await fetch('/api/items');
        if (resItems.ok) {
          const list = await resItems.json();
          setItems(list || []);
        }
      } catch (_) { /* ignore */ }
      if (!haveContacts) {
        try {
          const res2 = await fetch('/contacts.csv');
          if (!res2.ok) return;
          const text = await res2.text();
          const lines = text.trim().split('\n').slice(1);
          let cs = lines.map(l => {
            const [name, addr] = l.split(',');
            return { name: (name || '').trim(), addr: (addr || '').trim() };
          });
          if (approvedAddrs && approvedAddrs.length) {
            const approvedSet = new Set(approvedAddrs);
            cs = cs.filter(c => approvedSet.has((c.addr || '').toLowerCase()));
          }
          setContacts(cs);
        } catch (_) { /* ignore */ }
      }
    })();
  }, [approvedAddrs.length]);

  // Fallback: if indexer list is unavailable/empty, query contract.isActor for contacts using a read-only provider
  useEffect(() => {
    const run = async () => {
      if (checkedApprovedFallback) return;
      if (approvedAddrs.length) return; // already have approved list
      if (!contacts.length) return; // need contacts to check
      if (!ethers.isAddress(contractAddress)) return; // need a valid contract address
      try {
        const c = new ethers.Contract(contractAddress, abi, readProvider);
        const unique = Array.from(new Set(contacts.map(c => (c.addr || '').toLowerCase()).filter(Boolean)));
        const statuses = await Promise.all(unique.map(async (addr) => {
          try { return await c.isActor(addr); } catch { return false; }
        }));
        const approved = unique.filter((addr, i) => !!statuses[i]);
        if (approved.length) setApprovedAddrs(approved);
      } catch (_) { /* ignore */ }
      finally {
        setCheckedApprovedFallback(true);
      }
    };
    run();
  }, [contacts, contractAddress, approvedAddrs.length, checkedApprovedFallback]);

  useEffect(() => {
    if (contract && signer) updateSelects();
  }, [contract, signer]);

  useEffect(() => {
    if (!contract) return;
    const batchEl = document.getElementById('proposeBatchId') as HTMLInputElement | null;
    if (!batchEl) return;
    const handler = async () => {
      const val = (batchEl.value || '').trim();
      if (!val) { setIsItemLocked(false); setLinkedItemId(""); return; }
      try {
        const linked = await (contract as any).itemOfBatch(String(val));
        if (linked && String(linked).length) {
          setLinkedItemId(String(linked));
          setIsItemLocked(true);
          const it = items.find(i => i.item_id === String(linked));
          setSelectedUnit(it?.unit || "");
        } else {
          setLinkedItemId("");
          setIsItemLocked(false);
          setSelectedUnit("");
        }
      } catch (_) { setLinkedItemId(""); setIsItemLocked(false); }
    };
    batchEl.addEventListener('input', handler);
    handler();
    return () => batchEl.removeEventListener('input', handler);
  }, [contract, items]);

  useEffect(() => {
    const el = document.getElementById('proposeItemId') as HTMLSelectElement | HTMLInputElement | null;
    if (!el || isItemLocked) return;
    const onChange = () => {
      const id = (el as HTMLSelectElement).value || '';
      const it = items.find(i => i.item_id === id);
      setSelectedUnit(it?.unit || "");
    };
    el.addEventListener('change', onChange);
    onChange();
    return () => el.removeEventListener('change', onChange);
  }, [items, isItemLocked]);

  useEffect(() => {
    if (signer && contractAddress && !contract) {
      loadContract();
    }
  }, [signer]);

  // When items load or change, enrich any existing transfer metadata with names/units
  useEffect(() => {
    if (!items.length || !Object.keys(transferMeta).length) return;
    const next: typeof transferMeta = { ...transferMeta };
    for (const k of Object.keys(next)) {
      const m = next[k];
      if (!m) continue;
      const it = m.itemId ? items.find(i => i.item_id === m.itemId) : undefined;
      if (it) {
        m.itemName = it.name || m.itemId || m.itemName;
        if (it.unit) m.unit = it.unit;
      }
    }
    setTransferMeta(next);
  }, [items]);

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
      const addr = (await s.getAddress()).toLowerCase();
      setMyAddress(addr);
    } catch (_) { /* ignore */ }
    window.showToast?.('Wallet connected');
  }

  function loadContract() {
    if (!ethers.isAddress(contractAddress)) {
      window.showToast?.('Invalid contract address');
      return;
    }
    const tmp = new ethers.Contract(contractAddress, abi, signer);
    const ok = (
      typeof (tmp as any)['proposeTransfer'] === 'function' &&
      typeof (tmp as any)['confirmTransfer'] === 'function' &&
      (typeof (tmp as any)['shipTransfer'] === 'function' || typeof (tmp as any)['shipBatch'] === 'function') &&
      (typeof (tmp as any)['receiveTransfer'] === 'function' || typeof (tmp as any)['receiveBatch'] === 'function') &&
      typeof (tmp as any)['status'] === 'function' &&
      (typeof (tmp as any)['transfersInStatus'] === 'function' || typeof (tmp as any)['batchesInStatus'] === 'function')
    );
    if (!ok) {
      setStatusMsg('Contract mismatch');
      return;
    }
    setContract(tmp);
    setStatusMsg('Contract loaded');
    window.showToast?.('Contract loaded');
  }

  async function proposeTransfer() {
    if (!contract) return;
    const batchExternalId = (document.getElementById('proposeBatchId') as HTMLInputElement).value.trim();
    const to = (document.getElementById('proposeTo') as HTMLInputElement).value.trim();
    const itemId = (document.getElementById('proposeItemId') as HTMLInputElement | HTMLSelectElement)?.value?.trim() || '';
    if (!batchExternalId || !ethers.isAddress(to)) {
      window.showToast?.('Invalid batch or recipient address');
      return;
    }
    if (!itemId) {
      window.showToast?.('Item ID is required');
      return;
    }
    const from = (await signer!.getAddress()).toLowerCase();
    if (to.toLowerCase() === from) {
      window.showToast?.('Recipient must be different from sender');
      return;
    }
    const dateStr = (document.getElementById('proposeShipDate') as HTMLInputElement).value;
    const qtyStr = (document.getElementById('proposeQuantity') as HTMLInputElement)?.value || '';
    const quantity = qtyStr ? BigInt(qtyStr) : 0n;
    let ts = 0;
    if (dateStr) {
      const ms = new Date(dateStr).getTime();
      if (Number.isFinite(ms)) ts = Math.floor(ms / 1000);
    }
    try {
      setPending(p => ({ ...p, propose: true }));
      let tx;
      if (itemId && typeof (contract as any)["proposeTransfer(address,uint256,string,string,uint256)"] === 'function') {
        tx = await (contract as any)["proposeTransfer(address,uint256,string,string,uint256)"](to, ts, batchExternalId, itemId, quantity);
      } else if (typeof (contract as any)["proposeTransfer(address,uint256,string,uint256)"] === 'function') {
        tx = await (contract as any)["proposeTransfer(address,uint256,string,uint256)"](to, ts, batchExternalId, quantity);
      } else if (itemId && typeof (contract as any)["proposeTransfer(uint256,address,uint256,string,string)"] === 'function') {
        // Fallback for older contract versions (numeric id based)
        tx = await (contract as any)["proposeTransfer(uint256,address,uint256,string,string)"](Number(batchExternalId) || 0, to, ts, String(batchExternalId), itemId);
      } else {
        // Fallback to very old 3-arg version
        tx = await (contract as any)["proposeTransfer(uint256,address,uint256)"](Number(batchExternalId) || 0, to, ts);
      }
      // Immediately clear inputs to avoid accidental double-submits
      (document.getElementById('proposeBatchId') as HTMLInputElement).value = '';
      const itemEl = document.getElementById('proposeItemId') as HTMLInputElement | HTMLSelectElement | null;
      if (itemEl) (itemEl as any).value = '';
      (document.getElementById('proposeTo') as HTMLInputElement).value = '';
      (document.getElementById('proposeShipDate') as HTMLInputElement).value = '';
      const qtyEl = document.getElementById('proposeQuantity') as HTMLInputElement | null;
      if (qtyEl) qtyEl.value = '';
      setLinkedItemId('');
      setIsItemLocked(false);
      setSelectedUnit('');
      await tx.wait();
      updateSelects();
      window.showToast?.('Transfer proposed');
    } catch (err: any) {
      console.error('propose failed', err);
      window.showToast?.(parseError(err));
    } finally {
      setPending(p => ({ ...p, propose: false }));
    }
  }

  async function confirmTransfer() {
    if (!contract) return;
    const id = (document.getElementById('confirmBatchId') as HTMLSelectElement).value;
    console.log("🔍 confirmBatchId value:", id);
    if (!id) {
      window.showToast?.('Select a batch to confirm');
      return;
    }
    try {
      setPending(p => ({ ...p, confirm: true }));
      const tx = await contract.confirmTransfer(id);
      // Clear selection right after sending tx
      (document.getElementById('confirmBatchId') as HTMLSelectElement).value = '';
      await tx.wait();
      updateSelects();
      window.showToast?.('Transfer confirmed');
    } catch (err: any) {
      console.error('confirm failed', err);
      window.showToast?.(parseError(err));
    } finally {
      setPending(p => ({ ...p, confirm: false }));
    }
  }

  async function shipBatch() {
    if (!contract) return;
    const id = (document.getElementById('shipBatchId') as HTMLSelectElement).value;
    console.log("🔍 shipBatchId value:", id);
    if (!id) {
      window.showToast?.('Select a batch to ship');
      return;
    }
    try {
      setPending(p => ({ ...p, ship: true }));
      const tx = (contract as any).shipTransfer ? await (contract as any).shipTransfer(id) : await (contract as any).shipBatch(id);
      (document.getElementById('shipBatchId') as HTMLSelectElement).value = '';
      await tx.wait();
      updateSelects();
      window.showToast?.('Transfer shipped');
    } catch (err: any) {
      console.error('ship failed', err);
      window.showToast?.(parseError(err));
    } finally {
      setPending(p => ({ ...p, ship: false }));
    }
  }

  async function receiveBatch() {
    if (!contract) return;
    const id = (document.getElementById('receiveBatchId') as HTMLSelectElement).value;
    console.log("🔍 receiveBatchId value:", id);
    if (!id) {
      window.showToast?.('Select a batch to receive');
      return;
    }
    try {
      setPending(p => ({ ...p, receive: true }));
      const tx = (contract as any).receiveTransfer ? await (contract as any).receiveTransfer(id) : await (contract as any).receiveBatch(id);
      (document.getElementById('receiveBatchId') as HTMLSelectElement).value = '';
      await tx.wait();
      updateSelects();
      window.showToast?.('Transfer received');
    } catch (err: any) {
      console.error('receive failed', err);
      window.showToast?.(parseError(err));
    } finally {
      setPending(p => ({ ...p, receive: false }));
    }
  }

  async function cancelProposed(id: bigint) {
    if (!contract) return;
    try {
      setPending(p => ({ ...p, cancelPropose: true }));
      if (typeof (contract as any).cancelTransfer !== 'function') { window.showToast?.('Cancel not supported by contract'); return; }
      const tx = await (contract as any).cancelTransfer(id);
      await tx.wait();
      await updateSelects();
      window.showToast?.('Transfer canceled');
    } catch (err: any) {
      console.error('cancel proposed failed', err);
      window.showToast?.(parseError(err));
    } finally {
      setPending(p => ({ ...p, cancelPropose: false }));
    }
  }

  async function cancelShipped(id: bigint) {
    if (!contract) return;
    try {
      setPending(p => ({ ...p, cancelShip: true }));
      if (typeof (contract as any).cancelShipping !== 'function') { window.showToast?.('Cancel shipping not supported by contract'); return; }
      const tx = await (contract as any).cancelShipping(id);
      await tx.wait();
      await updateSelects();
      window.showToast?.('Shipping canceled');
    } catch (err: any) {
      console.error('cancel shipped failed', err);
      window.showToast?.(parseError(err));
    } finally {
      setPending(p => ({ ...p, cancelShip: false }));
    }
  }

  async function checkStatus() {
    if (!contract) return;
    try {
      const s = await contract.status(statusId);
      setStatusOutput(s.toString());
    } catch (err: any) {
      console.error('status failed', err);
      window.showToast?.(parseError(err));
    }
  }

  async function updateSelects() {
    if (!contract || !signer) return;
    const addr = (await signer.getAddress()).toLowerCase();

    const myProp: bigint[] = [];
    const myConf: bigint[] = [];
    const myShip: bigint[] = [];
    const myRecv: bigint[] = [];

    const proposedAll = typeof (contract as any).transfersInStatus === 'function'
      ? await (contract as any).transfersInStatus(1)
      : await (contract as any).batchesInStatus(1);
    setProposed(proposedAll);
    const confirmableIds: bigint[] = [];
    for (const id of proposedAll) {
      const sender = (await contract.senderOf(id)).toLowerCase();
      const rec = (await contract.recipientOf(id)).toLowerCase();
      if (sender === addr || rec === addr) myProp.push(id);
      if (rec === addr) confirmableIds.push(id);
    }
    setConfirmable(confirmableIds);

    const confirmedAll = typeof (contract as any).transfersInStatus === 'function'
      ? await (contract as any).transfersInStatus(2)
      : await (contract as any).batchesInStatus(2);
    setConfirmed(confirmedAll);
    const shippableIds: bigint[] = [];
    for (const id of confirmedAll) {
      const sender = (await contract.senderOf(id)).toLowerCase();
      const rec = (await contract.recipientOf(id)).toLowerCase();
      if (sender === addr || rec === addr) myConf.push(id);
      if (sender === addr) shippableIds.push(id);
    }
    setShippable(shippableIds);

    const shippedAll = typeof (contract as any).transfersInStatus === 'function'
      ? await (contract as any).transfersInStatus(3)
      : await (contract as any).batchesInStatus(3);
    setShipped(shippedAll);
    const receivableIds: bigint[] = [];
    for (const id of shippedAll) {
      const sender = (await contract.senderOf(id)).toLowerCase();
      const rec = (await contract.recipientOf(id)).toLowerCase();
      if (sender === addr || rec === addr) myShip.push(id);
      if (rec === addr) receivableIds.push(id);
    }
    setReceivable(receivableIds);

    const receivedAll = typeof (contract as any).transfersInStatus === 'function'
      ? await (contract as any).transfersInStatus(4)
      : await (contract as any).batchesInStatus(4);
    setReceived(receivedAll);
    for (const id of receivedAll) {
      const sender = (await contract.senderOf(id)).toLowerCase();
      const rec = (await contract.recipientOf(id)).toLowerCase();
      if (sender === addr || rec === addr) myRecv.push(id);
    }

    setMyBatches({ proposed: myProp, confirmed: myConf, shipped: myShip, received: myRecv });
    setMyTurn({ confirm: confirmableIds, ship: shippableIds, receive: receivableIds });

    // Load metadata for transfers we can act on
    const needed = Array.from(new Set([
      ...confirmableIds, ...shippableIds, ...receivableIds,
      ...myProp, ...myConf, ...myShip, ...myRecv
    ].map(String)));
    const nextMeta: Record<string, { batch?: string; itemId?: string; itemName?: string; unit?: string; quantity?: bigint }> = { ...transferMeta };
    for (const idStr of needed) {
      if (nextMeta[idStr]?.batch && nextMeta[idStr]?.quantity !== undefined) continue;
      try {
        const batch = await (contract as any).batchOf(idStr);
        let quantity: bigint | undefined = undefined;
        try { quantity = await (contract as any).quantityOf(idStr); } catch (_) { quantity = undefined; }
        let itemId: string | undefined = undefined;
        try { itemId = await (contract as any).itemOfBatch(String(batch)); } catch (_) { itemId = undefined; }
        const item = items.find(i => i.item_id === itemId);
        nextMeta[idStr] = {
          batch: String(batch || ''),
          itemId,
          itemName: item?.name || itemId,
          unit: item?.unit,
          quantity
        };
      } catch (_) { /* ignore */ }
    }
    setTransferMeta(nextMeta);
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
          <div className="steps-grid">
            <div className={`step-card ${confirmable.length ? 'has-action' : ''}`}>
              <div className="step-header"><span className="step-badge">1</span><h3 style={{ margin: 0 }}>Propose Transfer</h3></div>
              <div className="step-sub">Create a new transfer for a manufacturing batch.</div>
              <input id="proposeBatchId" placeholder="Batch (manufacturing)" />
              {isItemLocked ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input id="proposeItemId" type="hidden" value={linkedItemId} />
                  <input id="proposeItemName" value={items.find(i => i.item_id === linkedItemId)?.name || 'Linked item'} readOnly disabled />
                </div>
              ) : (
                <select id="proposeItemId" defaultValue="">
                  <option value="" disabled>Select item</option>
                  {items.map(it => (
                    <option key={it.item_id} value={it.item_id}>
                      {(it.name || it.item_id) + (it.unit ? ` (${it.unit})` : '')}
                    </option>
                  ))}
                </select>
              )}
              <input id="proposeTo" placeholder="Recipient" size="42" list="contactsList" />
              <datalist id="contactsList">
                {contacts
                  .filter(c => (c.addr || '').toLowerCase() !== myAddress)
                  .filter(c => !approvedAddrs.length || approvedAddrs.includes((c.addr || '').toLowerCase()))
                  .map(c => {
                    const label = c.name || c.addr;
                    return (
                      <option key={c.addr} value={c.addr} label={label}>{label}</option>
                    );
                  })}
              </datalist>
          <input id="proposeShipDate" placeholder="Ship date" type="datetime-local" />
          <input id="proposeQuantity" placeholder={`Quantity${selectedUnit ? ` (${selectedUnit})` : ''}`} type="number" min="0" step="1" />
          <button id="btnPropose" onClick={proposeTransfer} disabled={!!pending.propose}>Propose</button>
            </div>

            <div className={`step-card ${confirmable.length ? 'has-action' : ''}`}>
              <div className="step-header"><span className="step-badge">2</span><h3 style={{ margin: 0 }}>Confirm Transfer</h3></div>
              <div className="step-sub">Receiver confirms an incoming transfer.</div>
              <select id="confirmBatchId" defaultValue="">
                <option value="" disabled>Select transfer id</option>
                {confirmable.map(id => {
                  const k = id.toString();
                  const meta = transferMeta[k] || {};
                  const labelParts = [k];
                  if (meta.batch) labelParts.push(meta.batch);
                  if (meta.itemName) labelParts.push(meta.itemName + (meta.unit ? ` (${meta.unit})` : ''));
                  if (meta.quantity !== undefined) labelParts.push(`qty ${meta.quantity.toString()}`);
                  const label = labelParts.join(' — ');
                  return (
                    <option key={k} value={k}>{label}</option>
                  );
                })}
              </select>
          <button id="btnConfirm" onClick={confirmTransfer} disabled={!!pending.confirm}>Confirm</button>
            </div>

            <div className={`step-card ${shippable.length ? 'has-action' : ''}`}>
              <div className="step-header"><span className="step-badge">3</span><h3 style={{ margin: 0 }}>Ship Transfer</h3></div>
              <div className="step-sub">Sender marks a confirmed transfer as shipped.</div>
              <select id="shipBatchId" defaultValue="">
                <option value="" disabled>Select transfer id</option>
                {shippable.map(id => {
                  const k = id.toString();
                  const meta = transferMeta[k] || {};
                  const labelParts = [k];
                  if (meta.batch) labelParts.push(meta.batch);
                  if (meta.itemName) labelParts.push(meta.itemName + (meta.unit ? ` (${meta.unit})` : ''));
                  if (meta.quantity !== undefined) labelParts.push(`qty ${meta.quantity.toString()}`);
                  const label = labelParts.join(' — ');
                  return (
                    <option key={k} value={k}>{label}</option>
                  );
                })}
              </select>
          <button id="btnShip" onClick={shipBatch} disabled={!!pending.ship}>Ship</button>
            </div>

            <div className={`step-card ${receivable.length ? 'has-action' : ''}`}>
              <div className="step-header"><span className="step-badge">4</span><h3 style={{ margin: 0 }}>Receive Transfer</h3></div>
              <div className="step-sub">Receiver acknowledges delivery and completes the cycle.</div>
              <select id="receiveBatchId" defaultValue="">
                <option value="" disabled>Select transfer id</option>
                {receivable.map(id => {
                  const k = id.toString();
                  const meta = transferMeta[k] || {};
                  const labelParts = [k];
                  if (meta.batch) labelParts.push(meta.batch);
                  if (meta.itemName) labelParts.push(meta.itemName + (meta.unit ? ` (${meta.unit})` : ''));
                  if (meta.quantity !== undefined) labelParts.push(`qty ${meta.quantity.toString()}`);
                  const label = labelParts.join(' — ');
                  return (
                    <option key={k} value={k}>{label}</option>
                  );
                })}
              </select>
          <button id="btnReceive" onClick={receiveBatch} disabled={!!pending.receive}>Receive</button>
            </div>
          </div>

          <h3 style={{ marginTop: '1.25rem' }}>Your Transfers By Status</h3>
          <ul id="userStatusLists">
            <li>
              <strong>Proposed:</strong>{' '}
              {myBatches.proposed.length ? (
                myBatches.proposed.map(id => {
                  const k = id.toString();
                  const m = transferMeta[k] || {};
                  const name = m.itemName || 'Unknown item';
                  const q = m.quantity !== undefined ? m.quantity.toString() : '';
                  const u = m.unit || '';
                  const label = q && u ? `${name} (${q} ${u})` : q ? `${name} (${q})` : name;
                  return (
                    <span key={`prop-${k}`} style={{ marginRight: '0.5rem' }}>
                      {label}
                      <button style={{ marginLeft: '0.25rem' }} disabled={!!pending.cancelPropose} onClick={() => cancelProposed(id)}>Cancel transfer</button>
                    </span>
                  );
                })
              ) : 'none'}
            </li>
            <li>
              <strong>Confirmed:</strong>{' '}
              {myBatches.confirmed.length ? (
                myBatches.confirmed.map(id => {
                  const k = id.toString();
                  const m = transferMeta[k] || {};
                  const name = m.itemName || 'Unknown item';
                  const q = m.quantity !== undefined ? m.quantity.toString() : '';
                  const u = m.unit || '';
                  const label = q && u ? `${name} (${q} ${u})` : q ? `${name} (${q})` : name;
                  return (
                    <span key={`conf-${k}`} style={{ marginRight: '0.5rem' }}>{label}</span>
                  );
                })
              ) : 'none'}
            </li>
            <li>
              <strong>Shipped:</strong>{' '}
              {myBatches.shipped.length ? (
                myBatches.shipped.map(id => {
                  const k = id.toString();
                  const m = transferMeta[k] || {};
                  const name = m.itemName || 'Unknown item';
                  const q = m.quantity !== undefined ? m.quantity.toString() : '';
                  const u = m.unit || '';
                  const label = q && u ? `${name} (${q} ${u})` : q ? `${name} (${q})` : name;
                  return (
                    <span key={`ship-${k}`} style={{ marginRight: '0.5rem' }}>
                      {label}
                      <button style={{ marginLeft: '0.25rem' }} disabled={!!pending.cancelShip} onClick={() => cancelShipped(id)}>Cancel shipping</button>
                    </span>
                  );
                })
              ) : 'none'}
            </li>
            <li>
              <strong>Received:</strong>{' '}
              {myBatches.received.length ? (
                myBatches.received.map(id => {
                  const k = id.toString();
                  const m = transferMeta[k] || {};
                  const name = m.itemName || 'Unknown item';
                  const q = m.quantity !== undefined ? m.quantity.toString() : '';
                  const u = m.unit || '';
                  const label = q && u ? `${name} (${q} ${u})` : q ? `${name} (${q})` : name;
                  return (
                    <span key={`recv-${k}`} style={{ marginRight: '0.5rem' }}>{label}</span>
                  );
                })
              ) : 'none'}
            </li>
          </ul>
          <h3>Transfers Requiring Your Action</h3>
          <ul id="turnStatusLists">
            <li>
              <strong>Confirm:</strong>{' '}
              {myTurn.confirm.length ? myTurn.confirm.map(id => {
                const k = id.toString();
                const m = transferMeta[k] || {};
                const name = m.itemName || 'Unknown item';
                const q = m.quantity !== undefined ? m.quantity.toString() : '';
                const u = m.unit || '';
                if (q && u) return `${name} (${q} ${u})`;
                if (q) return `${name} (${q})`;
                return name;
              }).join(', ') : 'none'}
            </li>
            <li>
              <strong>Ship:</strong>{' '}
              {myTurn.ship.length ? myTurn.ship.map(id => {
                const k = id.toString();
                const m = transferMeta[k] || {};
                const name = m.itemName || 'Unknown item';
                const q = m.quantity !== undefined ? m.quantity.toString() : '';
                const u = m.unit || '';
                if (q && u) return `${name} (${q} ${u})`;
                if (q) return `${name} (${q})`;
                return name;
              }).join(', ') : 'none'}
            </li>
            <li>
              <strong>Receive:</strong>{' '}
              {myTurn.receive.length ? myTurn.receive.map(id => {
                const k = id.toString();
                const m = transferMeta[k] || {};
                const name = m.itemName || 'Unknown item';
                const q = m.quantity !== undefined ? m.quantity.toString() : '';
                const u = m.unit || '';
                if (q && u) return `${name} (${q} ${u})`;
                if (q) return `${name} (${q})`;
                return name;
              }).join(', ') : 'none'}
            </li>
          </ul>

          <div className="step-card" style={{ marginTop: '1rem' }}>
            <div className="step-header"><span className="step-badge">i</span><h3 style={{ margin: 0 }}>Check Status</h3></div>
            <div className="step-sub">Look up the current status code by transfer id.</div>
            <input id="statusBatchId" value={statusId} onChange={e => setStatusId(e.target.value)} placeholder="Transfer ID" type="number" />
            <button id="btnStatus" onClick={checkStatus}>Get Status</button>
            <pre id="statusOutput">{statusOutput}</pre>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
