pragma solidity ^0.4.18;

// WARNING: the int() casts below are not safe for very large uints
// TODO(rogs): does using uint128 solve the problem? Or should we use the SafeMath library?

import './FutureInternals.sol';
import './EVRToken.sol';
import './FL.sol';
import './MarginProvider.sol';
import './oracles/ExchangeRates.sol';
import './oracles/Oracle.sol';
import './Utils.sol';

contract Future {

  using BaseFuture for BaseFuture.Data;
  using FutureInternals for FutureInternals.Data;

  // TODO(rogs): real events (e.g. withdraw, add_trades, etc.)
  /*
   *  Events
   */
  event PrintString(string s);
  event PrintAddress(string label, address value);
  event PrintInt(string label, int value);
  event PrintUInt(string label, uint value);

  /*
   *  Storage
   */
  FutureInternals.Data internals;
  string public product_name;
  uint public expiration_timestamp;

  /*
   *  Modifiers
   */
  modifier isCustodian () {
    // Only custodian is allowed to proceed
    require(msg.sender == internals.custodian);
    _;
  }

  // TODO(rogs): move modifiers to AbstractFuture?
  modifier isActive () {
    require(!internals.expired);
    _;
  }

  modifier isSettled () {
    require(internals.settled);
    _;
  }

  /*
   *  Public functions
   */
  function() public {
    revert();  // don't allow ETH to be sent to this contract
  }

  function Future(EVRToken evr, string _product_name, uint _expiration_timestamp,
    uint initial_margin_usd_wei, uint maintenance_margin_usd_wei, uint fee_per_contract_usd_wei,
    uint _backstop_deposit_ratio_bp, Oracle oracle, address custodian,
    ExchangeRates exchange_rates, bytes32 currency_code, uint multiplier_bp)
    public
  {
    internals.future = this;
    internals.base.evr = evr;
    internals.base.params = BaseFuture.Parameters(
      initial_margin_usd_wei,
      maintenance_margin_usd_wei,
      fee_per_contract_usd_wei
    );
    internals.custodian = custodian;

    product_name = _product_name;
    expiration_timestamp = _expiration_timestamp;
    internals.backstop_deposit_ratio_bp = _backstop_deposit_ratio_bp;
    internals.oracle = oracle;
    internals.exchange_rates = exchange_rates;
    internals.currency_code = currency_code;
    internals.multiplier_bp = multiplier_bp;
  }

  function add_trades_with_margin_providers(uint evr_per_usd_wei, uint trade_price_usd_wei,
    address[] margin_providers, uint[] mp_trader_pair_counts, address[] traders, int[] sizes_atto)
    public
    isCustodian
    isActive
  {
    bool can_add_trades;
    bytes32 _;
    (can_add_trades, _) = internals.try_add_trades_with_margin_providers(evr_per_usd_wei,
      trade_price_usd_wei, margin_providers, mp_trader_pair_counts, traders, sizes_atto);
    require(can_add_trades);
  }

  function try_add_trades_with_margin_providers(uint evr_per_usd_wei, uint trade_price_usd_wei,
    address[] margin_providers, uint[] mp_trader_pair_counts, address[] traders, int[] sizes_atto)
    public
    // TODO(rogs): isCustodian isActive
    returns (bool, bytes32)
  {
    return internals.try_add_trades_with_margin_providers(evr_per_usd_wei, trade_price_usd_wei,
      margin_providers, mp_trader_pair_counts, traders, sizes_atto);
  }

  function deposit_for_backstop(uint amount_evr_wei)
    public
    isActive
  {
    // transfer EVR from sender to this contract (must be preapproved)
    require(internals.base.evr.transferFrom(msg.sender, this, amount_evr_wei));
    internals.backstop_deposit_balance_evr_wei += amount_evr_wei;
    require(check_balances(internals.get_current_exchange_rate(), get_current_price_usd_wei()));
  }

  function withdraw_for_backstop(uint amount_requested_evr_wei)
    public
    isCustodian
  {
    uint evr_per_usd_wei = internals.get_current_exchange_rate();
    uint backstop_deposit_required_usd_wei =
      get_backstop_deposit_required_usd_wei(internals.open_interest_atto);
    uint backstop_deposit_excess_evr_wei = internals.backstop_deposit_balance_evr_wei -
      uint(Utils.to_evr_wei(evr_per_usd_wei, int(backstop_deposit_required_usd_wei)));
    require(backstop_deposit_excess_evr_wei >= amount_requested_evr_wei);

    internals.backstop_deposit_balance_evr_wei -= amount_requested_evr_wei;
    require(internals.base.evr.transfer(msg.sender, amount_requested_evr_wei));
    require(check_balances(evr_per_usd_wei, get_current_price_usd_wei()));
  }

  // TODO(rogs): For now, we're allowing trading even after the expiration_timestamp has passed, in
  // order to make testing easier, so that we don't have to get the timing exactly right or mock out
  // the dates.
  // In the future we should consider the future expired as soon as the expiration_timestamp has
  // been passed, and not require a separate call to expire().
  function expire() public isActive {
    require(now >= expiration_timestamp);
    internals.expired = true;
  }

  function settle()
    public
  {
    uint evr_per_usd_wei = internals.get_current_exchange_rate();
    internals.settle(evr_per_usd_wei);
    require(check_balances(evr_per_usd_wei, get_current_price_usd_wei()));
  }

  function deposit(address trader, uint amount_evr_wei)
    public
  {
    internals.base.deposit(trader, amount_evr_wei);
  }

  function withdraw(address trader, uint amount_evr_wei)
    public
  {
    uint evr_per_usd_wei = internals.get_current_exchange_rate();
    uint price_usd_wei = get_current_price_usd_wei();
    internals.base.withdraw(evr_per_usd_wei, price_usd_wei, trader, amount_evr_wei);
    require(check_balances(evr_per_usd_wei, price_usd_wei));
  }

  function withdraw_fees()
    public
    isSettled
    isCustodian
  {
    internals.base.withdraw_fees();
    require(check_balances(internals.get_current_exchange_rate(), get_current_price_usd_wei()));
  }

  // TODO(rogs): require isCustodian?
  function mark_position(uint marking_price_usd_wei, address trader)
    public
    returns
    (bool can_mark, bytes32 error_message)
  {
    return internals.mark_position(internals.get_current_exchange_rate(), marking_price_usd_wei,
      trader);
  }

  function set_margin(uint initial_margin_usd_wei, uint maintenance_margin_usd_wei)
    public
    isCustodian
  {
    require(initial_margin_usd_wei >= maintenance_margin_usd_wei);
    internals.set_margin(initial_margin_usd_wei, maintenance_margin_usd_wei);
  }

  /*
   *  Public read-only functions
   */
  function get_backstop_deposit_balance_evr_wei()
    public
    view
    returns (uint)
  {
    return internals.backstop_deposit_balance_evr_wei;
  }

  function get_backstop_deposit_required_usd_wei(uint open_interest_atto)
    public
    view
    returns (uint)
  {
    return internals.get_backstop_deposit_required_usd_wei(open_interest_atto);
  }

  function get_current_price_usd_wei()
    public
    view
    returns (uint current_price_usd_wei)
  {
    // TODO(rogs): use mutexes or something to make sure that we're never using this value while
    // in the process of doing an add_trades (or anything else that would update it)
    current_price_usd_wei = internals.settled ? internals.settlement_price_usd_wei :
      internals.last_trade_price_usd_wei;
  }

  function get_open_interest_atto()
    public
    view
    returns (uint)
  {
    return internals.open_interest_atto;
  }

  function get_oracle()
    public
    view
    returns (Oracle)
  {
    return internals.oracle;
  }

  function is_settled()
    public
    view
    returns (bool)
  {
    return internals.settled;
  }

  function get_total_balance_evr_wei(uint evr_per_usd_wei, uint trade_price_usd_wei)
    internal
    view
    returns (int)
  {
    return internals.get_total_balance_evr_wei(evr_per_usd_wei, trade_price_usd_wei);
  }

  function check_balances(uint evr_per_usd_wei, uint trade_price_usd_wei)
    public
    view
    returns (bool)
  {
    return internals.check_balances(evr_per_usd_wei, trade_price_usd_wei);
  }

  function get_multiplier_bp() public view returns (uint) {
    return internals.get_multiplier_bp();
  }

  function get_custodian() public view returns (address) {
    return internals.custodian;
  }

  /*
   * Functions delegated to base
   */
  function get_initial_margin_usd_wei() public view returns (uint) {
    return internals.base.get_initial_margin_usd_wei();
  }

  function get_maintenance_margin_usd_wei() public view returns (uint) {
    return internals.base.get_maintenance_margin_usd_wei();
  }

  function get_fee_per_contract_usd_wei() public view returns (uint) {
    return internals.base.get_fee_per_contract_usd_wei();
  }

  function get_fee_balance_evr_wei() public view returns (uint) {
    return internals.base.get_fee_balance_evr_wei();
  }

  function get_contract_balance_atto(address trader) public view returns (int) {
    return internals.base.get_contract_balance_atto(trader);
  }

  function get_cost_balance_usd_wei(address trader) public view returns (int) {
    return internals.base.get_cost_balance_usd_wei(trader);
  }

  function get_deposit_balance_evr_wei(address trader) public view returns (int) {
    return internals.base.get_deposit_balance_evr_wei(trader);
  }

  function get_average_entry_price_usd_wei(address trader) public view returns (uint) {
    return internals.base.get_average_entry_price_usd_wei(trader);
  }

  function get_net_liquidation_value_usd_wei(address trader, uint evr_per_usd_wei, uint trade_price_usd_wei) public view returns (int) {
    return internals.base.get_net_liquidation_value_usd_wei(trader, evr_per_usd_wei, trade_price_usd_wei);
  }

  function get_available_funds_usd_wei(address trader, uint evr_per_usd_wei, uint trade_price_usd_wei) public view returns (int) {
    return internals.base.get_available_funds_usd_wei(trader, evr_per_usd_wei, trade_price_usd_wei);
  }

  function get_excess_liquidity_usd_wei(address trader, uint evr_per_usd_wei, uint trade_price_usd_wei) public view returns (int) {
    return internals.base.get_excess_liquidity_usd_wei(trader, evr_per_usd_wei, trade_price_usd_wei);
  }

  function get_traders() public view returns (address[]) {
    return internals.base.state.traders;
  }
}
