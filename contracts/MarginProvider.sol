pragma solidity ^0.4.18;

// WARNING: the int() casts below are not safe for very large uints
// TODO(rogs): does using uint128 solve the problem? Or should we use the SafeMath library?

import './MarginProviderInternals.sol';
import './BaseFuture.sol';
import './EVRToken.sol';
import './FL.sol';
import './Future.sol';
import './oracles/ExchangeRates.sol';

contract MarginProvider is ITokenRecipient {

  using BaseFuture for BaseFuture.Data;
  using MarginProviderInternals for MarginProviderInternals.Data;

  /*
   *  Storage
   */
  MarginProviderInternals.Data internals;

  // TODO(rogs): use isActive modifiers?
  /*
   *  Modifiers
   */
  modifier isLender () {
    require(msg.sender == internals.lender);
    _;
  }

  modifier isFuture () {
    require(internals.in_futures_list[msg.sender]);
    _;
  }

  modifier isLenderOrFuture () {
    require(msg.sender == internals.lender || internals.in_futures_list[msg.sender]);
    _;
  }

  /*
   *  Public functions
   */
  function() public {
    revert();  // don't allow ETH to be sent to this contract
  }

  function MarginProvider(EVRToken evr, address lender, ExchangeRates exchange_rates,
    bytes32 currency_code)
    public
  {
    internals.evr = evr;
    internals.lender = lender;
    internals.exchange_rates = exchange_rates;
    internals.currency_code = currency_code;
  }

  function add_future(Future future, uint initial_margin_usd_wei, uint maintenance_margin_usd_wei,
    uint fee_per_contract_usd_wei)
    public
    isLender
  {
    internals.add_future(future, initial_margin_usd_wei, maintenance_margin_usd_wei,
      fee_per_contract_usd_wei);
  }

  function deposit_for_lender(uint amount_evr_wei)
    public
  {
    // transfer EVR from sender to this contract (must be preapproved)
    require(internals.evr.transferFrom(msg.sender, this, amount_evr_wei));

    internals.lender_balance_evr_wei += int(amount_evr_wei);
    require(check_balances(internals.get_current_exchange_rate()));
  }

  function try_add_trades(Future future, uint evr_per_usd_wei, uint trade_price_usd_wei,
    address[] traders, int[] sizes_atto, bool pay_fees)
    public
    isFuture
    returns (bool, int, uint, int, bytes32)
  {
    return internals.try_add_trades(future, evr_per_usd_wei, trade_price_usd_wei, traders,
      sizes_atto, pay_fees);
  }

  function top_up_deposit_on_future(Future future)
    public
    isLender
  {
    internals.top_up_deposit_on_future(future);
    require(check_balances(internals.get_current_exchange_rate()));
  }

  function withdraw_excess_deposit_from_future(Future future)
    public
    isLenderOrFuture
  {
    uint evr_per_usd_wei = internals.get_current_exchange_rate();

    int available_funds_usd_wei = future.get_available_funds_usd_wei(this, evr_per_usd_wei,
      future.get_current_price_usd_wei());
    if (available_funds_usd_wei > 0) {
      int available_funds_evr_wei = Utils.to_evr_wei(evr_per_usd_wei, available_funds_usd_wei);
      future.withdraw(this, uint(available_funds_evr_wei));
    }
    require(check_balances(evr_per_usd_wei));
  }

  function pull_fees_from_future(Future future)
    public
    isFuture
  {
    uint fees_collected_evr_wei = internals.future_wrappers[future].state.fee_balance_evr_wei;
    internals.future_wrappers[future].state.fee_balance_evr_wei = 0;
    internals.fee_balance_evr_wei += fees_collected_evr_wei;
    require(check_balances(internals.get_current_exchange_rate()));
  }

  function try_settle(Future future, uint evr_per_usd_wei, uint settlement_price_usd_wei)
    public
    isFuture
    returns (bool, int, int, bytes32)
  {
    return internals.try_settle(future, evr_per_usd_wei, settlement_price_usd_wei);
  }

  function withdraw(address trader, uint amount_evr_wei)
    public
  {
    require(msg.sender == trader);

    uint evr_per_usd_wei = internals.get_current_exchange_rate();

    // Can't withdraw more than is available.
    int amount_available_evr_wei =
      Utils.to_evr_wei(evr_per_usd_wei, get_available_funds_usd_wei(trader, evr_per_usd_wei));
    require(int(amount_evr_wei) <= amount_available_evr_wei);

    // Debit the trader's balance, and then do the withdrawal.
    internals.trader_balances_evr_wei[trader] -= int(amount_evr_wei);
    require(internals.evr.transfer(trader, amount_evr_wei));
    require(check_balances(evr_per_usd_wei));
  }

  function withdraw_for_lender(uint amount_evr_wei)
    public
    isLender
  {
    require(internals.lender_balance_evr_wei >= int(amount_evr_wei));

    uint evr_per_usd_wei = internals.get_current_exchange_rate();

    // Can't withdraw more than is available.
    int amount_available_evr_wei =
      Utils.to_evr_wei(evr_per_usd_wei, get_available_lender_funds_usd_wei(evr_per_usd_wei));
    require(int(amount_evr_wei) <= amount_available_evr_wei);

    // Debit the lender's balance, and then do the withdrawal.
    internals.lender_balance_evr_wei -= int(amount_evr_wei);
    require(internals.evr.transfer(internals.lender, amount_evr_wei));
    require(check_balances(evr_per_usd_wei));
  }

  function withdraw_fees()
    public
    isLender
  {
    // TODO(AustinC): code duplciated in BaseFuture
    uint amount_requested_evr_wei = internals.fee_balance_evr_wei;
    internals.fee_balance_evr_wei = 0;
    require(internals.evr.transfer(msg.sender, amount_requested_evr_wei));
    require(check_balances(internals.get_current_exchange_rate()));
  }

  function receiveApproval(address sender, uint256 amount_evr_wei, address _evr,
    bytes trader_address_bytes)
    public
  {
    require(msg.sender == _evr && _evr == address(internals.evr));
    deposit_internal(sender, Utils.bytes_to_address(trader_address_bytes), amount_evr_wei);
  }

  function deposit(address trader, uint amount_evr_wei)
    public
  {
    deposit_internal(msg.sender, trader, amount_evr_wei);
  }

  function mark_position(Future future, uint marking_price_usd_wei,
    address trader)
    public
    // TODO(rogs): restrict who can call this function. (use isFuture?)
    returns (bool can_mark, bytes32 error_message)
  {
    uint evr_per_usd_wei = internals.get_current_exchange_rate();
    error_message = internals.mark_position(future, evr_per_usd_wei, marking_price_usd_wei, trader);
    can_mark = (error_message == "");
  }

  function set_margin(Future future, uint initial_margin_usd_wei, uint maintenance_margin_usd_wei)
    public
    isLender
  {
    require(initial_margin_usd_wei >= maintenance_margin_usd_wei);
    internals.set_margin(future, initial_margin_usd_wei, maintenance_margin_usd_wei);
  }

  /*
   *  Public read-only functions
   */
  function get_lender() public view returns (address) {
    return internals.lender;
  }

  function get_lender_balance_evr_wei() public view returns (int) {
    return internals.lender_balance_evr_wei;
  }

  function get_lender_fee_balance_evr_wei() public view returns (uint) {
    return internals.fee_balance_evr_wei;
  }

  function get_trader_balance_evr_wei(address trader) public view returns (int) {
    return internals.trader_balances_evr_wei[trader];
  }

  function get_available_lender_funds_usd_wei(uint evr_per_usd_wei) public view returns (int) {
    return internals.get_available_lender_funds_usd_wei(evr_per_usd_wei);
  }

  function get_net_liquidation_value_usd_wei(address trader, uint evr_per_usd_wei) public view returns (int) {
    return internals.get_net_liquidation_value_usd_wei(trader, evr_per_usd_wei);
  }

  function get_total_fee_per_contract_usd_wei(Future future) public view returns (uint) {
    return internals.get_total_fee_per_contract_usd_wei(future);
  }

  function get_available_funds_usd_wei(address trader, uint evr_per_usd_wei)
    public
    view
    returns (int)
  {
    int available_funds_usd_wei = Utils.to_usd_wei(evr_per_usd_wei,
      internals.trader_balances_evr_wei[trader]);

    for (uint i = 0; i < internals.futures.length; ++i) {
      available_funds_usd_wei +=
        internals.future_wrappers[internals.futures[i]].get_available_funds_usd_wei(trader,
          evr_per_usd_wei, internals.futures[i].get_current_price_usd_wei());
    }
    return available_funds_usd_wei;
  }

  function get_excess_liquidity_usd_wei(address trader, uint evr_per_usd_wei)
    public
    view
    returns (int)
  {
    int excess_liquidity_usd_wei = Utils.to_usd_wei(evr_per_usd_wei,
      internals.trader_balances_evr_wei[trader]);

    for (uint i = 0; i < internals.futures.length; ++i) {
      excess_liquidity_usd_wei +=
        internals.future_wrappers[internals.futures[i]].get_excess_liquidity_usd_wei(trader,
          evr_per_usd_wei, internals.futures[i].get_current_price_usd_wei());
    }
    return excess_liquidity_usd_wei;
  }

  function get_total_balance_evr_wei(uint evr_per_usd_wei)
    public
    view
    returns (int)
  {
    return internals.lender_balance_evr_wei + int(internals.fee_balance_evr_wei) +
      get_total_trader_balances_evr_wei() + get_total_future_balances_evr_wei(evr_per_usd_wei);
  }

  function check_balances(uint evr_per_usd_wei)
    public
    view
    returns (bool)
  {
    int total_nlv_on_futures_evr_wei =
      Utils.to_evr_wei(evr_per_usd_wei, get_total_nlv_on_futures_usd_wei(evr_per_usd_wei));
    int evr_balance = int(internals.evr.balanceOf(this)) + total_nlv_on_futures_evr_wei;
    return evr_balance >= get_total_balance_evr_wei(evr_per_usd_wei);
  }

  function check_balances_strict(uint evr_per_usd_wei)
    public
    view
    returns (bool)
  {
    int total_nlv_on_futures_evr_wei =
      Utils.to_evr_wei(evr_per_usd_wei, get_total_nlv_on_futures_usd_wei(evr_per_usd_wei));
    int evr_balance = int(internals.evr.balanceOf(this)) + total_nlv_on_futures_evr_wei;
    return evr_balance == get_total_balance_evr_wei(evr_per_usd_wei);
  }

  /*
   * Functions delegated to future wrappers
   */
  function get_initial_margin_usd_wei(Future future) public view returns (uint) {
    return internals.future_wrappers[future].get_initial_margin_usd_wei();
  }

  function get_maintenance_margin_usd_wei(Future future) public view returns (uint) {
    return internals.future_wrappers[future].get_maintenance_margin_usd_wei();
  }

  function get_fee_balance_evr_wei(Future future) public view returns (uint) {
    return internals.future_wrappers[future].get_fee_balance_evr_wei();
  }

  function get_traders(Future future) public view returns (address[]) {
    return internals.future_wrappers[future].state.traders;
  }

  function get_contract_balance_atto(Future future, address trader) public view returns (int) {
    return internals.future_wrappers[future].get_contract_balance_atto(trader);
  }

  function get_cost_balance_usd_wei(Future future, address trader) public view returns (int) {
    return internals.future_wrappers[future].get_cost_balance_usd_wei(trader);
  }

  function get_deposit_balance_evr_wei(Future future, address trader) public view returns (int) {
    return internals.future_wrappers[future].get_deposit_balance_evr_wei(trader);
  }

  function get_average_entry_price_usd_wei(Future future, address trader) public view returns (uint) {
    return internals.future_wrappers[future].get_average_entry_price_usd_wei(trader);
  }

  /*
   *  Internal functions
   */
  function deposit_internal(address sender, address trader, uint amount_evr_wei)
    internal
  {
    // transfer EVR from sender to this contract (must be preapproved)
    require(internals.evr.transferFrom(sender, this, amount_evr_wei));
    internals.trader_balances_evr_wei[trader] += int(amount_evr_wei);
    internals.add_trader(trader);
    require(check_balances(internals.get_current_exchange_rate()));
  }

  /*
   *  Internal read-only functions
   */
  function get_total_nlv_on_futures_usd_wei(uint evr_per_usd_wei)
    internal
    view
    returns (int s)
  {
    for (uint i = 0; i < internals.futures.length; ++i) {
      uint price_usd_wei = internals.futures[i].get_current_price_usd_wei();
      s += internals.futures[i].get_net_liquidation_value_usd_wei(this, evr_per_usd_wei,
        price_usd_wei);
    }
  }

  function get_total_future_balances_evr_wei(uint evr_per_usd_wei)
    internal
    view
    returns (int s)
  {
    for (uint i = 0; i < internals.futures.length; ++i) {
      uint price_usd_wei = internals.futures[i].get_current_price_usd_wei();
      s += internals.future_wrappers[internals.futures[i]].get_total_balance_evr_wei(
        evr_per_usd_wei, price_usd_wei);
    }
  }

  function get_total_trader_balances_evr_wei()
    internal
    view
    returns (int s)
  {
    for (uint i = 0; i < internals.traders.length; ++i)
      s += internals.trader_balances_evr_wei[internals.traders[i]];
  }
}
