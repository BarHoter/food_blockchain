// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BatchToken {
    enum Status {
        None,
        Proposed,
        Confirmed,
        Shipped,
        Received
    }

    mapping(uint256 => Status) public status;
    // Events for each step in the lifecycle
    event TransferProposed(
        uint256 indexed batchId,
        address indexed from,
        address indexed to,
        uint256 plannedShipDate
    );
    event TransferConfirmed(uint256 indexed batchId, address indexed by);
    event BatchShipped(uint256 indexed batchId);
    event BatchReceived(uint256 indexed batchId);

    /// @notice Propose a transfer of batch `batchId` to `to` at `plannedShipDate`
    function proposeTransfer(
        uint256 batchId,
        address to,
        uint256 plannedShipDate
    ) external {
        require(status[batchId] == Status.None, "already initiated");
        status[batchId] = Status.Proposed;
        emit TransferProposed(batchId, msg.sender, to, plannedShipDate);
    }

    /// @notice Confirm a pending transfer of batch `batchId`
    function confirmTransfer(uint256 batchId) external {
        require(status[batchId] == Status.Proposed, "not proposed");
        status[batchId] = Status.Confirmed;
        emit TransferConfirmed(batchId, msg.sender);
    }

    /// @notice Mark batch `batchId` as shipped
    function shipBatch(uint256 batchId) external {
        require(status[batchId] == Status.Confirmed, "not confirmed");
        status[batchId] = Status.Shipped;
        emit BatchShipped(batchId);
    }

    /// @notice Mark batch `batchId` as received
    function receiveBatch(uint256 batchId) external {
        require(status[batchId] == Status.Shipped, "not shipped");
        status[batchId] = Status.Received;
        emit BatchReceived(batchId);
    }
}
