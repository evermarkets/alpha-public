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
import SelectField from 'material-ui/SelectField';
import MenuItem from 'material-ui/MenuItem';
import FlatButton from 'material-ui/FlatButton';
import Divider from 'material-ui/Divider';
import TextField from 'material-ui/TextField';

import app from '../feathers';

export default class AddProductsToSyndicateDialog extends Component {
  static propTypes = {
    open: PropTypes.bool,
    syndicate: PropTypes.any, // eslint-disable-line react/forbid-prop-types
    onRequestClose: PropTypes.func,
  };

  state = {
    stepIndex: 0,
    products: [],
    selectedProduct: null,
  };

  componentDidMount() {
    const productsService = app.service('products');
    productsService.find({
      query: {
        expiry: { gt: new Date() },
        demoDisplayOnly: false,
        $sort: {
          name: 1,
        },
      },
    }).then((products) => {
      this.setState({
        selectedProduct: products[0].name,
        products,
      });
    });
  }

  handleNext = () => {
    const { stepIndex } = this.state;
    let nextStepIndex = stepIndex + 1;
    if (stepIndex === 1) {
      const productName = this.state.selectedProduct;
      const product = this.state.products.find(p => p.name === productName);
      const params = {
        key: this.props.syndicate.key,
        productName,
        productId: product.id,
        numLeverage: parseInt(this.textLeverage.getValue(), 10) + 1,
        numFeePerContract: parseFloat(this.textFeePerContract.getValue(), 10),
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

  handleProductChange = (event, index, value) => {
    this.setState({
      selectedProduct: value,
    });
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
    return (
      <div>
        <div style={{ fontSize: 14, display: page0Visibility }}>
          <div style={{ float: 'left' }}>
            Which contract would you like to support?<br />
            <SelectField
              floatingLabelText="Contract"
              value={this.state.selectedProduct}
              onChange={this.handleProductChange}
              style={styles.textField}
              underlineShow={false}
            >
              {
                this.state.products.map(p => (
                  <MenuItem key={p.id} value={p.name} primaryText={p.name} />
                ))
              }
            </SelectField>
            <Divider style={styles.divider} />
          </div>
          <div style={{ float: 'right', marginRight: 75 }}>
            What margin matching multiplier will you provide?<br />
            <TextField
              floatingLabelText="Multiplier"
              defaultValue="1"
              type="number"
              ref={o => (this.textLeverage = o)}
              style={styles.textField}
              underlineShow={false}
            />
            <Divider style={styles.divider} />
          </div>
          <div style={{ clear: 'both' }} /><br />
          <div>
            What trading fee will you charge?<br />
            <TextField
              floatingLabelText="Fee Per Contract (USD)"
              defaultValue="1"
              type="number"
              ref={o => (this.textFeePerContract = o)}
              style={styles.textField}
              underlineShow={false}
            />
            <Divider style={styles.divider} />
          </div>
        </div>

        <div style={{ fontSize: 14, display: page1Visibility }}>
          Click <span style={{ fontWeight: 'bold' }}>Launch</span> below to add support for the selected contract to your syndicate. You will be asked to
          sign a transaction covering the transaction gas costs.<br />
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
          title="Add Contract to Syndicate"
          open={this.props.open}
          modal={false}
          onRequestClose={this.props.onRequestClose}
        >
          <Stepper activeStep={stepIndex}>
            <Step>
              <StepLabel>Define parameters</StepLabel>
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
                label={stepIndex === 1 ? 'Launch' : 'Next'}
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
