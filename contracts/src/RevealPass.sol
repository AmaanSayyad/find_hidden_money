// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RevealPass
/// @notice Find Hidden Money unlock on Monad Mainnet. Pay 1 native MON once;
///         the contract records the reveal and keeps the tip here.
contract RevealPass {
    address public immutable treasury;
    uint256 public immutable tipAmount;

    mapping(address => bool) public revealed;
    mapping(address => uint256) public revealedAt;

    event Revealed(address indexed payer, uint256 amount, uint256 timestamp);

    error WrongTip(uint256 sent, uint256 required);
    error ZeroTreasury();

    constructor(uint256 tipAmount_) {
        if (tipAmount_ == 0) revert WrongTip(0, 1);
        treasury = address(this);
        tipAmount = tipAmount_;
    }

    function reveal() external payable {
        if (msg.value < tipAmount) revert WrongTip(msg.value, tipAmount);
        if (!revealed[msg.sender]) {
            revealed[msg.sender] = true;
            revealedAt[msg.sender] = block.timestamp;
        }
        emit Revealed(msg.sender, msg.value, block.timestamp);
    }

    function isRevealed(address account) external view returns (bool) {
        return revealed[account];
    }

    receive() external payable {
        revert WrongTip(msg.value, tipAmount);
    }
}
