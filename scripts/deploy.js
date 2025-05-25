const { ethers } = require("hardhat");

async function main() {
  // Compile & deploy to the configured network
  const BatchToken = await ethers.getContractFactory("BatchToken");
  console.log("Deploying BatchToken...");
  const token = await BatchToken.deploy();
  await token.waitForDeployment();    // ← ethers v6 replacement for deployed()
  console.log("BatchToken deployed at:", token.target);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
