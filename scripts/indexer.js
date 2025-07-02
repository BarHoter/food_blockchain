const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const artifact = require("../artifacts/contracts/BatchToken.sol/BatchToken.json");

async function main() {
  const providerUrl = process.env.PROVIDER_URL || "http://localhost:8545";
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error("CONTRACT_ADDRESS env var is required");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(providerUrl);
  const contract = new ethers.Contract(contractAddress, artifact.abi, provider);

  // Fetch all events from block 0 to the latest block
  const logs = await contract.queryFilter("*", 0, "latest");
  const events = logs.map(log => ({
    event: log.event,
    args: log.args,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash
  }));

  const outDir = path.join(__dirname, "..", "indexer");
  await fs.promises.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "events.json");
  await fs.promises.writeFile(outFile, JSON.stringify(events, null, 2));
  console.log(`Saved ${events.length} events to ${outFile}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
