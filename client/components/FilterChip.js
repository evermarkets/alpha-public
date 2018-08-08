import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';

import Chip from 'material-ui/Chip';
import Avatar from 'material-ui/Avatar';

export default class FilterChip extends PureComponent {
  static propTypes = {
    name: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired,
    icon: PropTypes.node.isRequired,
    selectedFilter: PropTypes.string,
    onFilterClick: PropTypes.func.isRequired,
  }

  onClick = () => {
    this.props.onFilterClick(this.props.name);
  }

  render() {
    const styles = {
      chip: {
        margin: 4,
      },
    };
    return (
      <div>
        <Chip
          backgroundColor={this.props.selectedFilter === this.props.name ? '#3a7dae' : null}
          labelColor={this.props.selectedFilter === this.props.name ? '#ffffff' : '#000000'}
          onClick={this.onClick}
          style={styles.chip}
        >
          <Avatar color="#3f6390" icon={this.props.icon} />
          {this.props.displayName}
        </Chip>
      </div>
    );
  }
}
