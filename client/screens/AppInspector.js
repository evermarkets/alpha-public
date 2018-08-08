/* eslint-disable */

import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import Dialog from 'material-ui/Dialog';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';
import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import NumberInput from 'material-ui-number-input';

import NavBar from '../components/NavBar';
import DrawerSidebar from '../components/DrawerSidebar';
import ComponentHeader from '../components/ComponentHeader';
import TableList from '../components/TableList';

import chainMod from '../helpers/chain';
import formatters from '../../common/formatters';
import { registerTransaction } from '../actions/transactions';
import { getProductsForOrders } from '../selectors/products';
import { getSyndicatesActiveProducts } from '../selectors/syndicates';

class AppInspector extends Component {
  static propTypes = {
    // from react-redux
    products: PropTypes.arrayOf(PropTypes.object).isRequired,
    syndicates: PropTypes.arrayOf(PropTypes.object).isRequired,
    registerTransaction: PropTypes.func.isRequired,
  }

  state = {
    selectedProductIndex: 0,
    product: {},
    price: NaN,
    positionRows: [],

    // error dialog state
    errorDialogOpen: false,
    errorDialogMessage: '',
  };

  componentDidMount() {
    this.mounted = true;
    this.refresh();
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  componentDidUpdate(prevProps) {
    if (Object.keys(prevProps.products).length === 0 &&
      Object.keys(this.props.products).length > 0) {
      // received products for the first time - refresh list
      this.refresh();
    }
  }

  showErrorDialog(message) {
    this.setState({
      errorDialogOpen: true,
      errorDialogMessage: message,
    });
  }

  handleErrorDialogClose = () => {
    this.setState({
      errorDialogOpen: false,
    });
  }

  refresh = async (selectedProductIndex) => {
    if (this.props.products.length === 0)
      return;

    const Web3 = chainMod.getWeb3();
    const chain = chainMod.chain(Web3);

    if (selectedProductIndex === undefined)
      selectedProductIndex = this.state.selectedProductIndex;

    const product = this.props.products[selectedProductIndex];

    // get last price
    const price = await chain.getLastPrice(product.name);
    this.price.getInputNode().value = price;
    this.price.textField.setState({ hasValue: true });

    const positions = await this.getAllPositions(product);
    const positionRows = AppInspector.getPositionRows(positions, price);

    if (this.mounted) {
      this.setState({ product, price, positionRows });
    }
  }

  static getPositionRows(positions, price) {
    const positionRows = [];

    const fmt = value => `${formatters.formatDecimal(value * 100, 1)}`;
    for (const mp of Object.values(positions)) {
      let name;
      if (mp.isCustodian)
        name = 'Custodian';
      else
        name = mp.displayName;

      positionRows.push({
        id: positionRows.length,
        name,
        qty: mp.qty,
        depositString: `$${formatters.formatDecimal(mp.deposit, 2)} (${fmt(mp.deposit / (mp.maintenanceMargin * Math.abs(mp.qty)))}%)`,
        availableDeposit: mp.availableDeposit,
        lockedUpDeposit: mp.lockedUpDeposit,
      });

      for (const trader of Object.values(mp.traders)) {
        positionRows.push({
          id: positionRows.length,
          name: ` - Trader: ${trader.address.substring(0, 9)}`,
          qty: trader.qty,
          depositString: `$${formatters.formatDecimal(trader.deposit, 2)} (${fmt(trader.deposit / (trader.maintenanceMargin * Math.abs(trader.qty)))}%)`,
          availableDeposit: trader.availableDeposit,
          lockedUpDeposit: trader.lockedUpDeposit,
        });
      }
    }

    return positionRows;
  }

  getAllPositions = async (product) => {
    const Web3 = chainMod.getWeb3();
    const chain = chainMod.chain(Web3);

    // get list of traders on future and margin providers
    const productName = product.name;
    const mpAddrs = await chain.getTradersOnFuture(productName);
    const custodian = await chain.getFutureCustodian(productName);

    const mps = {};

    for (const mpAddr of mpAddrs) {
      const isCustodian = (custodian === mpAddr);
      const syndicate = this.props.syndicates
        .find(s => (s.address === mpAddr));
      const maintenanceMargin = isCustodian
        ? product.maintenanceMargin
        : syndicate.products
          .find(p => p.name === productName).maintenanceMargin;

      // get balances for trader (on Future)
      const balanceList = await Promise.all([
        (isCustodian
          ? chain.getAvailableDepositOnFutureUSD(productName, mpAddr)
          : chain.getAvailableLenderDepositUSD(syndicate.key)),
        chain.getLockedUpDepositOnFutureUSD(productName, mpAddr),
        chain.getQtyOnFuture(productName, mpAddr),
      ]);

      const traders = {};
      if (!isCustodian) {
        const traderAddrs = await chain.getTradersOnMarginProvider(
          productName, syndicate.key);
        for (const traderAddr of traderAddrs) {
          // get balances for trader (on Margin Provider)
          const balanceListInner = await Promise.all([
            chain.getTotalDepositUSD(syndicate.key, traderAddr),
            chain.getAvailableDepositUSD(syndicate.key, traderAddr),
            chain.getLockedUpDepositUSD(syndicate.key, traderAddr),
            chain.getQty(syndicate.key, productName, traderAddr),
          ]);

          // no position
          if (formatters.toNumber(balanceListInner[3]) === 0)
            continue;

          traders[traderAddr] = {
            deposit: formatters.toNumber(balanceListInner[0]),
            availableDeposit: formatters.toNumber(balanceListInner[1]),
            lockedUpDeposit: formatters.toNumber(balanceListInner[2]),
            qty: formatters.toNumber(balanceListInner[3]),
            address: traderAddr,
            maintenanceMargin: maintenanceMargin,
          };
        }
      }

      // no position or traders with positions
      if (formatters.toNumber(balanceList[2]) === 0 && Object.values(traders).length === 0)
        continue;

      mps[mpAddr] = {
        ...syndicate,
        isCustodian,
        deposit: formatters.toNumber(balanceList[0]) + formatters.toNumber(balanceList[1]),
        availableDeposit: formatters.toNumber(balanceList[0]),
        lockedUpDeposit: formatters.toNumber(balanceList[1]),
        qty: formatters.toNumber(balanceList[2]),
        address: mpAddr,
        maintenanceMargin: product.maintenanceMargin,
        traders,
      };
    }

    return mps;
  }

  handleProductChange = (event, index, value) => {
    this.setState({
      selectedProductIndex: value,
    });

    this.refresh(value);
  }

  handleOrderValueChange = () => {
    const price = this.price.textField.getValue();
    this.setState({ price });
  }

  markPosition = async () => {
    const Web3 = chainMod.getWeb3();
    const chain = chainMod.chain(Web3);

    const { success, result } = await chain.markPosition(
      this.state.product.name,
      this.state.price);

    if (!success) {
      this.showErrorDialog((
        <div>Unable to mark position.<br /><br />{`Error: ${result}`}</div>
      ));
    } else {
      // if success, result is a list of txHashes
      result.map(this.props.registerTransaction);
    }
  }

  render() {
    const contentStyle = {
      marginLeft: '210px',
      marginTop: '6px',
    };

    const styles = {
      button: {
        width: 200,
        margin: 12,
      },
      selectProduct: {
        marginLeft: 20,
        width: 165,
      },
      textField: {
        marginLeft: 20,
        width: 165,
      },
      marginString: {
        marginLeft: 10,
        marginTop: 5,
        marginBottom: 10,
        fontFamily: 'Roboto, sans-serif',
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
        <DrawerSidebar defaultPage="inspector" />
        <NavBar />
        <div style={contentStyle}>
          <Dialog
            actions={errorDialogActions}
            open={this.state.errorDialogOpen}
            modal
          >
            {this.state.errorDialogMessage}
          </Dialog>
          <table>
            <tbody>
            <tr>
              <td>
                <SelectField
                  floatingLabelText="Contract"
                  value={this.state.selectedProductIndex}
                  onChange={this.handleProductChange}
                  underlineShow={false}
                  style={styles.selectProduct}
                >
                  {
                    this.props.products
                      .map((s, idx) => (
                        <MenuItem key={s.name} value={idx} primaryText={s.name} />
                      ))
                  }
                </SelectField>
              </td>
              <td>
                <NumberInput
                  floatingLabelText="Price"
                  type="number"
                  ref={o => (this.price = o)} // eslint-disable-line no-return-assign
                  style={styles.textField}
                  underlineShow={false}
                  strategy="ignore"
                  min={0}
                  onChange={this.handleOrderValueChange}
                />
              </td>
              <td>
                <RaisedButton
                  label="Mark Position"
                  style={styles.button}
                  onClick={this.markPosition}
                />
              </td>
            </tr>
            </tbody>
          </table>
          <div style={styles.marginString}>
            { this.state.product.marginRequirementString }
          </div>
          <ComponentHeader
            title="Current Positions"
            width={925}
            onRefreshClick={_ => this.refresh()}
          >
            <TableList
              rows={this.state.positionRows}
              columns={[
                ['Name', 'name'],
                ['Quantity', 'qty', x => formatters.formatDecimal(x, 4)],
                ['Total Deposit', 'depositString'],
                ['Available Deposit', 'availableDeposit', x => `$${formatters.formatDecimal(x, 2)}`],
                ['Locked Up Deposit', 'lockedUpDeposit', x => `$${formatters.formatDecimal(x, 2)}`],
              ]}
            />
          </ComponentHeader>
        </div>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  products: getProductsForOrders(state),
  syndicates: getSyndicatesActiveProducts(state),
});

const mapDispatchToProps = dispatch => ({
  registerTransaction: txHash => dispatch(registerTransaction(txHash)),
});

export default connect(mapStateToProps, mapDispatchToProps)(AppInspector);
