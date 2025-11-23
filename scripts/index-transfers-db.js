const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const artifact = require("../artifacts/contracts/BatchToken.sol/BatchToken.json");
const pool = require("./db");

const ENV_PATH = path.join(__dirname, "..", ".env");
if (fs.existsSync(ENV_PATH)) {
  dotenv.config({ path: ENV_PATH });
}

const { INFURA_PROJECT_ID } = process.env;
const PROVIDER_URL =
  process.env.PROVIDER_URL ||
  (INFURA_PROJECT_ID
    ? `https://sepolia.infura.io/v3/${INFURA_PROJECT_ID}`
    : "http://localhost:8545");
const ADDRESS_FILE = path.join(__dirname, "..", "addresses.json");
const NETWORK = process.env.NETWORK;
let CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
if (!CONTRACT_ADDRESS) {
  try {
    const data = fs.readFileSync(ADDRESS_FILE, "utf8");
    const map = JSON.parse(data);
    const net = NETWORK || Object.keys(map)[0];
    const addr = map[net];
    if (addr) {
      CONTRACT_ADDRESS = addr;
      console.log("Using %s contract address from %s", net, ADDRESS_FILE);
    } else if (NETWORK) {
      console.warn(`No address for network ${NETWORK} in ${ADDRESS_FILE}`);
    }
  } catch (_) {}
}

const FINALITY_LAG = parseInt(process.env.FINALITY_LAG || "0", 10);
const OUT_DIR = path.join(__dirname, "..", "indexer");
const CHECKPOINT_FILE = path.join(OUT_DIR, "transfers.checkpoint.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCheckpoint() {
  try {
    const data = await fs.promises.readFile(CHECKPOINT_FILE, "utf8");
    const parsed = JSON.parse(data);
    return {
      lastIndexedBlock: parsed.lastIndexedBlock || 0,
      contractAddress: parsed.contractAddress || null,
    };
  } catch (_) {
    return { lastIndexedBlock: 0, contractAddress: null };
  }
}

async function transferChangesEmpty() {
  try {
    const res = await pool.query("SELECT 1 FROM transfer_changes LIMIT 1");
    return res.rows.length === 0;
  } catch (_) {
    return true;
  }
}

async function saveCheckpoint(blockNumber) {
  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  await fs.promises.writeFile(
    CHECKPOINT_FILE,
    JSON.stringify(
      { lastIndexedBlock: blockNumber, contractAddress: CONTRACT_ADDRESS },
      null,
      2
    )
  );
}

async function resetCheckpoint() {
  try {
    await fs.promises.unlink(CHECKPOINT_FILE);
  } catch (_) {}
}

async function queryWithRetry(contract, filter, from, to) {
  let attempt = 0;
  while (true) {
    try {
      return await contract.queryFilter(filter, from, to);
    } catch (err) {
      attempt += 1;
      const delay = Math.min(1000 * 2 ** attempt, 30000);
      console.error(`RPC error: ${err.message || err}. retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
}

function eventName(log) {
  return log.event || log.name || (log.fragment && log.fragment.name) || "";
}

function normalizeId(raw) {
  try {
    return Number(raw);
  } catch (_) {
    try {
      return Number(BigInt(raw));
    } catch (_) {
      return NaN;
    }
  }
}

function toNumber(raw) {
  if (raw === undefined || raw === null) return null;
  try {
    return Number(BigInt(raw));
  } catch (_) {
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }
}

function toStringVal(raw) {
  if (raw === undefined || raw === null) return null;
  try {
    return raw.toString();
  } catch (_) {
    return String(raw);
  }
}

function statusForEvent(name) {
  switch (name) {
    case "TransferProposed":
      return "Proposed";
    case "TransferConfirmed":
      return "Confirmed";
    case "TransferShipped":
      return "Shipped";
    case "TransferReceived":
      return "Received";
    case "TransferCanceled":
      return "Canceled";
    case "TransferUnshipped":
      return "Confirmed";
    default:
      return null;
  }
}

function statusFromEnum(v) {
  const n = toNumber(v);
  switch (n) {
    case 1:
      return "Proposed";
    case 2:
      return "Confirmed";
    case 3:
      return "Shipped";
    case 4:
      return "Received";
    default:
      return "None";
  }
}

async function hydrateFromChain(contract, row) {
  const id = row.transfer_id;
  try {
    if (!row.batch_external_id) {
      row.batch_external_id = await contract.batchOf(id);
    }
  } catch (_) {}
  try {
    if (!row.quantity) {
      const qty = await contract.quantityOf(id);
      row.quantity = toStringVal(qty);
    }
  } catch (_) {}
  try {
    if (!row.sender) {
      row.sender = await contract.senderOf(id);
    }
  } catch (_) {}
  try {
    if (!row.recipient) {
      row.recipient = await contract.recipientOf(id);
    }
  } catch (_) {}
  try {
    if (!row.status) {
      row.status = statusFromEnum(await contract.status(id));
    }
  } catch (_) {}
  try {
    if (!row.item_id && row.batch_external_id) {
      const itemId = await contract.itemOfBatch(row.batch_external_id);
      row.item_id = itemId || null;
    }
  } catch (_) {}
  return row;
}

async function main() {
  const dbInfo = typeof pool.getDbInfo === "function" ? pool.getDbInfo() : { configured: false };
  if (!dbInfo.configured) {
    console.log("DB not configured; skipping transfer index.");
    return;
  }

  if (typeof pool.ensureSchema === "function") {
    await pool.ensureSchema();
  }

  if (!CONTRACT_ADDRESS) {
    console.error("CONTRACT_ADDRESS env var is required (or provide addresses.json)");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, provider);

  const { lastIndexedBlock, contractAddress } = await loadCheckpoint();
  const changesEmpty = await transferChangesEmpty();

  if (contractAddress && contractAddress.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) {
    console.log(
      `Contract address changed from ${contractAddress} to ${CONTRACT_ADDRESS}. resetting transfer index and table`
    );
    await resetCheckpoint();
    try {
      await pool.query("TRUNCATE transfer_statuses");
    } catch (err) {
      console.warn("Failed to truncate transfer_statuses:", err.message || err);
    }
  }

  const latestBlock = await provider.getBlockNumber();
  const toBlock = latestBlock - FINALITY_LAG;
  const checkpoint = changesEmpty ? 0 : (lastIndexedBlock ? lastIndexedBlock : 0);
  const fromBlock = checkpoint ? checkpoint + 1 : 0;

  if (toBlock < fromBlock) {
    console.log("No new blocks to index for transfers.");
    return;
  }

  const filters = [
    { name: "TransferProposed", filter: contract.filters.TransferProposed() },
    { name: "TransferConfirmed", filter: contract.filters.TransferConfirmed() },
    { name: "TransferShipped", filter: contract.filters.TransferShipped() },
    { name: "TransferReceived", filter: contract.filters.TransferReceived() },
    { name: "TransferCanceled", filter: contract.filters.TransferCanceled() },
    { name: "TransferUnshipped", filter: contract.filters.TransferUnshipped() },
  ];

  const logs = [];
  for (const entry of filters) {
    const l = await queryWithRetry(contract, entry.filter, fromBlock, toBlock);
    for (const log of l) {
      log.name = entry.name;
      logs.push(log);
    }
  }

  if (logs.length === 0) {
    console.log(`No transfer events found. Advancing checkpoint to ${toBlock}`);
    await saveCheckpoint(toBlock);
    return;
  }

  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
    return a.logIndex - b.logIndex;
  });

  const uniqueBlocks = [...new Set(logs.map((l) => l.blockNumber))];
  const blockTimeMap = {};
  await Promise.all(
    uniqueBlocks.map(async (n) => {
      try {
        const b = await provider.getBlock(n);
        blockTimeMap[n] = b.timestamp;
      } catch (_) {
        blockTimeMap[n] = null;
      }
    })
  );

  const touchedIds = [...new Set(logs.map((l) => normalizeId(l.args && l.args[0])))].filter((v) =>
    Number.isFinite(v)
  );

  const existing = new Map();
  if (touchedIds.length) {
    try {
      const res = await pool.query(
        "SELECT transfer_id, status, sender, recipient, batch_external_id, item_id, quantity, planned_ship_date, last_event, last_block, last_block_time, last_tx, last_log_index, updated_at FROM transfer_statuses WHERE transfer_id = ANY($1::bigint[])",
        [touchedIds]
      );
      for (const row of res.rows) {
        existing.set(Number(row.transfer_id), { ...row, transfer_id: Number(row.transfer_id) });
      }
    } catch (err) {
      console.warn("Failed to load existing transfer rows:", err.message || err);
    }
  }

  const rows = new Map(existing);
  const changed = new Set();
  const changeRows = [];

  for (const log of logs) {
    const evt = eventName(log);
    const transferId = normalizeId(log.args && log.args[0]);
    if (!Number.isFinite(transferId)) continue;
    const row = rows.get(transferId) || { transfer_id: transferId };

    if (evt === "TransferProposed") {
      row.sender = log.args[1];
      row.recipient = log.args[2];
      row.planned_ship_date = toNumber(log.args[3]);
      row.quantity = toStringVal(log.args[4]);
    }

    const mappedStatus = statusForEvent(evt);
    if (mappedStatus) {
      row.status = mappedStatus;
    }

    row.last_event = evt || null;
    row.last_tx = log.transactionHash || null;
    row.last_log_index = log.logIndex;
    row.last_block = log.blockNumber;
    row.last_block_time = blockTimeMap[log.blockNumber] ?? null;
    row.updated_at = new Date().toISOString();

    rows.set(transferId, row);
    changed.add(transferId);

    changeRows.push({
      transfer_id: transferId,
      event: evt || null,
      status: mappedStatus || row.status || null,
      sender: row.sender || null,
      recipient: row.recipient || null,
      batch_external_id: row.batch_external_id || null,
      item_id: row.item_id || null,
      quantity: row.quantity ?? null,
      block: log.blockNumber,
      block_time: blockTimeMap[log.blockNumber] ?? null,
      tx_hash: log.transactionHash || null,
      log_index: log.logIndex,
    });
  }

  for (const id of changed) {
    const row = rows.get(id);
    await hydrateFromChain(contract, row);
    rows.set(id, row);
  }

  const hydratedChanges = changeRows.map(c => {
    const row = rows.get(c.transfer_id);
    return {
      ...c,
      sender: c.sender || row?.sender || null,
      recipient: c.recipient || row?.recipient || null,
      batch_external_id: c.batch_external_id || row?.batch_external_id || null,
      item_id: c.item_id || row?.item_id || null,
      quantity: c.quantity ?? row?.quantity ?? null,
      status: c.status || row?.status || null,
    };
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const id of changed) {
      const row = rows.get(id);
      const params = [
        row.transfer_id,
        row.status || "Unknown",
        row.sender || null,
        row.recipient || null,
        row.batch_external_id || null,
        row.item_id || null,
        row.quantity ?? null,
        row.planned_ship_date ?? null,
        row.last_event || null,
        row.last_block ?? null,
        row.last_block_time ?? null,
        row.last_tx || null,
        row.last_log_index ?? null,
        row.updated_at || new Date().toISOString(),
      ];
      await client.query(
        `
          INSERT INTO transfer_statuses (
            transfer_id, status, sender, recipient, batch_external_id, item_id, quantity,
            planned_ship_date, last_event, last_block, last_block_time, last_tx, last_log_index, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT (transfer_id) DO UPDATE SET
            status=EXCLUDED.status,
            sender=EXCLUDED.sender,
            recipient=EXCLUDED.recipient,
            batch_external_id=EXCLUDED.batch_external_id,
            item_id=EXCLUDED.item_id,
            quantity=EXCLUDED.quantity,
            planned_ship_date=EXCLUDED.planned_ship_date,
            last_event=EXCLUDED.last_event,
            last_block=EXCLUDED.last_block,
            last_block_time=EXCLUDED.last_block_time,
            last_tx=EXCLUDED.last_tx,
            last_log_index=EXCLUDED.last_log_index,
            updated_at=EXCLUDED.updated_at
        `,
        params
      );
    }
    if (hydratedChanges.length) {
      for (const c of hydratedChanges) {
        const params = [
          c.transfer_id,
          c.event,
          c.status,
          c.sender,
          c.recipient,
          c.batch_external_id,
          c.item_id,
          c.quantity ?? null,
          c.block ?? null,
          c.block_time ?? null,
          c.tx_hash,
          c.log_index ?? null,
        ];
        await client.query(
          `
            INSERT INTO transfer_changes (
              transfer_id, event, status, sender, recipient, batch_external_id,
              item_id, quantity, block, block_time, tx_hash, log_index
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (tx_hash, log_index) DO NOTHING
          `,
          params
        );
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log(
    `Indexed ${logs.length} transfer events across ${changed.size} transfers up to block ${toBlock}`
  );
  await saveCheckpoint(toBlock);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
