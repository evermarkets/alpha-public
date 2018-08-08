import React, { Component } from 'react';
import { Link } from 'react-router';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import Drawer from 'material-ui/Drawer';
import Divider from 'material-ui/Divider';
import Subheader from 'material-ui/Subheader';
import Badge from 'material-ui/Badge';
import { List, ListItem, makeSelectable } from 'material-ui/List';
import Avatar from 'material-ui/Avatar';

import chainMod from '../helpers/chain';
import { fetchSyndicatesIfNeeded } from '../actions/syndicates';
import { fetchProductsIfNeeded } from '../actions/products';
import { getMyActiveProducts, getMyExpiredProducts } from '../selectors/products';
import { getPositionsForBalanceList, getMySyndicates } from '../selectors/syndicates';
import wrapState from './wrapState';

let SelectableList = makeSelectable(List);
SelectableList = wrapState(SelectableList);

class DrawerSidebar extends Component {
  static propTypes = {
    defaultPage: PropTypes.string.isRequired,

    // from react-redux
    numBalances: PropTypes.number.isRequired,
    numSyndicates: PropTypes.number.isRequired,
    numProductsActive: PropTypes.number.isRequired,
    numProductsExpired: PropTypes.number.isRequired,
    fetchSyndicates: PropTypes.func.isRequired,
    fetchProducts: PropTypes.func.isRequired,
  };

  state = {
    userAddress: chainMod.getWeb3().eth.accounts[0] || '',
  };

  componentDidMount() {
    this.props.fetchSyndicates();
    this.props.fetchProducts();
  }

  render() {
    const styles = {
      forceNavDown: {
        top: '63px',
        width: '200px',
      },
      subheader: {
        lineHeight: '24px',
        paddingLeft: 10,
      },
      badge: {
        padding: '0 0 0 0',
        display: 'block',
      },
      badgeContent: {
        top: 12,
        right: 10,
      },
    };
    const numProducts = (this.props.numProductsExpired || this.props.numProductsActive);
    return (
      <Drawer open containerStyle={styles.forceNavDown}>
        <SelectableList defaultValue={this.props.defaultPage}>
          <ListItem
            disabled
            leftAvatar={
              <Avatar
                src="/user.png"
              />
            }
          >
            {this.state.userAddress.substring(0, 9)}
          </ListItem>
          <Divider />
          <Subheader style={styles.subheader}>Trader</Subheader>
          <Badge
            badgeContent={this.props.numBalances}
            badgeStyle={{ ...styles.badgeContent, display: this.props.numBalances ? 'flex' : 'none' }}
            style={styles.badge}
            primary
          >
            <ListItem
              value="portfolio"
              containerElement={<Link to="/app" />}
              primaryText="Portfolio"
            />
          </Badge>
          <ListItem
            value="trade"
            containerElement={<Link to="/app/trade" />}
            primaryText="Trade"
          />
          <ListItem
            value="orders"
            containerElement={<Link to="/app/orders" />}
            primaryText="Orders"
          />
          <ListItem
            value="contracts"
            containerElement={<Link to="/app/contracts" />}
            primaryText="Contracts"
          />
          <ListItem
            value="margin"
            containerElement={<Link to="/app/margin" />}
            primaryText="Margin Accounts"
          />
          <Divider />
          <Subheader style={styles.subheader}>Lender</Subheader>
          <Badge
            badgeContent={this.props.numSyndicates}
            badgeStyle={{ ...styles.badgeContent, display: this.props.numSyndicates ? 'flex' : 'none' }}
            style={styles.badge}
            primary
          >
            <ListItem
              value="manageMargin"
              containerElement={<Link to="/app/manageMargin" />}
              primaryText="Manage Syndicates"
            />
          </Badge>
          <Divider />
          <Subheader style={styles.subheader}>Creator</Subheader>
          <Badge
            badgeContent={numProducts}
            badgeStyle={{ ...styles.badgeContent, display: numProducts ? 'flex' : 'none' }}
            style={styles.badge}
            primary={this.props.numProductsExpired === 0}
            secondary={this.props.numProductsExpired > 0}
          >
            <ListItem
              value="manageContracts"
              containerElement={<Link to="/app/manageContracts" />}
              primaryText="Manage Contracts"
            />
          </Badge>
          <Divider />
          <ListItem
            value="inspector"
            containerElement={<Link to="/app/inspector" />}
            primaryText="Inspector"
          />
          <ListItem
            value="debug"
            containerElement={<Link to="/app/debug" />}
            primaryText="Debug"
          />
        </SelectableList>
      </Drawer>
    );
  }
}

const mapStateToProps = state => ({
  numBalances: getPositionsForBalanceList(state).length,
  numSyndicates: getMySyndicates(state).length,
  numProductsActive: getMyActiveProducts(state).length,
  numProductsExpired: getMyExpiredProducts(state).length,
});

const mapDispatchToProps = dispatch => ({
  fetchSyndicates: () => dispatch(fetchSyndicatesIfNeeded()),
  fetchProducts: () => dispatch(fetchProductsIfNeeded()),
});

export default connect(mapStateToProps, mapDispatchToProps)(DrawerSidebar);
