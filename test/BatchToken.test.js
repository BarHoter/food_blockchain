// file: test/BatchToken.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

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
            token.proposeTransfer(42, addr1.address, 1_700_000_000)
        )
            .to.emit(token, "TransferProposed")
            .withArgs(42, owner.address, addr1.address, 1_700_000_000);
    });

    it("handles the happy path", async () => {
        await expect(token.proposeTransfer(1, addr1.address, 0))
            .to.emit(token, "TransferProposed")
            .withArgs(1, owner.address, addr1.address, 0);

        await expect(token.connect(addr1).confirmTransfer(1))
            .to.emit(token, "TransferConfirmed")
            .withArgs(1, addr1.address);

        await expect(token.shipBatch(1))
            .to.emit(token, "BatchShipped")
            .withArgs(1);

        await expect(token.connect(addr1).receiveBatch(1))
            .to.emit(token, "BatchReceived")
            .withArgs(1);
    });

    it("reverts on invalid transitions", async () => {
        await expect(token.confirmTransfer(99)).to.be.revertedWith("not proposed");

        await token.proposeTransfer(2, addr1.address, 0);
        await expect(token.proposeTransfer(2, addr1.address, 0)).to.be.revertedWith(
            "already initiated"
        );

        await expect(token.shipBatch(2)).to.be.revertedWith("not confirmed");
        await expect(token.receiveBatch(2)).to.be.revertedWith("not shipped");

        await expect(token.confirmTransfer(2)).to.be.revertedWith("only recipient");
        await token.connect(addr1).confirmTransfer(2);
        await expect(token.connect(addr1).confirmTransfer(2)).to.be.revertedWith(
            "not proposed"
        );

        await expect(token.connect(addr1).receiveBatch(2)).to.be.revertedWith(
            "not shipped"
        );
    });

    it("rejects self transfer", async () => {
        await expect(
            token.proposeTransfer(99, owner.address, 0)
        ).to.be.revertedWith("invalid recipient");
    });

    it("enforces sender/recipient permissions", async () => {
        await token.proposeTransfer(3, addr1.address, 0);

        await expect(token.confirmTransfer(3)).to.be.revertedWith(
            "only recipient"
        );
        await token.connect(addr1).confirmTransfer(3);

        await expect(token.connect(addr1).shipBatch(3)).to.be.revertedWith(
            "only sender"
        );
        await token.shipBatch(3);

        await expect(token.receiveBatch(3)).to.be.revertedWith("only recipient");
        await token.connect(addr1).receiveBatch(3);
    });

    it("restricts access to actors or admin", async () => {
        await expect(
            token.connect(addr2).addActor(addr2.address)
        ).to.be.revertedWith("only admin");

        await expect(
            token.connect(addr2).proposeTransfer(5, addr1.address, 0)
        ).to.be.revertedWith("only actor");

        await token.proposeTransfer(5, addr2.address, 0);
        await expect(token.connect(addr2).confirmTransfer(5)).to.be.revertedWith(
            "only actor"
        );
        await token.addActor(addr2.address);
        await token.connect(addr2).confirmTransfer(5);
        await token.shipBatch(5);
        await token.connect(addr2).receiveBatch(5);
    });
});
