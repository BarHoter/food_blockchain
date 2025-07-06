const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const address = fs.readFileSync(path.join(__dirname, "..", "address.txt"), "utf8").trim();
  const [owner] = await ethers.getSigners();
  const token = await ethers.getContractAt("BatchToken", address);
  const tx = await token.proposeTransfer(123, owner.address, Math.floor(Date.now() / 1000));
  await tx.wait();
  console.log("Proposed batch 123");
}

main().catch((err) => { console.error(err); process.exit(1); });
