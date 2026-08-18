// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {InvoiceFactory} from "../src/InvoiceFactory.sol";
import {Sweeper} from "../src/Sweeper.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }
    function transfer(address to, uint256 amt) external returns (bool) {
        require(balanceOf[msg.sender] >= amt, "insufficient");
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }
}

contract InvoiceFactoryTest is Test {
    InvoiceFactory factory;
    MockUSDC usdc;

    address merchant = address(0xBEEF);
    address sink = address(0xCAFE);
    bytes32 constant INVOICE = keccak256("INV-2026-1041");
    bytes32 constant COMMITMENT = keccak256("encrypted invoice blob");

    function setUp() public {
        factory = new InvoiceFactory(merchant, sink);
        usdc = new MockUSDC();
    }

    /// The whole design rests on this: same invoice id, same factory address,
    /// same address on every chain. Simulated here by deploying two factories
    /// at the same address on two forks of differing chain ids.
    function test_addressIsIdenticalAcrossChains() public {
        vm.chainId(8453);
        address onBase = factory.depositAddressFor(INVOICE);

        vm.chainId(42161);
        address onArbitrum = factory.depositAddressFor(INVOICE);

        assertEq(onBase, onArbitrum, "deposit address diverged across chains");
    }

    function test_addressIsStableBeforeDeployment() public {
        address predicted = factory.depositAddressFor(INVOICE);
        assertEq(predicted.code.length, 0, "should not be deployed yet");

        vm.prank(merchant);
        factory.registerInvoice(INVOICE, COMMITMENT);

        usdc.mint(predicted, 4_631_750_000);
        factory.deployAndSweep(INVOICE, address(usdc));

        assertGt(predicted.code.length, 0, "should be deployed now");
    }

    function test_paymentReachesSink() public {
        vm.prank(merchant);
        factory.registerInvoice(INVOICE, COMMITMENT);

        address deposit = factory.depositAddressFor(INVOICE);
        usdc.mint(deposit, 4_631_750_000);

        factory.deployAndSweep(INVOICE, address(usdc));

        assertEq(usdc.balanceOf(sink), 4_631_750_000);
        assertEq(usdc.balanceOf(deposit), 0);
    }

    function test_nativeEthSweeps() public {
        vm.prank(merchant);
        factory.registerInvoice(INVOICE, COMMITMENT);

        address deposit = factory.depositAddressFor(INVOICE);
        vm.deal(deposit, 1 ether);

        factory.deployAndSweep(INVOICE, address(0));
        assertEq(sink.balance, 1 ether);
    }

    /// Buyer pays in two instalments. Second sweep must still work against an
    /// already-deployed sweeper.
    function test_partialPaymentsSweepTwice() public {
        vm.prank(merchant);
        factory.registerInvoice(INVOICE, COMMITMENT);

        address deposit = factory.depositAddressFor(INVOICE);

        usdc.mint(deposit, 2_000_000_000);
        factory.deployAndSweep(INVOICE, address(usdc));

        usdc.mint(deposit, 2_631_750_000);
        factory.deployAndSweep(INVOICE, address(usdc));

        assertEq(usdc.balanceOf(sink), 4_631_750_000);
    }

    function test_cannotSweepUnregisteredInvoice() public {
        vm.expectRevert(InvoiceFactory.UnknownInvoice.selector);
        factory.deployAndSweep(keccak256("never issued"), address(usdc));
    }

    function test_onlyOwnerRegisters() public {
        vm.expectRevert(InvoiceFactory.NotOwner.selector);
        factory.registerInvoice(INVOICE, COMMITMENT);
    }

    function test_constructorRejectsZeroOwner() public {
        vm.expectRevert(InvoiceFactory.ZeroAddress.selector);
        new InvoiceFactory(address(0), sink);
    }

    function test_constructorRejectsZeroSink() public {
        vm.expectRevert(InvoiceFactory.ZeroAddress.selector);
        new InvoiceFactory(merchant, address(0));
    }

    function test_commitmentVerifiesDocument() public {
        bytes memory doc = "encrypted invoice blob";
        vm.prank(merchant);
        factory.registerInvoice(INVOICE, keccak256(doc));

        assertEq(factory.commitmentOf(INVOICE), keccak256(doc));
        assertTrue(factory.commitmentOf(INVOICE) != keccak256("tampered blob"));
    }
}
