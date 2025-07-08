// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Batch token lifecycle contract
/// @notice Implements a four-step batch-transfer state machine.
/// @dev proposeTransfer -> confirmTransfer -> shipBatch -> receiveBatch

contract BatchToken {
    enum Status {
        None,
        Proposed,
        Confirmed,
        Shipped,
        Received
    }

    /// @notice Current status of each batch id
    mapping(uint256 => Status) public status;
    /// @dev Dynamic arrays keyed by Status enum value listing all batch ids in
    ///      that status. These arrays are modified as batches progress through
    ///      the lifecycle.
    mapping(uint8 => uint256[]) private batchesByStatus;
    /// @dev Index of a batch id inside its current status array. This allows
    ///      O(1) removal when the batch changes status.
    mapping(uint256 => uint256) private indexInList;
    /// @notice Address that initiated the transfer for a batch
    mapping(uint256 => address) public senderOf;
    /// @notice Intended recipient who must confirm and receive the batch
    mapping(uint256 => address) public recipientOf;
    // Events for each step in the lifecycle
    /// @notice Emitted when a transfer has been proposed
    event TransferProposed(
        uint256 indexed batchId,
        address indexed from,
        address indexed to,
        uint256 plannedShipDate
    );
    /// @notice Emitted when a proposed transfer is confirmed by the receiver
    event TransferConfirmed(uint256 indexed batchId, address indexed by);
    /// @notice Emitted when a confirmed batch is marked as shipped
    event BatchShipped(uint256 indexed batchId);
    /// @notice Emitted when a shipped batch is marked as received
    event BatchReceived(uint256 indexed batchId);

    /**
     * @notice Propose a transfer of a food batch.
     * @param batchId Unique identifier of the batch token.
     * @param to Receiver address that must later confirm.
     * @param plannedShipDate UNIX timestamp when shipping is expected to start.
     * @dev Emits {TransferProposed}. Reverts if already proposed.
     */
    function proposeTransfer(
        uint256 batchId,
        address to,
        uint256 plannedShipDate
    ) external {
        // Sender becomes the originator of the batch and cannot be changed
        // until the lifecycle completes.
        require(status[batchId] == Status.None, "already initiated"); // Guard: must be new
        senderOf[batchId] = msg.sender;
        recipientOf[batchId] = to;
        status[batchId] = Status.Proposed;
        indexInList[batchId] = batchesByStatus[uint8(Status.Proposed)].length;
        batchesByStatus[uint8(Status.Proposed)].push(batchId);
        emit TransferProposed(batchId, msg.sender, to, plannedShipDate);
    }

    /**
     * @notice Confirm a pending transfer of a food batch.
     * @param batchId Unique identifier of the batch token.
     * @dev Emits {TransferConfirmed}. Reverts unless transfer was proposed.
     */
    function confirmTransfer(uint256 batchId) external {
        // Only the designated recipient is allowed to accept the transfer.
        require(status[batchId] == Status.Proposed, "not proposed"); // Guard: requires proposed
        require(msg.sender == recipientOf[batchId], "only recipient");
        _removeFromList(batchId, Status.Proposed);
        status[batchId] = Status.Confirmed;
        indexInList[batchId] = batchesByStatus[uint8(Status.Confirmed)].length;
        batchesByStatus[uint8(Status.Confirmed)].push(batchId);
        emit TransferConfirmed(batchId, msg.sender);
    }

    /**
     * @notice Mark the batch as shipped.
     * @param batchId Unique identifier of the batch token.
     * @dev Emits {BatchShipped}. Reverts unless transfer is confirmed.
     */
    function shipBatch(uint256 batchId) external {
        // Shipping can only be triggered by the original sender.
        require(status[batchId] == Status.Confirmed, "not confirmed"); // Guard: requires confirmed
        require(msg.sender == senderOf[batchId], "only sender");
        _removeFromList(batchId, Status.Confirmed);
        status[batchId] = Status.Shipped;
        indexInList[batchId] = batchesByStatus[uint8(Status.Shipped)].length;
        batchesByStatus[uint8(Status.Shipped)].push(batchId);
        emit BatchShipped(batchId);
    }

    /**
     * @notice Mark the batch as received by the destination.
     * @param batchId Unique identifier of the batch token.
     * @dev Emits {BatchReceived}. Reverts unless batch has been shipped.
     */
    function receiveBatch(uint256 batchId) external {
        // The batch is considered delivered only after the intended recipient
        // acknowledges receipt.
        require(status[batchId] == Status.Shipped, "not shipped"); // Guard: shipped state required
        require(msg.sender == recipientOf[batchId], "only recipient");
        _removeFromList(batchId, Status.Shipped);
        status[batchId] = Status.Received;
        indexInList[batchId] = batchesByStatus[uint8(Status.Received)].length;
        batchesByStatus[uint8(Status.Received)].push(batchId);
        emit BatchReceived(batchId);
    }

    /// @notice Return all batch ids that currently have the given status
    function batchesInStatus(Status s) external view returns (uint256[] memory) {
        return batchesByStatus[uint8(s)];
    }

    /// @dev Remove a batch id from the array for its current status.
    ///      Uses swap-and-pop to keep the array compact and update the stored
    ///      index of the element that was moved.
    function _removeFromList(uint256 batchId, Status s) internal {
        uint8 key = uint8(s);
        uint256 index = indexInList[batchId];
        uint256[] storage arr = batchesByStatus[key];
        uint256 last = arr[arr.length - 1];
        arr[index] = last; // Move last element into the removed spot
        indexInList[last] = index;
        arr.pop();
    }
}
