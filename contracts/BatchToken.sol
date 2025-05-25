// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BatchToken {
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
        emit TransferProposed(batchId, msg.sender, to, plannedShipDate);
    }

    /// @notice Confirm a pending transfer of batch `batchId`
    function confirmTransfer(uint256 batchId) external {
        emit TransferConfirmed(batchId, msg.sender);
    }

    /// @notice Mark batch `batchId` as shipped
    function shipBatch(uint256 batchId) external {
        emit BatchShipped(batchId);
    }

    /// @notice Mark batch `batchId` as received
    function receiveBatch(uint256 batchId) external {
        emit BatchReceived(batchId);
    }
}
