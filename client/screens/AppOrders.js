import React, { Component } from 'react';

import app from '../feathers';
import chainMod from '../helpers/chain';
import formatters from '../../common/formatters';
import orders from '../../common/orders';

import NavBar from '../components/NavBar';
import ComponentHeader from '../components/ComponentHeader';
import DrawerSidebar from '../components/DrawerSidebar';
import TableList from '../components/TableList';

class AppOrders extends Component {
  constructor(props) {
    super(props);

    this.state = {
      ordersOpen: [],
      ordersCompleted: [],
    };
  }

  componentDidMount() {
    this.mounted = true;
    this.refresh();
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  refresh() {
    const userAddress = chainMod.getWeb3().eth.accounts[0];
    orders.openOrders(app, null, userAddress).then((o) => {
      if (this.mounted) this.setState({ ordersOpen: o });
    });

    orders.completedOrders(app, null, userAddress).then((o) => {
      if (this.mounted) this.setState({ ordersCompleted: o });
    });
  }

  render() {
    const contentStyle = {
      marginLeft: '210px',
      marginTop: '6px',
    };

    function formatDate(date) {
      // from https://stackoverflow.com/questions/25275696/javascript-format-date-time
      let hours = date.getHours();
      let minutes = date.getMinutes();
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours %= 12;
      hours = hours || 12; // the hour '0' should be '12'
      minutes = minutes < 10 ? `0${minutes}` : minutes;
      const strTime = `${hours}:${minutes} ${ampm}`;
      return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()} ${strTime}`;
    }

    return (
      <div>
        <DrawerSidebar defaultPage="orders" />
        <NavBar />
        <div style={contentStyle}>
          <ComponentHeader title="Open" width={810}>
            <TableList
              rows={this.state.ordersOpen}
              columns={[
                ['Contract', 'productName'],
                ['Price', 'price', x => (x === null ? 'MKT' : formatters.formatDecimal(x))],
                ['Size', 'quantity', x => formatters.formatDecimal(x, 4)],
                ['Filled', 'quantityFilled', x => formatters.formatDecimal(x, 4)],
              ]}
            />
          </ComponentHeader>
          <br />
          <ComponentHeader title="Completed" width={810}>
            <TableList
              rows={this.state.ordersCompleted}
              columns={[
                ['Contract', 'productName'],
                ['Auction Date', 'createdAt', x => formatDate((new Date(x)))],
                ['Auction Price', 'priceAuction', x => formatters.formatDecimal(x)],
                ['Filled', 'quantityFilled', x => formatters.formatDecimal(x, 4)],
              ]}
            />
          </ComponentHeader>
        </div>
      </div>
    );
  }
}

export default AppOrders;
