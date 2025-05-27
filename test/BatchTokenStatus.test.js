const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BatchToken status tracking", function () {
  let token, owner, addr1;
  beforeEach(async () => {
    [owner, addr1] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BatchToken");
    token = await Factory.deploy();
    await token.waitForDeployment();
  });

  it("tracks status across the lifecycle", async () => {
    const id = 7;
    await token.proposeTransfer(id, addr1.address, 0);
    expect(await token.status(id)).to.equal(1); // Proposed

    await token.confirmTransfer(id);
    expect(await token.status(id)).to.equal(2); // Confirmed

    await token.shipBatch(id);
    expect(await token.status(id)).to.equal(3); // Shipped

    await token.receiveBatch(id);
    expect(await token.status(id)).to.equal(4); // Received
  });
});
