// file: test/BatchToken.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("BatchToken", function () {
    let token, owner, addr1, addr2;

    beforeEach(async () => {
        [owner, addr1, addr2] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("BatchToken");
        token = await Factory.deploy();
        await token.waitForDeployment();
        console.log("Deployed at:", token.target); // ethers v6 uses .target instead of .address
        await token.addActor(addr1.address);
    });

    it("emits TransferProposed correctly", async () => {
        await expect(
            token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 1_700_000_000, "BATCH-42", "ITEM42", 10)
        )
            .to.emit(token, "TransferProposed")
            .withArgs(anyValue, owner.address, addr1.address, 1_700_000_000, 10);
    });

    it("handles the happy path", async () => {
        await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-1", "ITEM1", 5);
        const proposed = await token.transfersInStatus(1);
        const id = proposed[proposed.length - 1];

        await expect(token.connect(addr1).confirmTransfer(id))
            .to.emit(token, "TransferConfirmed")
            .withArgs(id, addr1.address);

        await expect(token.shipTransfer(id))
            .to.emit(token, "TransferShipped")
            .withArgs(id);

        await expect(token.connect(addr1).receiveTransfer(id))
            .to.emit(token, "TransferReceived")
            .withArgs(id);
    });

    it("reverts on invalid transitions", async () => {
        await expect(token.confirmTransfer(99)).to.be.revertedWith("not proposed");

        // Create a new transfer and validate guards
        await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-2", "ITEM2", 7);
        const prop = await token.transfersInStatus(1);
        const id = prop[prop.length - 1];

        await expect(token.shipTransfer(id)).to.be.revertedWith("not confirmed");
        await expect(token.receiveTransfer(id)).to.be.revertedWith("not shipped");

        await expect(token.confirmTransfer(id)).to.be.revertedWith("only recipient");
        await token.connect(addr1).confirmTransfer(id);
        await expect(token.connect(addr1).confirmTransfer(id)).to.be.revertedWith(
            "not proposed"
        );

        await expect(token.connect(addr1).receiveTransfer(id)).to.be.revertedWith(
            "not shipped"
        );
    });

    it("rejects self transfer", async () => {
        await expect(
            token["proposeTransfer(address,uint256,string,string,uint256)"](owner.address, 0, "BATCH-99", "ITEM99", 1)
        ).to.be.revertedWith("invalid recipient");
    });

    it("enforces sender/recipient permissions", async () => {
        await token["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-3", "ITEM3", 3);
        const proposed = await token.transfersInStatus(1);
        const id = proposed[proposed.length - 1];

        await expect(token.confirmTransfer(id)).to.be.revertedWith(
            "only recipient"
        );
        await token.connect(addr1).confirmTransfer(id);

        await expect(token.connect(addr1).shipTransfer(id)).to.be.revertedWith(
            "only sender"
        );
        await token.shipTransfer(id);

        await expect(token.receiveTransfer(id)).to.be.revertedWith("only recipient");
        await token.connect(addr1).receiveTransfer(id);
    });

    it("restricts access to actors or admin", async () => {
        await expect(
            token.connect(addr2).addActor(addr2.address)
        ).to.be.revertedWith("only admin");

        await expect(
            token.connect(addr2)["proposeTransfer(address,uint256,string,string,uint256)"](addr1.address, 0, "BATCH-5", "ITEM5", 1)
        ).to.be.revertedWith("only actor");

        await token["proposeTransfer(address,uint256,string,string,uint256)"](addr2.address, 0, "BATCH-5", "ITEM5", 1);
        const proposed2 = await token.transfersInStatus(1);
        const id = proposed2[proposed2.length - 1];
        await expect(token.connect(addr2).confirmTransfer(id)).to.be.revertedWith(
            "only actor"
        );
        await token.addActor(addr2.address);
        await token.connect(addr2).confirmTransfer(id);
        await token.shipTransfer(id);
        await token.connect(addr2).receiveTransfer(id);
    });
});
