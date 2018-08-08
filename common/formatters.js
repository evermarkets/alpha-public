function formatDecimal(value, decimalPlaces = 2) {
  if (value == null)
    return '';

  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
}

function toNumber(value) {
  // sometimes fromWei/toWei returns BigNumber and sometimes it returns Number
  // or String - so handle that inconsistency here
  if (typeof value === 'number')
    return value;
  if (typeof value === 'string')
    return parseFloat(value);
  return value.toNumber();
}

const formatters = {
  formatDecimal,
  toNumber,
};

module.exports = formatters;
