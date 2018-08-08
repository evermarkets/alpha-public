import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import RaisedButton from 'material-ui/RaisedButton';
import TextField from 'material-ui/TextField';
import Divider from 'material-ui/Divider';
import NumberInput from 'material-ui-number-input';

import NavBar from '../components/NavBar';
import ComponentHeader from '../components/ComponentHeader';
import DrawerSidebar from '../components/DrawerSidebar';

import app from '../feathers';
import chainMod from '../helpers/chain';
import formatters from '../../common/formatters';
import { fetchSyndicatesIfNeeded } from '../actions/syndicates';
import { fetchProductsIfNeeded } from '../actions/products';
import { registerTransaction } from '../actions/transactions';

class AppDebug extends Component {
  static propTypes = {
    // from react-redux
    refreshSyndicates: PropTypes.func.isRequired,
    refreshProducts: PropTypes.func.isRequired,
    registerTransaction: PropTypes.func.isRequired,
  }

  componentDidMount() {
    this.refresh();
  }

  refresh = async () => {
    const chain = chainMod.chain(chainMod.getWeb3());
    const fxRate = await chain.getEVRRate('USD');
    this.fxRate.getInputNode().value = formatters.formatDecimal(
      formatters.toNumber(fxRate), 2);
    this.fxRate.textField.setState({ hasValue: true });
  }

  invalidateCaches = () => {
    this.props.refreshProducts();
    this.props.refreshSyndicates();
  }

  static resetDatabase() {
    const debugService = app.service('debug/resetDatabase');
    debugService.find();
  }

  static clearOrders() {
    const debugService = app.service('debug/clearOrders');
    debugService.find();
  }

  mintEVR = () => {
    const chain = chainMod.chain(chainMod.getWeb3());
    const valueEVR = this.mintAmount.getValue();
    const addr = this.mintAddr.getValue();

    chain.mintEVR(addr, valueEVR)
      .then((txHash) => {
        this.props.registerTransaction(txHash);
      });
  }

  setRate = async () => {
    const fxRate = this.fxRate.textField.getValue();
    const debugService = app.service('debug/setEVRRate/:currency/:fxRate');
    const txHash = await debugService.find({
      query: {
        currency: 'USD',
        fxRate,
      },
    });

    this.props.registerTransaction(txHash);
  }

  render() {
    const contentStyle = {
      marginLeft: '210px',
      marginTop: '6px',
    };
    const styles = {
      button: {
        width: 275,
        margin: 12,
      },
      mintButton: {
        width: 400,
        margin: 12,
      },
      textField: {
        width: 400,
        marginLeft: 20,
      },
    };
    return (
      <div>
        <DrawerSidebar defaultPage="debug" />
        <NavBar />
        <div style={contentStyle}>
          <RaisedButton
            label="Invalidate Caches"
            style={styles.button}
            onClick={this.invalidateCaches}
          />
          <br />
          <RaisedButton
            label="Reset Database + Deploy"
            style={styles.button}
            onClick={AppDebug.resetDatabase}
          />
          <br />
          <RaisedButton
            label="Clear Orders"
            style={styles.button}
            onClick={AppDebug.clearOrders}
          />
          <br /><br />
          <ComponentHeader title="EMX Token Faucet" width={420}>
            <div>
              <TextField
                floatingLabelText="Address"
                ref={o => (this.mintAddr = o)} // eslint-disable-line no-return-assign
                style={styles.textField}
                underlineShow={false}
              />
              <Divider />
              <TextField
                floatingLabelText="Amount"
                type="number"
                ref={o => (this.mintAmount = o)} // eslint-disable-line no-return-assign
                style={styles.textField}
                defaultValue="1000"
                underlineShow={false}
              />
              <Divider />
              <RaisedButton
                label="Mint EMX"
                style={styles.mintButton}
                backgroundColor="#3a7dae"
                labelColor="#ffffff"
                onClick={this.mintEVR}
              />
            </div>
          </ComponentHeader>
          <br />
          <ComponentHeader title="EMX/USD FX Rate" width={420}>
            <div>
              <NumberInput
                floatingLabelText="1 USD = ? EMX"
                type="number"
                ref={o => (this.fxRate = o)} // eslint-disable-line no-return-assign
                style={styles.textField}
                underlineShow={false}
                strategy="ignore"
                min={0}
              />
              <Divider />
              <RaisedButton
                label="Set Rate"
                style={styles.mintButton}
                backgroundColor="#3a7dae"
                labelColor="#ffffff"
                onClick={this.setRate}
              />
            </div>
          </ComponentHeader>
        </div>
      </div>
    );
  }
}

const mapDispatchToProps = dispatch => ({
  // params: forceFetch, invalidateCache
  refreshSyndicates: () => dispatch(fetchSyndicatesIfNeeded(true, true)),
  refreshProducts: () => dispatch(fetchProductsIfNeeded(true, true)),
  registerTransaction: (txHash, callback) => dispatch(registerTransaction(txHash, callback)),
});

export default connect(null, mapDispatchToProps)(AppDebug);
