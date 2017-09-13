pragma solidity ^0.4.15;

contract Owned {
    address public owner;
    bool public running;

    event LogChangeOwner(address oldOwner, address newOwner);
    event LogToggleRunning(address theOwner, bool isRunning);

    modifier onlyOwner() {
        require(msg.sender == owner);

        _;
    }

    function Owned() {
        owner = msg.sender;
    }

    function changeOwner(address newOwner)
        onlyOwner
        returns (bool success) {

        // make sure they remembered to pass in a value
        require(newOwner != 0);

        LogChangeOwner(owner, newOwner);

        owner = newOwner;

        return true;
    }

    function toggleRunning(bool _running)
        onlyOwner
        returns (bool success) {

        running = _running;

        LogToggleRunning(owner, running);

        return true;
    }
}
