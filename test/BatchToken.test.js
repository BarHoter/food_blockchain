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
    // add more tests here…
});
