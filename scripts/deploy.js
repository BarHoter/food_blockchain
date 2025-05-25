const { ethers } = require("hardhat");

async function main() {
  // Compile & deploy to the configured network
  const BatchToken = await ethers.getContractFactory("BatchToken");
  console.log("Deploying BatchToken...");
  const token = await BatchToken.deploy();
  await token.deployed();
  console.log("BatchToken deployed at:", token.address);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
