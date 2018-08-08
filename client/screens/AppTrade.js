import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import Dialog from 'material-ui/Dialog';
import FlatButton from 'material-ui/FlatButton';
import Toggle from 'material-ui/Toggle';

import moment from 'moment-timezone';

import NavBar from '../components/NavBar';
import ComponentHeader from '../components/ComponentHeader';
import DrawerSidebar from '../components/DrawerSidebar';
import OrderBook from '../components/OrderBook';
import OrderEntry from '../components/OrderEntry';
import TableList from '../components/TableList';

import app from '../feathers';
import chainMod from '../helpers/chain';
import auction from '../../common/auction';
import formatters from '../../common/formatters';
import orders from '../../common/orders';
import fakeOrderUtil from '../utils/fakeOrders';
import { fetchSyndicatesIfNeeded } from '../actions/syndicates';
import { registerTransaction } from '../actions/transactions';
import { getDepositedSyndicates } from '../selectors/syndicates';

class AppTrade extends Component {
  static propTypes = {
    location: PropTypes.shape({
      state: PropTypes.object,
    }),

    // from react-redux
    syndicates: PropTypes.arrayOf(PropTypes.object).isRequired,
    refreshSyndicates: PropTypes.func.isRequired,
    registerTransaction: PropTypes.func.isRequired,
  }

  state = {
    // order entry state
    selectedProductIndex: 0,
    selectedProductName: '',
    selectedProductExistingSyndicateKey: null,

    // order book state
    ordersOpen: [],
    ordersBids: [],
    ordersAsks: [],

    // demo order book state
    realOrders: [],
    fakeOrders: [],
    auctionData: null,
    demoOrdersEnabled: false,

    // auction panel state
    nextAuction: [],

    // error dialog state
    errorDialogOpen: false,
    errorDialogMessage: '',

    // allows overriding the default syndicate selection (for "Trade" buttons)
    ...this.props.location.state,
  };

  constructor(props) {
    super(props);

    // refresh orders whenever they're updated
    app.service('orders').on('created', this.retrieveOrders);
    app.service('orders').on('patched', this.retrieveOrders);

    // update fake orders periodically to simulate market activity
    const UPDATE_INTERVAL = 500;
    this.refreshInterval = setInterval(
      this.refreshFakeOrders.bind(this),
      UPDATE_INTERVAL,
    );
  }

  componentDidMount() {
    this.mounted = true;
    this.retrieveOrders();
  }

  componentWillUnmount() {
    this.mounted = false;
    app.service('orders').removeListener('created', this.refresh);
    app.service('orders').removeListener('patched', this.refresh);

    clearInterval(this.refreshInterval);
  }

  showErrorDialog(message) {
    this.setState({
      errorDialogOpen: true,
      errorDialogMessage: message,
    });
  }

  onCallClick = async () => {
    const query = {
      query: {
        productName: this.state.selectedProductName,
      },
    };

    // verify that we can call add_trades()
    const verifyService = app.service('exec/verifyCall/:productName');
    const { success, message } = await verifyService.find(query);

    if (!success) {
      this.showErrorDialog((
        <div>Unable to submit trades.<br /><br />{`Error: ${message}`}</div>
      ));
      return;
    }

    // call add_trades()  (through the /exec service)
    const callService = app.service('exec/call/:productName');
    const tx = await callService.find(query);

    if (!tx)
      return;

    this.props.registerTransaction(tx, this.onTxComplete);
  }

  static onCancelClick(id) {
    app.service('orders')
      .patch(id, { canceledAt: new Date() });
  }

  onTxComplete = () => {
    // refresh with the results of the auction
    this.retrieveOrders();
    this.props.refreshSyndicates();
  }

  handleProductChange = async (product, index) => {
    this.setState({
      selectedProductIndex: index,
      selectedProductName: product.name,
    });

    this.retrieveOrders();
  }

  handleDemoOrdersToggle = () => {
    this.state.demoOrdersEnabled = !this.state.demoOrdersEnabled;

    if (!this.state.demoOrdersEnabled) {
      // clear fake orders
      this.refreshWithOrders(this.state.realOrders, [], this.state.auctionData);
    }
  }

  handleErrorDialogClose = () => {
    this.setState({
      errorDialogOpen: false,
    });
  }

  retrieveOrders = async () => {
    const os = await orders.openOrders(app, null, null);
    const a = await auction.getCurrentAuction(
      app, this.state.selectedProductName);

    // determine if trader already has order or position for this product
    const productName = this.state.selectedProductName;
    const userAddress = chainMod.getWeb3().eth.accounts[0];
    const myOrders = os.filter(o =>
      (o.traderAddress === userAddress) &&
      (o.productName === productName));
    let syndicateInUse = (myOrders.length > 0 ? myOrders[0].syndicateKey : null);
    if (!syndicateInUse) {
      // look for an existing position
      const syndicates = this.props.syndicates
        .map(s => s.products.filter(p => (p.name === productName) && (p.qty !== 0)))
        .filter(products => products.length > 0);
      syndicateInUse = syndicates.length > 0 ? syndicates[0][0].key : null;
    }
    if (this.mounted) {
      this.setState({
        selectedProductExistingSyndicateProduct: productName,
        selectedProductExistingSyndicateKey: syndicateInUse,
      });
    }

    this.refreshWithOrders(os, this.state.fakeOrders, a);
  }

  refreshFakeOrders() {
    const productName = this.state.selectedProductName;
    if (this.state.nextAuction.length > 0) {
      this.setState({
        nextAuction: [{
          ...this.state.nextAuction[0],
          time: this.nextAuctionTime(),
        }],
      });
    }

    if (!this.state.auctionData || !this.state.demoOrdersEnabled)
      return;

    let avgPrice = null;
    const realOrders = this.state.realOrders
      .filter(o => (o.productName === productName));
    if (realOrders.length > 0)
      avgPrice = realOrders.reduce((a, b) => a + b.price, 0) / realOrders.length;

    const fakeOrders = fakeOrderUtil.updateFakeOrders(
      productName,
      this.state.auctionData.id,
      this.state.auctionData.price || avgPrice,
      this.state.fakeOrders,
    );

    this.refreshWithOrders(this.state.realOrders, fakeOrders, this.state.auctionData);
  }

  nextAuctionTime() {
    const productName = this.state.selectedProductName;

    // DEMO
    if (productName.startsWith('ES2')) {
      const seconds = (59 - moment().second());
      const countdown = (seconds < 10) ? `00:0${seconds}` : `00:${seconds}`;
      return `Calling in ${countdown}`;
    }

    return 'On-Demand';
  }

  async refreshWithOrders(realOrders, fakeOrders, auctionData) {
    const productName = this.state.selectedProductName;
    const userAddress = chainMod.getWeb3().eth.accounts[0];

    // combine real and fake orders
    const os = [...realOrders, ...fakeOrders];

    let open = os.filter(o => (o.traderAddress === userAddress));
    let bids = os.filter(o => (o.productName === productName) && (o.quantity > 0));
    let asks = os.filter(o => (o.productName === productName) && (o.quantity < 0));

    const getOrderSizesByPrice = (_os) => {
      const orderSizes = {};
      _os.forEach((o) => {
        const priceOrMKT = o.orderType === 'MKT' ? 'MKT' : o.price;
        let size = (o.quantity < 0 ? -1 : 1) * (o.quantity - o.quantityFilled);
        if (orderSizes[priceOrMKT] != null)
          size += orderSizes[priceOrMKT];
        orderSizes[priceOrMKT] = size;
      });
      return orderSizes;
    };

    const mktFirstDescending = (a, b) => {
      if (a === 'MKT')
        return -1;
      if (b === 'MKT')
        return 1;
      return (b - a);
    };
    const mktFirstAscending = (a, b) => {
      if (a === 'MKT')
        return -1;
      if (b === 'MKT')
        return 1;
      return (a - b);
    };

    // sort bids descending
    const bidSizes = getOrderSizesByPrice(bids);
    bids = Object.keys(bidSizes).sort(mktFirstDescending).map(b => (
      { price: b === 'MKT' ? 'MKT' : Number(b), size: bidSizes[b] }
    ));

    // sort asks ascending
    const askSizes = getOrderSizesByPrice(asks);
    asks = Object.keys(askSizes).sort(mktFirstAscending).map(b => (
      { price: b === 'MKT' ? 'MKT' : Number(b), size: askSizes[b] }
    ));

    open = open.map(o => ({
      cancel: <FlatButton label="Cancel" onClick={() => AppTrade.onCancelClick(o.id)} />,
      ...o,
    }));

    // get auction
    const nextAuction = {
      time: this.nextAuctionTime(),
      id: auctionData.id,
      price: auctionData.price,
      size: auctionData.volume,
      trigger: <FlatButton label="Call" onClick={this.onCallClick} />,
    };

    if (this.mounted) {
      this.setState({
        realOrders,
        fakeOrders,
        auctionData,

        ordersOpen: open,
        ordersBids: bids,
        ordersAsks: asks,
        nextAuction: [nextAuction],
      });
    }
  }

  render() {
    const styles = {
      contentStyle: {
        marginLeft: '210px',
        marginTop: '6px',
      },
      demoOrdersToggle: {
        fontSize: 14,
        paddingTop: 10,
        width: 150,
      },
    };

    const errorDialogActions = [
      <FlatButton
        label="OK"
        onClick={this.handleErrorDialogClose}
        primary
      />,
    ];

    return (
      <div>
        <Dialog
          actions={errorDialogActions}
          open={this.state.errorDialogOpen}
          modal
        >
          {this.state.errorDialogMessage}
        </Dialog>
        <DrawerSidebar defaultPage="trade" />
        <NavBar />
        <div style={styles.contentStyle}>
          <ComponentHeader title={`Next Auction (${this.state.selectedProductName})`} width={810}>
            <TableList
              rows={this.state.nextAuction}
              columns={[
                ['Time', 'time'],
                ['Indicative Price', 'price', formatters.formatDecimal],
                ['Indicative Volume', 'size', x => formatters.formatDecimal(x, 4)],
                ['', 'trigger'],
              ]}
              stripedRows={false}
              showRowHover={false}
            />
          </ComponentHeader>
          <br />
          <table>
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'top' }}>
                  <ComponentHeader title="Trading" width={400}>
                    <OrderEntry
                      onProductChange={this.handleProductChange}
                      selectedProductIndex={this.state.selectedProductIndex}
                      selectedProductIdDefault={this.state.defaultProductId}
                      existingSyndicateProduct={this.state.selectedProductExistingSyndicateProduct}
                      existingSyndicateKey={this.state.selectedProductExistingSyndicateKey}
                    />
                  </ComponentHeader>
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  <ComponentHeader title={`Order Book (${this.state.selectedProductName})`} width={405}>
                    <OrderBook
                      bids={this.state.ordersBids}
                      asks={this.state.ordersAsks}
                    />
                  </ComponentHeader>
                </td>
              </tr>
            </tbody>
          </table>
          <br />
          <ComponentHeader title="My Open Orders" width={810}>
            <TableList
              rows={this.state.ordersOpen}
              columns={[
                ['Contract', 'productName'],
                ['Price', 'price', x => (x === null ? 'MKT' : formatters.formatDecimal(x))],
                ['Size', 'quantity', x => formatters.formatDecimal(x, 4)],
                ['Filled', 'quantityFilled', x => formatters.formatDecimal(x, 4)],
                ['', 'cancel'],
              ]}
            />
          </ComponentHeader>
          <table style={{ width: 810 }}>
            <tbody>
              <tr>
                <td style={{ width: '100%' }} />
                <td>
                  <Toggle
                    label="Demo Orders"
                    style={styles.demoOrdersToggle}
                    onToggle={this.handleDemoOrdersToggle}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  syndicates: getDepositedSyndicates(state),
});

const mapDispatchToProps = dispatch => ({
  // params: forceFetch, invalidateCache
  refreshSyndicates: () => dispatch(fetchSyndicatesIfNeeded(true, true)),
  registerTransaction: (txHash, callback) => dispatch(registerTransaction(txHash, callback)),
});

export default connect(mapStateToProps, mapDispatchToProps)(AppTrade);
