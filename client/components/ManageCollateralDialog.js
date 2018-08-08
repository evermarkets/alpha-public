import React, { Component } from 'react';
import PropTypes from 'prop-types';

import Dialog from 'material-ui/Dialog';
import { Tabs, Tab } from 'material-ui/Tabs';
import Divider from 'material-ui/Divider';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import AddIcon from 'material-ui/svg-icons/content/add';
import RemoveIcon from 'material-ui/svg-icons/content/remove';

export default class ManageCollateralDialog extends Component {
  static propTypes = {
    productName: PropTypes.string.isRequired,
    productKey: PropTypes.any, // eslint-disable-line react/forbid-prop-types
    contextTerm: PropTypes.string.isRequired,
    open: PropTypes.bool.isRequired,
    excess: PropTypes.number.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    onPost: PropTypes.func.isRequired,
    onWithdraw: PropTypes.func.isRequired,
  };

  render() {
    const styles = {
      button: {
        margin: 12,
        width: 250,
      },
      textField: {
        marginLeft: 20,
      },
      headline: {
        fontSize: 24,
        paddingTop: 16,
        marginBottom: 12,
        fontWeight: 400,
      },
    };
    return (
      <div>
        <Dialog
          title={`Manage ${this.props.contextTerm} for ${this.props.productName}`}
          open={this.props.open}
          modal={false}
          onRequestClose={this.props.onRequestClose}
        >
          <Tabs>
            <Tab label="Post" >
              <div>
                <h2 style={styles.headline}>{`Post Additional ${this.props.contextTerm}`}</h2>
                <TextField
                  floatingLabelText="EMX"
                  type="number"
                  ref={o => (this.post = o)} // eslint-disable-line no-return-assign
                  style={styles.textField}
                  underlineShow={false}
                />
                <Divider />
                <RaisedButton
                  label={`Post ${this.props.contextTerm}`}
                  style={styles.button}
                  icon={<AddIcon />}
                  backgroundColor="#3a7dae"
                  labelColor="#ffffff"
                  onClick={() => this.props.onPost(
                    this.props.productKey || this.props.productName, this.post.getValue())}
                />
              </div>
            </Tab>
            <Tab label="Withdraw" >
              <div>
                <h2 style={styles.headline}>{`Withdraw Excess ${this.props.contextTerm}`}</h2>
                <TextField
                  floatingLabelText="EMX"
                  type="number"
                  ref={o => (this.withdraw = o)} // eslint-disable-line no-return-assign
                  style={styles.textField}
                  underlineShow={false}
                  defaultValue={this.props.excess}
                />
                <Divider />
                <RaisedButton
                  label={`Withdraw ${this.props.contextTerm}`}
                  style={styles.button}
                  icon={<RemoveIcon />}
                  backgroundColor="#3a7dae"
                  labelColor="#ffffff"
                  onClick={() => this.props.onWithdraw(
                    this.props.productKey || this.props.productName, this.withdraw.getValue())}
                />
              </div>
            </Tab>
          </Tabs>
        </Dialog>
      </div>
    );
  }
}
