// file: test/BatchToken.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BatchToken", function () {
    let token, owner, addr1;

    beforeEach(async () => {
        [owner, addr1] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("BatchToken");
        token = await Factory.deploy();
        await token.waitForDeployment();
        console.log("Deployed at:", token.target); // ethers v6 uses .target instead of .address
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

        await expect(token.confirmTransfer(1))
            .to.emit(token, "TransferConfirmed")
            .withArgs(1, owner.address);

        await expect(token.shipBatch(1))
            .to.emit(token, "BatchShipped")
            .withArgs(1);

        await expect(token.receiveBatch(1))
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

        await token.confirmTransfer(2);
        await expect(token.confirmTransfer(2)).to.be.revertedWith("not proposed");

        await expect(token.receiveBatch(2)).to.be.revertedWith("not shipped");
    });
});
