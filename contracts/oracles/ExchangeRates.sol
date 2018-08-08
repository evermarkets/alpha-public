pragma solidity 0.4.18;

contract ExchangeRates {

  address public owner;
  mapping(bytes32 => uint) public rates;

  modifier isOwner () {
    require(msg.sender == owner);
    _;
  }

  function ExchangeRates(address _owner)
    public
  {
    owner = _owner;
  }

  function set_rate(bytes32 code, uint evr_wei_per_unit)
    public
    isOwner
  {
    rates[code] = evr_wei_per_unit;
  }
}
