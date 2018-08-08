/* eslint-disable no-return-assign */

import React, { Component } from 'react';
import PropTypes from 'prop-types';

import Dialog from 'material-ui/Dialog';
import {
  Step,
  Stepper,
  StepLabel,
} from 'material-ui/Stepper';
import RaisedButton from 'material-ui/RaisedButton';
import FlatButton from 'material-ui/FlatButton';
import Divider from 'material-ui/Divider';
import TextField from 'material-ui/TextField';
import DatePicker from 'material-ui/DatePicker';
import TimePicker from 'material-ui/TimePicker';
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';

import moment from 'moment-timezone';

export default class CreateContractDialog extends Component {
  static propTypes = {
    open: PropTypes.bool,
    onRequestClose: PropTypes.func,
  };

  state = {
    stepIndex: 0,
    selectedOracle: 'Gnosis Centralized Oracle',
  };

  handleOracleChange = (event, index, value) => {
    this.setState({ selectedOracle: value });
  }

  handleNext = () => {
    const { stepIndex } = this.state;
    let nextStepIndex = stepIndex + 1;
    if (stepIndex === 2) {
      const expDate = this.dateExpiration.state.date;
      const expTime = this.timeExpiration.state.time;
      const params = {
        textName: this.textName.getValue(),
        textLongName: this.textLongName.getValue(),
        textTags: this.textTags.getValue(),
        numExpirationTimestamp: Math.floor(expDate.getTime() / 1e3),
        numInitialMargin: parseInt(this.textInitialMargin.getValue(), 10),
        numMainteanceMargin: parseInt(this.textMainteanceMargin.getValue(), 10),
        numBackstopDepositRatio: parseInt(this.textBackstopDepositRatio.getValue(), 10),
        numFeePerContract: parseFloat(this.textFeePerContract.getValue(), 10),
        numMultiplier: parseFloat(this.textMultiplier.getValue(), 10),
        textOracleAddress: this.textOracleAddress.getValue(),
        dateExpiration: moment.utc(moment(expDate).format('YYYY-MM-DD ') + moment(expTime).format('HH:mm')),
      };
      this.props.onRequestClose(params);
      nextStepIndex = 0;
    }
    this.setState({
      stepIndex: nextStepIndex,
    });
  }

  handlePrev = () => {
    const { stepIndex } = this.state;
    if (stepIndex > 0) {
      this.setState({
        stepIndex: stepIndex - 1,
      });
    }
  }

  getStepContent(stepIndex) {
    const styles = {
      textField: {
        marginLeft: 20,
        width: 250,
      },
      longTextField: {
        marginLeft: 20,
        width: 350,
      },
      divider: {
        width: 275,
      },
      longDivider: {
        width: 650,
      },
      selectFull: {
        marginLeft: 20,
      },
    };
    const page0Visibility = (stepIndex === 0 ? 'block' : 'none');
    const page1Visibility = (stepIndex === 1 ? 'block' : 'none');
    const page2Visibility = (stepIndex === 2 ? 'block' : 'none');
    return (
      <div>
        <div style={{ fontSize: 14, display: page0Visibility }}>
          <div style={{ float: 'left' }}>
            What should we call your contract?<br />
            <TextField
              floatingLabelText="Contract Code"
              type="string"
              ref={o => (this.textName = o)}
              style={styles.textField}
              underlineShow={false}
            />
            <Divider style={styles.divider} />
            <TextField
              floatingLabelText="Contract Name"
              type="string"
              ref={o => (this.textLongName = o)}
              style={styles.textField}
              underlineShow={false}
            />
            <Divider style={styles.divider} />
            <TextField
              floatingLabelText="Tags"
              type="string"
              ref={o => (this.textTags = o)}
              style={styles.textField}
              underlineShow={false}
            />
            <br /><br />
            What trading fee will you charge?<br />
            <TextField
              floatingLabelText="Fee Per Contract (USD)"
              defaultValue="1"
              type="number"
              ref={o => (this.textFeePerContract = o)}
              style={styles.textField}
              underlineShow={false}
            />
          </div>
          <div style={{ float: 'right', marginRight: 75 }}>
            What margin requirements will you enforce?<br />
            <TextField
              floatingLabelText="Initial Margin (USD)"
              defaultValue="2500"
              type="number"
              ref={o => (this.textInitialMargin = o)}
              style={styles.textField}
              underlineShow={false}
            />
            <Divider style={styles.divider} />
            <TextField
              floatingLabelText="Maintenance Margin (USD)"
              defaultValue="2000"
              type="number"
              ref={o => (this.textMainteanceMargin = o)}
              style={styles.textField}
              underlineShow={false}
            />
            <Divider style={styles.divider} />
            <TextField
              floatingLabelText="Backstop Deposit Ratio (bps)"
              defaultValue="5000"
              type="number"
              ref={o => (this.textBackstopDepositRatio = o)}
              style={styles.textField}
              underlineShow={false}
            />
            <br /><br />
            What contract multiplier will you set?<br />
            <TextField
              floatingLabelText="Multiplier"
              defaultValue="1"
              type="number"
              ref={o => (this.textMultiplier = o)}
              style={styles.textField}
              underlineShow={false}
            />
          </div>
        </div>

        <div style={{ fontSize: 14, display: page1Visibility }}>
          What contract and account will provide the price at settlement? (&quot;Oracle&quot;)<br />
          <SelectField
            floatingLabelText="Oracle Type"
            value={this.state.selectedOracle}
            onChange={this.handleOracleChange}
            underlineShow={false}
            style={styles.selectFull}
          >
            <MenuItem value="Gnosis Centralized Oracle" primaryText="Gnosis Centralized Oracle" />
            <MenuItem value="Existing Contract Address" primaryText="Existing Contract Address" />
          </SelectField>
          <Divider style={styles.divider} />
          <TextField
            floatingLabelText="Oracle Address"
            type="string"
            ref={o => (this.textOracleAddress = o)}
            style={styles.longTextField}
            defaultValue="Current User"
            underlineShow={false}
          />
          <Divider style={styles.divider} />
          <DatePicker
            floatingLabelText="Expiration Date"
            defaultDate={moment().add(30, 'days').toDate()}
            container="inline"
            ref={o => (this.dateExpiration = o)}
            style={styles.textField}
            underlineShow={false}
            autoOk
          />
          <Divider style={styles.divider} />
          <TimePicker
            floatingLabelText="Expiration Time (GMT)"
            defaultTime={moment('00:00', 'HH:mm').toDate()}
            minutesStep={5}
            format="24hr"
            ref={o => (this.timeExpiration = o)}
            style={styles.textField}
            underlineShow={false}
            autoOk
          />
          <Divider style={styles.divider} />
        </div>

        <div style={{ fontSize: 14, display: page2Visibility }}>
          Click <span style={{ fontWeight: 'bold' }}>Launch</span> below to create your contract. You will be asked to
          sign a transaction covering the deployment gas costs.<br />
        </div>
      </div>
    );
  }

  render() {
    const { stepIndex } = this.state;
    const styles = {
      contentStyle: {
        margin: '0 16px',
      },
    };

    return (
      <div>
        <Dialog
          title="Create Contract"
          open={this.props.open}
          modal={false}
          onRequestClose={this.props.onRequestClose}
        >
          <Stepper activeStep={stepIndex}>
            <Step>
              <StepLabel>Define parameters</StepLabel>
            </Step>
            <Step>
              <StepLabel>Specify settlement procedure</StepLabel>
            </Step>
            <Step>
              <StepLabel>Launch</StepLabel>
            </Step>
          </Stepper>
          <div style={styles.contentStyle}>
            {this.getStepContent(stepIndex)}
            <div style={{ marginTop: 16 }}>
              <FlatButton
                label="Back"
                disabled={stepIndex === 0}
                onClick={this.handlePrev}
                style={{ marginRight: 12 }}
              />
              <RaisedButton
                label={stepIndex === 2 ? 'Launch' : 'Next'}
                primary
                onClick={this.handleNext}
              />
            </div>
          </div>
        </Dialog>
      </div>
    );
  }
}
