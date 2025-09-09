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
    await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-7", "ITEM7", 4);
    const proposed = await token.transfersInStatus(1);
    const id = proposed[proposed.length - 1];
    expect(await token.status(id)).to.equal(1); // Proposed

    await token.connect(addr1).confirmTransfer(id);
    expect(await token.status(id)).to.equal(2); // Confirmed

    await token.shipTransfer(id);
    expect(await token.status(id)).to.equal(3); // Shipped

    await token.connect(addr1).receiveTransfer(id);
    expect(await token.status(id)).to.equal(4); // Received
  });

  it("maintains lists of transfers by status", async () => {
    await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-1", "ITEM1", 2);
    let proposed = await token.transfersInStatus(1);
    const id1 = proposed[proposed.length - 1];
    await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-2", "ITEM2", 3);
    proposed = await token.transfersInStatus(1);
    const id2 = proposed[proposed.length - 1];

    proposed = await token.transfersInStatus(1);
    expect(proposed.map(n => Number(n))).to.have.members([Number(id1), Number(id2)]);

    await token.connect(addr1).confirmTransfer(id1);
    proposed = await token.transfersInStatus(1);
    let confirmed = await token.transfersInStatus(2);
    expect(proposed.map(n => Number(n))).to.deep.equal([Number(id2)]);
    expect(confirmed.map(n => Number(n))).to.deep.equal([Number(id1)]);

    await token.shipTransfer(id1);
    confirmed = await token.transfersInStatus(2);
    let shipped = await token.transfersInStatus(3);
    expect(confirmed.length).to.equal(0);
    expect(shipped.map(n => Number(n))).to.deep.equal([Number(id1)]);

    await token.connect(addr1).receiveTransfer(id1);
    shipped = await token.transfersInStatus(3);
    const received = await token.transfersInStatus(4);
    expect(shipped.length).to.equal(0);
    expect(received.map(n => Number(n))).to.deep.equal([Number(id1)]);
  });
});
