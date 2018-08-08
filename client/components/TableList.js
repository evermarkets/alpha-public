import React, { Component } from 'react';
import PropTypes from 'prop-types';

import {
  Table, TableBody, TableHeader, TableHeaderColumn,
  TableRow, TableRowColumn } from 'material-ui/Table';

class TableList extends Component {
  renderOrder = (order) => {
    if (typeof order.id === 'undefined')
      return null;

    return (
      <TableRow key={order.id}>
        {this.props.columns.map(([, key, func]) => {
          let value = order[key];
          if (func) // transform function
            value = func(value);
          return <TableRowColumn key={key} width={50}>{value}</TableRowColumn>;
        })}
      </TableRow>
    );
  }

  render() {
    return (
      <Table
        selectable={false}
      >
        <TableHeader
          displaySelectAll={false}
          adjustForCheckbox={false}
        >
          <TableRow>
            {this.props.columns.map(([header, key]) =>
              <TableHeaderColumn key={key} width={50}>{header}</TableHeaderColumn>,
            )}
          </TableRow>
        </TableHeader>
        <TableBody
          displayRowCheckbox={false}
          stripedRows={this.props.stripedRows}
          showRowHover={this.props.showRowHover}
        >
          {this.props.rows.map(this.renderOrder)}
        </TableBody>
      </Table>
    );
  }
}

TableList.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.array),
  rows: PropTypes.arrayOf(PropTypes.object),
  stripedRows: PropTypes.bool,
  showRowHover: PropTypes.bool,
};

TableList.defaultProps = {
  stripedRows: true,
  showRowHover: true,
};

export default TableList;
