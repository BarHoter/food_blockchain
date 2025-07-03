const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const ADDRESS_FILE = path.join(__dirname, "..", "address.txt");

async function main() {
  // Compile & deploy to the configured network
  const BatchToken = await ethers.getContractFactory("BatchToken");
  console.log("Deploying BatchToken...");
  const token = await BatchToken.deploy();
  await token.waitForDeployment();    // ← ethers v6 replacement for deployed()
  console.log("BatchToken deployed at:", token.target);

  try {
    await fs.promises.mkdir(path.dirname(ADDRESS_FILE), { recursive: true });
    await fs.promises.writeFile(ADDRESS_FILE, token.target.toString());
    console.log("Saved address to", ADDRESS_FILE);
  } catch (err) {
    console.warn("Failed to save address", err);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
