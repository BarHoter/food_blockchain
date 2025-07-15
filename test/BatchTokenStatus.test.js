const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BatchToken status tracking", function () {
  let token, owner, addr1;
  beforeEach(async () => {
    [owner, addr1] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BatchToken");
    token = await Factory.deploy();
    await token.waitForDeployment();
    await token.addActor(addr1.address);
  });

  it("tracks status across the lifecycle", async () => {
    const id = 7;
    await token.proposeTransfer(id, addr1.address, 0);
    expect(await token.status(id)).to.equal(1); // Proposed

    await token.connect(addr1).confirmTransfer(id);
    expect(await token.status(id)).to.equal(2); // Confirmed

    await token.shipBatch(id);
    expect(await token.status(id)).to.equal(3); // Shipped

    await token.connect(addr1).receiveBatch(id);
    expect(await token.status(id)).to.equal(4); // Received
  });

  it("maintains lists of batches by status", async () => {
    await token.proposeTransfer(1, addr1.address, 0);
    await token.proposeTransfer(2, addr1.address, 0);

    let proposed = await token.batchesInStatus(1);
    expect(proposed.map(n => Number(n))).to.have.members([1, 2]);

    await token.connect(addr1).confirmTransfer(1);
    proposed = await token.batchesInStatus(1);
    let confirmed = await token.batchesInStatus(2);
    expect(proposed.map(n => Number(n))).to.deep.equal([2]);
    expect(confirmed.map(n => Number(n))).to.deep.equal([1]);

    await token.shipBatch(1);
    confirmed = await token.batchesInStatus(2);
    let shipped = await token.batchesInStatus(3);
    expect(confirmed.length).to.equal(0);
    expect(shipped.map(n => Number(n))).to.deep.equal([1]);

    await token.connect(addr1).receiveBatch(1);
    shipped = await token.batchesInStatus(3);
    const received = await token.batchesInStatus(4);
    expect(shipped.length).to.equal(0);
    expect(received.map(n => Number(n))).to.deep.equal([1]);
  });
});
