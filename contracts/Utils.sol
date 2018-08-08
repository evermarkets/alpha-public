pragma solidity ^0.4.18;

library Utils {

  function abs(int i)
    internal
    pure
    returns (uint)
  {
    return uint(i < 0 ? -i : i);
  }

  function sign(int i)
    internal
    pure
    returns (int)
  {
    return i < 0 ? -1 : i == 0 ? 0 : int(1);
  }

  function max_int(int a, int b)
    internal
    pure
    returns (int)
  {
    return a > b ? a : b;
  }

  function max_uint(uint a, uint b)
    internal
    pure
    returns (uint)
  {
    return a > b ? a : b;
  }

  function sum_ints(int[] nums)
    internal
    pure
    returns (int s)
  {
    for (uint i = 0; i < nums.length; i++)
        s += nums[i];
  }

  function sum_uints(uint[] nums)
    internal
    pure
    returns (uint s)
  {
    for (uint i = 0; i < nums.length; i++)
        s += nums[i];
  }

  function slice_addresses(address[] a, uint begin, uint end)
    internal
    pure
    returns (address[] s)
  {
    uint c = max_uint(0, end - begin);
    s = new address[](c);
    for (uint i = 0; i < c; ++i)
      s[i] = a[begin + i];
  }

  function slice_ints(int[] a, uint begin, uint end)
    internal
    pure
    returns (int[] s)
  {
    uint c = max_uint(0, end - begin);
    s = new int[](c);
    for (uint i = 0; i < c; ++i)
      s[i] = a[begin + i];
  }

  function to_evr_wei(uint evr_per_usd_wei, int usd_wei)
    internal
    pure
    returns (int)
  {
    return (usd_wei * int(evr_per_usd_wei)) / 1e18;
  }

  function to_usd_wei(uint evr_per_usd_wei, int evr_wei)
    internal
    pure
    returns (int)
  {
    return (evr_wei * 1e18) / int(evr_per_usd_wei);
  }

  function bytes_to_address(bytes address_bytes)
    internal
    pure
    returns (address)
  {
    require(address_bytes.length == 20);

    uint160 address_uint160 = 0;
    for (uint8 i = 0; i < 20; ++i)
      address_uint160 = (address_uint160 << 8) | uint160(address_bytes[i]);

    return address(address_uint160);
  }
}
