import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';

import Paper from 'material-ui/Paper';
import Subheader from 'material-ui/Subheader';
import RefreshIndicator from 'material-ui/RefreshIndicator';
import SvgIconChart from 'material-ui/svg-icons/action/trending-up';
import SvgIconCity from 'material-ui/svg-icons/social/location-city';
import SvgIconEuro from 'material-ui/svg-icons/action/euro-symbol';
import SvgIconGas from 'material-ui/svg-icons/maps/local-gas-station';
import SvgIconCredit from 'material-ui/svg-icons/action/credit-card';

import NavBar from '../components/NavBar';
import DrawerSidebar from '../components/DrawerSidebar';
import ContractPanel from '../components/ContractPanel';
import FilterChip from '../components/FilterChip';

import app from '../feathers';
import chainMod from '../helpers/chain';
import { fetchSyndicatesIfNeeded } from '../actions/syndicates';
import { fetchProductsIfNeeded } from '../actions/products';
import { getActiveProducts, getFavoriteProducts } from '../selectors/products';

class AppContracts extends Component {
  static propTypes = {
    // from react-redux
    productsFavorites: PropTypes.arrayOf(PropTypes.object).isRequired,
    productsActive: PropTypes.arrayOf(PropTypes.object).isRequired,
    refreshSyndicates: PropTypes.func.isRequired,
    refreshProducts: PropTypes.func.isRequired,
    isLoading: PropTypes.bool.isRequired,
  }

  state = {
    selectedFilter: 'equity_index',
  };

  onFavoriteClick = (product, newIsFavorite) => {
    const userAddress = chainMod.getWeb3().eth.accounts[0];
    const data = {
      userAddress,
      productId: product.id,
    };

    const favoritesService = app.service('contractFavorites');
    let serviceCall;
    if (newIsFavorite) {
      serviceCall = favoritesService.create(data)
        .catch(console.error);
    } else {
      serviceCall = favoritesService.remove(null, { query: data })
        .catch(console.error);
    }

    serviceCall.then(() => {
      // update list of syndicates (it derives from the list of favorites)
      this.props.refreshSyndicates();
      this.props.refreshProducts();
    });
  }

  onFilterClick = (filterName) => {
    let newFilterName = filterName;
    if (this.state.selectedFilter === filterName)
      newFilterName = null;

    this.setState({
      selectedFilter: newFilterName,
    });
  }

  static filterProducts(products, filterName) {
    return products
      .filter(p => (
        filterName === null ||
        p.tags === filterName
      ));
  }

  renderProduct(product) {
    return (
      <ContractPanel
        key={product.id}
        product={product}
        onFavoriteClick={this.onFavoriteClick}
        showFeesCollected={false}
      />
    );
  }

  render() {
    const styles = {
      wrapper: {
        display: 'flex',
        flexWrap: 'wrap',
      },
      paper: {
        width: 800,
      },
      subheader: {
        width: 800,
        lineHeight: '24px',
        backgroundColor: '#3a7dae',
        color: '#ffffff',
        marginBottom: 10,
      },
    };
    const contentStyle = {
      marginLeft: 210,
      marginTop: 6,
    };
    const makeHeader = name => (
      <Paper zDepth={1} style={styles.paper}>
        <Subheader style={styles.subheader}>{name}</Subheader>
      </Paper>
    );
    const favoriteProducts = AppContracts.filterProducts(
      this.props.productsFavorites,
      this.state.selectedFilter);
    const allProducts = AppContracts.filterProducts(
      this.props.productsActive,
      this.state.selectedFilter);
    return (
      <div>
        <DrawerSidebar defaultPage="contracts" />
        <NavBar />
        <div style={contentStyle}>
          <table style={{ width: 800 }}>
            <tbody>
              <tr>
                <td>
                  <div style={styles.wrapper}>
                    <FilterChip
                      name="equity_index"
                      displayName="Equity Index"
                      icon={<SvgIconChart />}
                      selectedFilter={this.state.selectedFilter}
                      onFilterClick={this.onFilterClick}
                    />
                    <FilterChip
                      name="commodity"
                      displayName="Commodity"
                      icon={<SvgIconGas />}
                      selectedFilter={this.state.selectedFilter}
                      onFilterClick={this.onFilterClick}
                    />
                    <FilterChip
                      name="stock"
                      displayName="Stock"
                      icon={<SvgIconCity />}
                      selectedFilter={this.state.selectedFilter}
                      onFilterClick={this.onFilterClick}
                    />
                    <FilterChip
                      name="credit"
                      displayName="Credit"
                      icon={<SvgIconCredit />}
                      selectedFilter={this.state.selectedFilter}
                      onFilterClick={this.onFilterClick}
                    />
                    <FilterChip
                      name="crypto"
                      displayName="Crypto"
                      icon={<SvgIconEuro />}
                      selectedFilter={this.state.selectedFilter}
                      onFilterClick={this.onFilterClick}
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <br />
          <RefreshIndicator
            size={40}
            left={575}
            top={175}
            status={this.props.isLoading ? 'loading' : 'hide'}
          />
          { (favoriteProducts.length > 0) ?
            makeHeader('Favorites') : null }
          {favoriteProducts.map(this.renderProduct, this)}
          { (allProducts.length > 0) ?
            makeHeader('All Contracts') : null }
          {allProducts.map(this.renderProduct, this)}
        </div>
      </div>
    );
  }
}

const mapStateToProps = state => ({
  productsActive: getActiveProducts(state),
  productsFavorites: getFavoriteProducts(state),
  isLoading: state.products.isLoading,
});

const mapDispatchToProps = dispatch => ({
  // params: forceFetch, invalidateCache
  refreshSyndicates: () => dispatch(fetchSyndicatesIfNeeded(true, true)),
  refreshProducts: () => dispatch(fetchProductsIfNeeded(true)), // forceFetch
});

export default connect(mapStateToProps, mapDispatchToProps)(AppContracts);
