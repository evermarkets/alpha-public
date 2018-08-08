// Copied from: https://github.com/gnosis/gnosis-contracts/blob/master/contracts/Oracles/Oracle.sol

pragma solidity 0.4.18;


/// @title Abstract oracle contract - Functions to be implemented by oracles
contract Oracle {

    function isOutcomeSet() public constant returns (bool);
    function getOutcome() public constant returns (int);
}
