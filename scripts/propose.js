const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadAddress() {
  if (process.env.CONTRACT_ADDRESS) return process.env.CONTRACT_ADDRESS;
  const file = path.join(__dirname, "..", "addresses.json");
  try {
    const map = JSON.parse(fs.readFileSync(file, "utf8"));
    const net = process.env.NETWORK || network.name;
    if (map[net]) return map[net];
  } catch (_) {}
  throw new Error("Contract address not found. Set CONTRACT_ADDRESS or add it to addresses.json");
}

async function main() {
  const address = loadAddress();
  const [owner] = await ethers.getSigners();
  const token = await ethers.getContractAt("BatchToken", address);
  const tx = await token.proposeTransfer(123, owner.address, Math.floor(Date.now() / 1000));
  await tx.wait();
  console.log("Proposed batch 123");
}

main().catch((err) => { console.error(err); process.exit(1); });
