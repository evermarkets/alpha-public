import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import RaisedButton from 'material-ui/RaisedButton';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';
import Divider from 'material-ui/Divider';
import NumberInput from 'material-ui-number-input';
import AddIcon from 'material-ui/svg-icons/content/add';
import RemoveIcon from 'material-ui/svg-icons/content/remove';

import moment from 'moment-timezone';

import app from '../feathers';
import chainMod from '../helpers/chain';
import formatters from '../../common/formatters';
import { getProductsForOrders } from '../selectors/products';
import { getSyndicatesActiveProducts } from '../selectors/syndicates';

class OrderEntry extends Component {
  static propTypes = {
    onProductChange: PropTypes.func.isRequired,
    selectedProductIndex: PropTypes.number.isRequired,
    selectedProductIdDefault: PropTypes.number,
    existingSyndicateKey: PropTypes.any, // eslint-disable-line react/forbid-prop-types
    existingSyndicateProduct: PropTypes.string,

    // from react-redux
    products: PropTypes.arrayOf(PropTypes.object).isRequired,
    syndicates: PropTypes.arrayOf(PropTypes.object).isRequired,
  };

  state = {
    selectedOrderType: 'LMT',
    selectedTimeInForce: 'NXT',
    selectedAccountIndex: 0,
    price: NaN,
    size: NaN,
  };

  componentDidMount() {
    this.refresh();
  }

  componentDidUpdate(prevProps) {
    // only call refresh upon receiving the second of products or syndicates
    const numSyndicates = Object.keys(this.props.syndicates).length;
    const numSyndicatesPrev = Object.keys(prevProps.syndicates).length;
    const numProducts = Object.keys(this.props.products).length;
    const numProductsPrev = Object.keys(prevProps.products).length;
    const receivedSyndicates = (numSyndicatesPrev === 0 && numSyndicates > 0);
    const receivedProducts = (numProductsPrev === 0 && numProducts > 0);
    if ((receivedProducts && numSyndicates) || (receivedSyndicates && numProducts)) {
      // received syndicates for the first time - refresh list
      this.refresh();
    }
  }

  async refresh() {
    if (this.props.syndicates.length === 0)
      return;

    let defaultProductIndex = 0;
    if (this.props.selectedProductIdDefault) {
      defaultProductIndex = this.props.products.findIndex(p => (
        p.id === this.props.selectedProductIdDefault));
    }

    this.handleProductChange(null, null, defaultProductIndex);
    this.handleOrderValueChange();
  }

  clearFields = () => {
    this.price.getInputNode().value = '';
    this.price.textField.setState({ hasValue: false });
    this.size.getInputNode().value = '';
    this.size.textField.setState({ hasValue: false });

    this.handleOrderValueChange();
  }

  validateOrder() {
    return (
      (this.state.selectedOrderType === 'MKT' || this.price.textField.getValue().length > 0) &&
      (this.size.textField.getValue().length > 0)
    );
  }

  submitBuyOrder = () => {
    this.submitOrder(1);
  }

  submitSellOrder = () => {
    this.submitOrder(-1);
  }

  submitOrder(sign) {
    if (!this.validateOrder())
      return;

    const { name, key } = this.getRelatedAccounts()[this.state.selectedAccountIndex];
    const userAddress = chainMod.getWeb3().eth.accounts[0];

    const Orders = app.service('orders');
    const Auctions = app.service('auctions');

    Auctions
      .find({ query: { productName: name, endedAt: null } })
      .then((auctions) => {
        Orders.create({
          productName: name,
          syndicateKey: key,
          price: this.state.selectedOrderType === 'MKT' ? null : Number(this.price.textField.getValue()),
          quantity: Number(this.size.textField.getValue()) * sign,
          quantityFilled: 0,
          traderAddress: userAddress,
          orderType: this.state.selectedOrderType,
          timeInForce: this.state.selectedTimeInForce,
          auctionId: auctions[0].id,
        }).then(() => {
          // clear form fields
          this.clearFields();
        });
      });

    // set the selected account to the chosen one
    this.handleAccountChange(null, null, 0);
  }

  handleProductChange = (event, index, value) => {
    this.handleAccountChange(null, null, 0);

    // let our parent know a new product was selected
    const product = this.props.products[value];
    this.props.onProductChange(product, value);

    this.clearFields();
  }

  handleAccountChange = (event, index, value) => {
    this.setState({
      selectedAccountIndex: value,
    });
  }

  handleOrderTypeChange = (event, index, value) => {
    if (value === 'MKT') {
      // clear price field
      this.price.getInputNode().value = '';
      this.price.textField.setState({ hasValue: false });
    }

    this.setState({ selectedOrderType: value });
  }

  handleTimeInForceChange = (event, index, value) => {
    this.setState({ selectedTimeInForce: value });
  }

  handleOrderValueChange = () => {
    const price = this.price.textField.getValue();
    const size = this.size.textField.getValue();
    this.setState({ price, size });
  }

  getRelatedAccounts() {
    if (!this.props.syndicates.length || !this.props.products.length)
      return [];

    const product = this.props.products[this.props.selectedProductIndex];

    if (this.props.existingSyndicateKey && this.props.existingSyndicateProduct === product.name) {
      const key = this.props.existingSyndicateKey;
      const syndicate = this.props.syndicates.find(s => s.key === key);
      return [{
        key: this.props.existingSyndicateKey,
        name: product.name,
        primaryText: syndicate.displayName,
      }];
    }

    const { price, size } = this.state;

    const accounts = [];
    for (const s of this.props.syndicates) {
      const selectedProduct = s.products.find(p => p.id === product.id);
      if (selectedProduct) {
        const { key, displayName } = s;
        const { name, initialMargin, totalFeePerContract } = selectedProduct;

        let secondaryText = '';
        if (price && size) {
          const depositRequiredString = OrderEntry.getDepositRequiredString(
            price, size, initialMargin, totalFeePerContract);
          secondaryText += depositRequiredString;
        }

        accounts.push({
          key,
          name,
          primaryText: displayName,
          secondaryText,
        });
      }
    }
    return accounts;
  }

  static getDepositString(price, size, syndicate, syndicateProduct) {
    const { availableDeposit } = syndicate;
    const { initialMargin, totalFeePerContract } = syndicateProduct;
    if (Number.isNaN(availableDeposit))
      return 'Deposit Available: ...';

    if (price && size) {
      const depositRequiredString = OrderEntry.getDepositRequiredString(
        price, size, initialMargin, totalFeePerContract);
      return `Deposit Required: ${depositRequiredString} (Available: $${formatters.formatDecimal(availableDeposit)})`;
    }

    return `Deposit Available: $${formatters.formatDecimal(availableDeposit)}`;
  }

  static getDepositRequiredString(price, size, initialMargin, feePerContract) {
    const depositRequired = (size * initialMargin);
    const fee = (feePerContract * size);
    return `$${formatters.formatDecimal(depositRequired)} + $${fee} fee`;
  }

  render() {
    const styles = {
      subheader: {
        lineHeight: '24px',
        backgroundColor: '#3a7dae',
        color: '#ffffff',
      },
      button: {
        margin: 12,
        width: 95,
      },
      buttonClear: {
        margin: 12,
      },
      selectProduct: {
        marginLeft: 20,
        width: 165,
      },
      selectAccount: {
        marginLeft: 20,
        width: 380,
      },
      selectHalf: {
        marginLeft: 20,
        width: 180,
      },
      textField: {
        marginLeft: 20,
      },
      productLongName: {
        display: 'inline-block',
        verticalAlign: 'top',
        color: '#999999',
        marginTop: 28,
        fontSize: 12,
        lineHeight: '16px',
      },
      deposit: {
        paddingLeft: 20,
        paddingTop: 5,
        paddingBottom: 5,
        fontSize: 12,
        color: '#bbbbbb',
      },
    };
    const relatedAccounts = this.getRelatedAccounts();

    let selectedSyndicate = {};
    let selectedSyndicateProduct = {};
    if (this.props.syndicates.length > 0 && this.props.products.length > 0) {
      const product = this.props.products[this.props.selectedProductIndex];
      const { key } = relatedAccounts[this.state.selectedAccountIndex];
      selectedSyndicate = this.props.syndicates
        .find(s => s.key === key);
      selectedSyndicateProduct = selectedSyndicate.products.find(p => p.id === product.id);
    }

    return (
      <div>
        <form>
          <SelectField
            floatingLabelText="Contract"
            value={this.props.selectedProductIndex}
            onChange={this.handleProductChange}
            underlineShow={false}
            style={styles.selectProduct}
          >
            {
              this.props.products.map((s, idx) => (
                <MenuItem key={s.name} value={idx} primaryText={s.name} />
              ))
            }
          </SelectField>
          <div style={styles.productLongName}>
            {selectedSyndicateProduct.longName}<br />
            {selectedSyndicateProduct.expiry ? `Exp: ${moment.utc(selectedSyndicateProduct.expiry).format('MM/DD/YYYY')}` : null}
          </div>
          <Divider />
          <NumberInput
            floatingLabelText="Price"
            type="number"
            ref={o => (this.price = o)} // eslint-disable-line no-return-assign
            style={styles.textField}
            disabled={this.state.selectedOrderType === 'MKT'}
            underlineShow={false}
            strategy="ignore"
            min={0}
            onChange={this.handleOrderValueChange}
          />
          <Divider />
          <NumberInput
            floatingLabelText="Size"
            type="number"
            ref={o => (this.size = o)} // eslint-disable-line no-return-assign
            style={styles.textField}
            underlineShow={false}
            strategy="ignore"
            min={0}
            onChange={this.handleOrderValueChange}
          />
          <Divider />
          <SelectField
            floatingLabelText="Order Type"
            value={this.state.selectedOrderType}
            onChange={this.handleOrderTypeChange}
            underlineShow={false}
            style={styles.selectHalf}
          >
            <MenuItem value="MKT" primaryText="Market" />
            <MenuItem value="LMT" primaryText="Limit" />
          </SelectField>
          <SelectField
            floatingLabelText="Time In Force"
            value={this.state.selectedTimeInForce}
            onChange={this.handleTimeInForceChange}
            underlineShow={false}
            style={styles.selectHalf}
          >
            <MenuItem value="NXT" primaryText="Next Auction" />
            <MenuItem value="GTC" primaryText="Good 'Til Canceled" />
          </SelectField>
          <Divider />
          <SelectField
            floatingLabelText="Margin Account"
            value={this.state.selectedAccountIndex}
            onChange={this.handleAccountChange}
            underlineShow={false}
            disabled={this.props.existingSyndicateKey !== null}
            style={styles.selectAccount}
          >
            {
              relatedAccounts.map((s, idx) => (
                <MenuItem
                  key={s.key}
                  value={idx}
                  primaryText={s.primaryText}
                  secondaryText={s.secondaryText}
                  style={s.style}
                />
              ))
            }
          </SelectField>
          <Divider />
          <div style={styles.deposit}>
            {OrderEntry.getDepositString(
              this.state.price,
              this.state.size,
              selectedSyndicate,
              selectedSyndicateProduct)}
          </div>
          <Divider />
          <RaisedButton
            label="Sell"
            style={styles.button}
            icon={<RemoveIcon />}
            backgroundColor="#3a7dae"
            labelColor="#ffffff"
            onClick={this.submitSellOrder}
          />
          <RaisedButton
            label="Buy"
            style={styles.button}
            icon={<AddIcon />}
            backgroundColor="#3a7dae"
            labelColor="#ffffff"
            onClick={this.submitBuyOrder}
          />
          <RaisedButton
            label="Clear Values"
            style={styles.buttonClear}
            backgroundColor="#eeeeee"
            onClick={this.clearFields}
          />
        </form>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  products: getProductsForOrders(state),
  syndicates: getSyndicatesActiveProducts(state),
});

export default connect(mapStateToProps)(OrderEntry);
