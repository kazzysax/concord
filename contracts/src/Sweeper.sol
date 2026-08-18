// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

interface ISweepSink {
    function onSweep(address token, uint256 amount) external;
    function settlementSink() external view returns (address);
}

/// @notice One Sweeper per invoice, at an address derived from the invoice id.
/// Never deployed at invoice creation - the address is computed
/// counterfactually and given to the buyer. Deployment happens on first sweep.
///
/// The constructor takes no arguments and reads no chain-specific state, so the
/// creation code is byte-identical everywhere. That is what makes the same
/// invoice resolve to the same address on every EVM chain.
contract Sweeper {
    address public immutable factory;
    uint256 private locked;

    error Reentered();

    constructor() {
        factory = msg.sender;
    }

    receive() external payable {}

    modifier nonReentrant() {
        if (locked == 1) revert Reentered();
        locked = 1;
        _;
        locked = 0;
    }

    /// @notice Move a balance out to the settlement sink. Permissionless on
    /// purpose: anyone can pay the gas to settle a payment, including a relayer.
    /// token == address(0) means native ETH.
    function sweep(address token) external nonReentrant returns (uint256 amount) {
        address sink = ISweepSink(factory).settlementSink();
        require(sink != address(0), "sink unset");

        if (token == address(0)) {
            amount = address(this).balance;
            require(amount > 0, "nothing to sweep");
            (bool ok, ) = sink.call{value: amount}("");
            require(ok, "eth transfer failed");
        } else {
            amount = IERC20(token).balanceOf(address(this));
            require(amount > 0, "nothing to sweep");
            (bool ok, bytes memory data) = token.call(
                abi.encodeWithSelector(IERC20.transfer.selector, sink, amount)
            );
            require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
        }

        ISweepSink(factory).onSweep(token, amount);
    }
}
