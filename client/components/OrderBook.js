import React, { Component } from 'react';
import PropTypes from 'prop-types';

import formatters from '../../common/formatters';

const maxOrders = 22;

const Colors = {
  textDark: '#262626',
  textMedium: '#A0A19D',
  textLight: '#DCDBDC',
  textImbalance: '#C0986E',

  parentBackground: '#FFFFFF',
  crossBackground: '#FEF8EF', // was #F5EBE2
  indicativeBackground: '#FEF8EF',
};

export default class OrderBook extends Component {
  static propTypes = {
    bids: PropTypes.arrayOf(PropTypes.object),
    asks: PropTypes.arrayOf(PropTypes.object),
  };

  state = {
    orderRows: [],
  };

  componentWillReceiveProps(nextProps) {
    let { bids, asks } = nextProps;

    let qtyMarketBuy = 0;
    if (bids.length > 0 && bids[0].price === 'MKT') {
      qtyMarketBuy = bids[0].size;
      bids = bids.slice(1);
    }

    let qtyMarketSell = 0;
    if (asks.length > 0 && asks[0].price === 'MKT') {
      qtyMarketSell = asks[0].size;
      asks = asks.slice(1);
    }

    const rows = OrderBook.getRows(bids, asks, qtyMarketBuy, qtyMarketSell);
    this.setState({
      orderRows: rows,
    });
  }

  static getRows(bids, asks, qtyMarketBuy, qtyMarketSell) {
    // the bids and asks arrays are sorted from least to most aggressive
    // bidsOverlap and asksOverlap represent the subarrays of each that 'cross'
    const bidsOverlap = (asks.length > 0 ? bids.filter(o => o.price >= asks[0].price) : []);
    const asksOverlap = (bids.length > 0 ? asks.filter(o => o.price <= bids[0].price) : []);

    // overlap is the number of elements that are in the 'cross'
    // (including market orders on both sides)
    let overlap = new Set(bidsOverlap.map(o => o.price).concat(asksOverlap.map(o => o.price))).size;
    if (qtyMarketBuy > 0)
      overlap += 1;
    if (qtyMarketSell > 0)
      overlap += 1;

    // asksOnly represents the rows (prices) that only have offers
    let asksOnly;
    if (bidsOverlap.length + Math.ceil((maxOrders - overlap) / 2) < bids.length) {
      // can bids use all its fair allocation?
      asksOnly = Math.min(
        Math.ceil((maxOrders - overlap) / 2),
        asks.length - asksOverlap.length);
    } else {
      asksOnly = Math.min(
        maxOrders - overlap - (bids.length - bidsOverlap.length),
        asks.length - asksOverlap.length);
    }

    // bidsOnly represents the rows (prices) that only have bids
    const bidsOnly = Math.min(
      maxOrders - asksOnly - overlap,
      bids.length - bidsOverlap.length);

    // if we don't fill all the space with orders, pad the top to center things
    const paddingTop = Math.floor((maxOrders - (asksOnly + overlap + bidsOnly)) / 2);
    const rows = [...Array(paddingTop).keys()].map(() => [0, 0, 0, false, false, 0, 0, 0, 0]);

    // 'rows' index-based argument key:
    //   px,
    //   qtyBuy, qtySell,
    //   matchedBuy, matchedSell,
    //   imbalanceBuy, imbalanceSell,
    //   marketBuy, marketSell,

    let bidCount = 0;
    let askCount = 0;
    for (let i = 0; i < (asksOnly + overlap + bidsOnly); i++) {
      if (i < asksOnly) {
        // asks only
        const a = asks[(asksOnly + asksOverlap.length) - (askCount + 1)];
        rows.push([a.price, 0, a.size, false, false, 0, 0, 0, 0]);
        askCount += 1;
      } else if (i === asksOnly && qtyMarketBuy) {
        // market buy
        rows.push([0, 0, 0, true, false, 0, 0, qtyMarketBuy, 0]);
      } else if (i === (asksOnly + overlap) - 1 && qtyMarketSell) {
        // market sell
        rows.push([0, 0, 0, false, true, 0, 0, 0, qtyMarketSell]);
      } else if (i < asksOnly + overlap) {
        // overlap
        const a = asks[(asksOnly + asksOverlap.length) - (askCount + 1)];
        const b = bids[bidCount];
        if (a && b && a.price === b.price) {
          rows.push([a.price, b.size, a.size, true, true, 0, 0, 0, 0]);
          askCount += 1;
          bidCount += 1;
        } else if (a && (!b || a.price > b.price)) {
          rows.push([a.price, 0, a.size, true, true, 0, 0, 0, 0]);
          askCount += 1;
        } else {
          rows.push([b.price, b.size, 0, true, true, 0, 0, 0, 0]);
          bidCount += 1;
        }
      } else {
        // bids only
        const b = bids[bidCount];
        rows.push([b.price, b.size, 0, false, false, 0, 0, 0, 0]);
        bidCount += 1;
      }
    }

    // pad the end of the list with empty rows to fill the space
    const paddingBottom = (maxOrders - rows.length);
    [...Array(paddingBottom).keys()].map(() => rows.push([0, 0, 0, false, false, 0, 0, 0, 0]));

    return rows;
  }

  static renderRow(
    idx, px,
    qtyBuy, qtySell,
    matchedBuy, matchedSell,
    imbalanceBuy, imbalanceSell,
    marketBuy, marketSell,
  ) {
    let textPx;
    let colorPx;
    let backgroundColorPx;

    if (px !== 0)
      textPx = formatters.formatDecimal(px, 2);

    let textBuyQty;
    let colorBuy;
    let backgroundColorBuy;

    if (marketBuy) {
      textPx = 'Market Buy';
      textBuyQty = marketBuy;
      colorBuy = Colors.textDark;
      backgroundColorBuy = Colors.crossBackground;
    } else if (imbalanceBuy) {
      textPx = 'Imbalance';
      textBuyQty = imbalanceBuy;
      colorBuy = Colors.textImbalance;
      backgroundColorBuy = Colors.parentBackground;
    } else if (qtyBuy) {
      textBuyQty = qtyBuy;
      colorBuy = (matchedBuy ? Colors.textDark : Colors.textMedium);
      backgroundColorBuy = (matchedBuy ? Colors.crossBackground : Colors.parentBackground);
    }

    let textSellQty;
    let colorSell;
    let backgroundColorSell;

    if (marketSell) {
      textPx = 'Market Sell';
      textSellQty = marketSell;
      colorSell = Colors.textDark;
      backgroundColorSell = Colors.crossBackground;
    } else if (imbalanceSell) {
      textPx = 'Imbalance';
      textSellQty = imbalanceSell;
      colorSell = Colors.textImbalance;
      backgroundColorSell = Colors.parentBackground;
    } else if (qtySell) {
      textSellQty = qtySell;
      colorSell = (matchedSell ? Colors.textDark : Colors.textMedium);
      backgroundColorSell = (matchedSell ? Colors.crossBackground : Colors.parentBackground);
    }

    if (colorSell === Colors.textDark ||
        colorBuy === Colors.textDark)
      colorPx = Colors.textDark;

    if (backgroundColorSell === Colors.crossBackground ||
        backgroundColorBuy === Colors.crossBackground)
      backgroundColorPx = Colors.crossBackground;

    const styles = {
      px: {
        color: colorPx,
        backgroundColor: backgroundColorPx,
        width: '40%',
        textAlign: 'center',
      },
      buySize: {
        color: colorBuy,
        backgroundColor: backgroundColorBuy,
        width: '30%',
        paddingRight: 5,
        textAlign: 'right',
      },
      sellSize: {
        color: colorSell,
        backgroundColor: backgroundColorSell,
        width: '30%',
        textAlign: 'left',
      },
      row: {
        height: 16,
      },
    };

    return (
      <tr key={idx} style={styles.row}>
        <td style={styles.buySize}>{textBuyQty}</td>
        <td colSpan="2" style={styles.px}>{textPx}</td>
        <td style={styles.sellSize}>{textSellQty}</td>
      </tr>
    );
  }

  static renderRows(orderRows) {
    return (
      <tbody>
        { [...orderRows.entries()].map(
          ([idx, r]) => OrderBook.renderRow(idx, ...r)) }
      </tbody>
    );
  }

  render() {
    const styles = {
      table: {
        fontSize: 14,
        width: '100%',
        lineHeight: '14px',
        backgroundColor: Colors.parentBackground,
        height: 378,
      },
      headerCell: {
        color: Colors.textLight,
        lineHeight: '24px',
        textAlign: 'center',
        width: '50%',
        fontSize: 16,
      },
      header: {
        height: 49,
      },
    };

    return (
      <div>
        <table style={styles.table}>
          <tbody>
            <tr style={styles.header}>
              <td style={styles.headerCell} colSpan="2">BUYS</td>
              <td style={styles.headerCell} colSpan="2">SELLS</td>
            </tr>
          </tbody>
          {OrderBook.renderRows(this.state.orderRows)}
        </table>
      </div>
    );
  }
}
