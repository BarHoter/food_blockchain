// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Batch transfer lifecycle contract
/// @notice Implements a four-step transfer state machine where each transfer
///         has its own unique ID, and multiple transfers may reference the
///         same manufacturing batch identifier.
/// @dev proposeTransfer -> confirmTransfer -> shipBatch -> receiveBatch

contract BatchToken {
    enum Status {
        None,
        Proposed,
        Confirmed,
        Shipped,
        Received
    }

    /// @notice Auto-incrementing id for transfers
    uint256 private _nextTransferId = 1;
    /// @notice Current status of each transfer id
    mapping(uint256 => Status) public status;
    /// @dev Dynamic arrays keyed by Status enum value listing all transfer ids in
    ///      that status. These arrays are modified as transfers progress through
    ///      the lifecycle.
    mapping(uint8 => uint256[]) private batchesByStatus; // kept name for ABI stability elsewhere
    /// @dev Index of a transfer id inside its current status array. This allows
    ///      O(1) removal when the transfer changes status.
    mapping(uint256 => uint256) private indexInList;
    /// @notice Address that initiated the transfer
    mapping(uint256 => address) public senderOf;
    /// @notice Intended recipient who must confirm and receive the transfer
    mapping(uint256 => address) public recipientOf;
    /// @notice Manufacturing batch external id associated with a transfer id
    mapping(uint256 => string) public batchOf;
    /// @notice Quantity associated with the transfer (unit is defined by the item catalog off-chain)
    mapping(uint256 => uint256) public quantityOf;

    /// @notice Contract administrator allowed to manage actors
    address public admin;
    /// @notice Addresses authorized to call lifecycle functions
    mapping(address => bool) public isActor;
    /// @notice Optional mapping of external batch identifier to a catalog item id
    mapping(string => string) public itemOfBatch;
    // Events for each step in the lifecycle
    /// @notice Emitted when an address is granted actor privileges
    event ActorAdded(address indexed actor);
    /// @notice Emitted when an address has actor privileges revoked
    event ActorRemoved(address indexed actor);
    /// @notice Emitted when a transfer has been proposed
    event TransferProposed(
        uint256 indexed transferId,
        address indexed from,
        address indexed to,
        uint256 plannedShipDate,
        uint256 quantity
    );
    /// @notice Emitted when a proposed transfer is confirmed by the receiver
    event TransferConfirmed(uint256 indexed transferId, address indexed by);
    /// @notice Emitted when a confirmed transfer is marked as shipped
    event TransferShipped(uint256 indexed transferId);
    /// @notice Emitted when a shipped transfer is marked as received
    event TransferReceived(uint256 indexed transferId);
    /// @notice Emitted when a batch external id is linked to an item id
    event ItemLinked(string batchExternalId, string itemId);

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin");
        _;
    }

    modifier onlyActor() {
        require(isActor[msg.sender] || msg.sender == admin, "only actor");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function _propose(address to, uint256 plannedShipDate, string memory batchExternalId, uint256 quantity) internal returns (uint256 transferId) {
        require(to != msg.sender, "invalid recipient");
        // Require an existing mapping for this batch
        require(bytes(itemOfBatch[batchExternalId]).length != 0, "item required");
        transferId = _nextTransferId++;
        senderOf[transferId] = msg.sender;
        recipientOf[transferId] = to;
        batchOf[transferId] = batchExternalId;
        quantityOf[transferId] = quantity;
        status[transferId] = Status.Proposed;
        indexInList[transferId] = batchesByStatus[uint8(Status.Proposed)].length;
        batchesByStatus[uint8(Status.Proposed)].push(transferId);
        emit TransferProposed(transferId, msg.sender, to, plannedShipDate, quantity);
    }

    /// @notice Grant actor privileges to an address
    function addActor(address actor) external onlyAdmin {
        require(!isActor[actor], "already actor");
        isActor[actor] = true;
        emit ActorAdded(actor);
    }

    /// @notice Link an external batch identifier to an item id (off-chain catalog)
    /// @param batchExternalId External batch identifier (e.g. barcode/lot string)
    /// @param itemId External item identifier (e.g. SKU string)
    function setItemForBatch(string calldata batchExternalId, string calldata itemId) external onlyAdmin {
        itemOfBatch[batchExternalId] = itemId;
        emit ItemLinked(batchExternalId, itemId);
    }

    /// @notice Revoke actor privileges from an address
    function removeActor(address actor) external onlyAdmin {
        require(isActor[actor], "not actor");
        isActor[actor] = false;
        emit ActorRemoved(actor);
    }

    /**
     * @notice Propose a transfer for an existing manufacturing batch mapping.
     * @param to Receiver address that must later confirm.
     * @param plannedShipDate UNIX timestamp when shipping is expected to start.
     * @param batchExternalId Manufacturing batch identifier (arbitrary string)
     * @param quantity Quantity of units being transferred
     * @return transferId Newly created unique transfer identifier
     */
    function proposeTransfer(
        address to,
        uint256 plannedShipDate,
        string calldata batchExternalId,
        uint256 quantity
    ) external onlyActor returns (uint256 transferId) {
        transferId = _propose(to, plannedShipDate, batchExternalId, quantity);
    }

    /// @notice Propose a transfer and link an external batch id to an item id atomically.
    /// @dev If the batch id is already linked it must match the provided item id.
    /// @param quantity Quantity of units being transferred
    /// @return transferId Newly created unique transfer identifier
    function proposeTransfer(
        address to,
        uint256 plannedShipDate,
        string calldata batchExternalId,
        string calldata itemId,
        uint256 quantity
    ) external onlyActor returns (uint256 transferId) {
        require(bytes(itemId).length != 0, "item required");
        string storage existing = itemOfBatch[batchExternalId];
        if (bytes(existing).length == 0) {
            itemOfBatch[batchExternalId] = itemId;
            emit ItemLinked(batchExternalId, itemId);
        } else {
            require(keccak256(bytes(existing)) == keccak256(bytes(itemId)), "item mismatch");
        }
        transferId = _propose(to, plannedShipDate, batchExternalId, quantity);
    }

    /**
     * @notice Confirm a pending transfer.
     * @param transferId Transfer identifier.
     * @dev Emits {TransferConfirmed}. Reverts unless transfer was proposed.
     */
    function confirmTransfer(uint256 transferId) external onlyActor {
        // Only the designated recipient is allowed to accept the transfer.
        require(status[transferId] == Status.Proposed, "not proposed"); // Guard: requires proposed
        require(msg.sender == recipientOf[transferId], "only recipient");
        _removeFromList(transferId, Status.Proposed);
        status[transferId] = Status.Confirmed;
        indexInList[transferId] = batchesByStatus[uint8(Status.Confirmed)].length;
        batchesByStatus[uint8(Status.Confirmed)].push(transferId);
        emit TransferConfirmed(transferId, msg.sender);
    }

    /**
     * @notice Mark the transfer as shipped.
     * @param transferId Transfer identifier.
     * @dev Emits {TransferShipped}. Reverts unless transfer is confirmed.
     */
    function shipTransfer(uint256 transferId) external onlyActor {
        // Shipping can only be triggered by the original sender.
        require(status[transferId] == Status.Confirmed, "not confirmed"); // Guard: requires confirmed
        require(msg.sender == senderOf[transferId], "only sender");
        _removeFromList(transferId, Status.Confirmed);
        status[transferId] = Status.Shipped;
        indexInList[transferId] = batchesByStatus[uint8(Status.Shipped)].length;
        batchesByStatus[uint8(Status.Shipped)].push(transferId);
        emit TransferShipped(transferId);
    }

    /**
     * @notice Mark the transfer as received by the destination.
     * @param transferId Transfer identifier.
     * @dev Emits {TransferReceived}. Reverts unless transfer has been shipped.
     */
    function receiveTransfer(uint256 transferId) external onlyActor {
        // The transfer is considered delivered only after the intended recipient
        // acknowledges receipt.
        require(status[transferId] == Status.Shipped, "not shipped"); // Guard: shipped state required
        require(msg.sender == recipientOf[transferId], "only recipient");
        _removeFromList(transferId, Status.Shipped);
        status[transferId] = Status.Received;
        indexInList[transferId] = batchesByStatus[uint8(Status.Received)].length;
        batchesByStatus[uint8(Status.Received)].push(transferId);
        emit TransferReceived(transferId);
    }

    /// @notice Return all transfer ids that currently have the given status
    function transfersInStatus(Status s) external view returns (uint256[] memory) {
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
