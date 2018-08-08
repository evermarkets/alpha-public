import React, { Component } from 'react';
import PropTypes from 'prop-types';

import Snackbar from 'material-ui/Snackbar';

const MSG_SUBMITTED = 'Transaction submitted';
const MSG_COMPLETE = 'Transaction complete';

class TxSnackbar extends Component {
  state = {
    open: false,
    message: MSG_SUBMITTED,
  };

  pendingAlerts = [];
  currentTxHash = null;
  timer = null;

  componentWillReceiveProps(nextProps) {
    const setDifference = (a, b) => new Set(
      [...a].filter(x => !b.has(x)));

    const newActive = setDifference(nextProps.active, this.props.active);
    const newCompleted = setDifference(nextProps.completed, this.props.completed);

    newActive.forEach(txHash => this.pendingAlerts.push({ message: MSG_SUBMITTED, txHash }));
    newCompleted.forEach(txHash => this.pendingAlerts.push({ message: MSG_COMPLETE, txHash }));

    if (!this.timer)
      this.processAlert();
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
  }

  processAlert = () => {
    if (this.pendingAlerts.length > 0) {
      const alert = this.pendingAlerts[0];
      this.pendingAlerts = this.pendingAlerts.slice(1);
      this.setState({
        open: true,
        message: alert.message,
      });
      this.currentTxHash = alert.txHash;

      // process next alert
      this.startTimer();
    } else {
      // no more alerts
      this.timer = null;
    }
  }

  startTimer() {
    this.timer = setTimeout(this.processAlert, 4000);
  }

  handleActionClick = () => {
    this.setState({
      open: false,
    });

    // open EtherScan in a new window
    const url = `https://rinkeby.etherscan.io/tx/${this.currentTxHash}`;
    window.open(url, '_blank');
  }

  handleRequestClose = () => {
    this.setState({
      open: false,
    });
  }

  render() {
    return (
      <Snackbar
        open={this.state.open}
        message={this.state.message}
        action="View"
        autoHideDuration={4000}
        onActionTouchTap={this.handleActionClick}
        onRequestClose={this.handleRequestClose}
      />
    );
  }
}

TxSnackbar.propTypes = {
  active: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  completed: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
};

export default TxSnackbar;
