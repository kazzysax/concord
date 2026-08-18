// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Sweeper} from "./Sweeper.sol";

/// @notice Registry + deployer for per-invoice deposit addresses.
///
/// Deploy this via the canonical deterministic CREATE2 proxy at
/// 0x4e59b44847b379578588920cA78FbF26c0B4956C, using the same salt and the same
/// compiler settings on every chain. That gives the factory an identical
/// address everywhere, which in turn makes every derived Sweeper address
/// identical everywhere.
///
contract InvoiceFactory {
    bytes32 public constant SWEEPER_INIT_CODE_HASH = keccak256(type(Sweeper).creationCode);

    address public owner;
    address public settlementSink;

    mapping(bytes32 => bytes32) public commitmentOf;
    mapping(address => bytes32) public invoiceOfSweeper;

    event InvoiceRegistered(bytes32 indexed invoiceId, bytes32 commitment, address depositAddress);
    event CommitmentAmended(bytes32 indexed invoiceId, bytes32 oldCommitment, bytes32 newCommitment);
    event PaymentSwept(bytes32 indexed invoiceId, address indexed token, uint256 amount, address sweptBy);

    error NotOwner();
    error UnknownInvoice();
    error InvoiceExists();
    error NotASweeper();
    error ZeroAddress();

    constructor(address owner_, address settlementSink_) {
        if (owner_ == address(0) || settlementSink_ == address(0)) revert ZeroAddress();
        owner = owner_;
        settlementSink = settlementSink_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice The deposit address for an invoice. Pure derivation - callable
    /// before anything is deployed, and identical on every EVM chain.
    function depositAddressFor(bytes32 invoiceId) public view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            invoiceId,
            SWEEPER_INIT_CODE_HASH
        )))));
    }

    /// @notice Record an invoice by its commitment hash. The invoice contents
    /// themselves never touch the chain - only keccak256 of the encrypted
    /// document, so holders of the document can verify it was not altered.
    function registerInvoice(bytes32 invoiceId, bytes32 commitment) external onlyOwner {
        if (commitmentOf[invoiceId] != bytes32(0)) revert InvoiceExists();
        commitmentOf[invoiceId] = commitment;
        emit InvoiceRegistered(invoiceId, commitment, depositAddressFor(invoiceId));
    }

    /// @notice Corrections are append-only in spirit: the old commitment stays
    /// in the event log, so an amended invoice keeps an auditable history.
    function amendCommitment(bytes32 invoiceId, bytes32 newCommitment) external onlyOwner {
        bytes32 old = commitmentOf[invoiceId];
        if (old == bytes32(0)) revert UnknownInvoice();
        commitmentOf[invoiceId] = newCommitment;
        emit CommitmentAmended(invoiceId, old, newCommitment);
    }

    function setSettlementSink(address sink) external onlyOwner {
        if (sink == address(0)) revert ZeroAddress();
        settlementSink = sink;
    }

    /// @notice Deploy the sweeper (if needed) and pull funds. Permissionless -
    /// a relayer, the merchant, or the buyer can all trigger settlement.
    function deployAndSweep(bytes32 invoiceId, address token) external returns (uint256) {
        if (commitmentOf[invoiceId] == bytes32(0)) revert UnknownInvoice();

        address predicted = depositAddressFor(invoiceId);
        if (predicted.code.length == 0) {
            Sweeper deployed = new Sweeper{salt: invoiceId}();
            require(address(deployed) == predicted, "address mismatch");
            invoiceOfSweeper[predicted] = invoiceId;
        }

        return Sweeper(payable(predicted)).sweep(token);
    }

    /// @notice Called back by a Sweeper after it moves funds.
    function onSweep(address token, uint256 amount) external {
        bytes32 invoiceId = invoiceOfSweeper[msg.sender];
        if (invoiceId == bytes32(0)) revert NotASweeper();
        emit PaymentSwept(invoiceId, token, amount, tx.origin);
    }
}
