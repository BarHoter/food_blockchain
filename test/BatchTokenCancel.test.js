const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BatchToken cancel flows", function () {
  let token, owner, addr1, addr2;
  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BatchToken");
    token = await Factory.deploy();
    await token.waitForDeployment();
    await token.addActor(addr1.address);
  });

  it("allows sender to cancel a proposed transfer", async () => {
    await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-C1", "ITEMC1", 1);
    const proposed = await token.transfersInStatus(1);
    const id = proposed[proposed.length - 1];

    await expect(token.cancelTransfer(id))
      .to.emit(token, "TransferCanceled")
      .withArgs(id, owner.address);

    expect(await token.status(id)).to.equal(0); // None
    const proposedAfter = await token.transfersInStatus(1);
    expect(proposedAfter.map(n => Number(n))).to.not.include(Number(id));
  });

  it("allows recipient to cancel a proposed transfer", async () => {
    await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-C2", "ITEMC2", 1);
    const proposed = await token.transfersInStatus(1);
    const id = proposed[proposed.length - 1];

    await expect(token.connect(addr1).cancelTransfer(id))
      .to.emit(token, "TransferCanceled")
      .withArgs(id, addr1.address);

    expect(await token.status(id)).to.equal(0); // None
  });

  it("prevents non-parties from canceling a proposed transfer", async () => {
    await token.addActor(addr2.address);
    await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-C3", "ITEMC3", 1);
    const proposed = await token.transfersInStatus(1);
    const id = proposed[proposed.length - 1];

    await expect(token.connect(addr2).cancelTransfer(id)).to.be.revertedWith("only parties");
  });

  it("allows canceling shipping back to confirmed by sender and recipient", async () => {
    await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-C4", "ITEMC4", 1);
    let ids = await token.transfersInStatus(1);
    const id = ids[ids.length - 1];
    await token.connect(addr1).confirmTransfer(id);
    await token.shipTransfer(id);

    // Sender cancels shipping
    await expect(token.cancelShipping(id))
      .to.emit(token, "TransferUnshipped")
      .withArgs(id, owner.address);
    expect(await token.status(id)).to.equal(2); // Confirmed
    let shipped = await token.transfersInStatus(3);
    let confirmed = await token.transfersInStatus(2);
    expect(shipped.map(n => Number(n))).to.not.include(Number(id));
    expect(confirmed.map(n => Number(n))).to.include(Number(id));

    // Re-ship then recipient cancels shipping
    await token.shipTransfer(id);
    await expect(token.connect(addr1).cancelShipping(id))
      .to.emit(token, "TransferUnshipped")
      .withArgs(id, addr1.address);
    expect(await token.status(id)).to.equal(2);
  });

  it("prevents non-parties from canceling shipping and guards state", async () => {
    await token.addActor(addr2.address);
    await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-C5", "ITEMC5", 1);
    const prop = await token.transfersInStatus(1);
    const id = prop[prop.length - 1];

    // Cannot cancel shipping when not shipped
    await expect(token.cancelShipping(id)).to.be.revertedWith("not shipped");

    await token.connect(addr1).confirmTransfer(id);
    await expect(token.cancelShipping(id)).to.be.revertedWith("not shipped");

    await token.shipTransfer(id);
    await expect(token.connect(addr2).cancelShipping(id)).to.be.revertedWith("only parties");
  });
});

