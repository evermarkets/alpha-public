**Warning: This was an internal alpha used for demo purposes only. It is presented here for informational purposes only. It is not intended or fit for any other use.**

# EverMarkets Alpha

* [Overview](#overview)
* [Infrastructure](#infrastructure)
* [Build](#build)
* [Operations](#operations)
* [Debugging](#debugging)

## Overview

<img src="public/user.png" align=right>

This project demos the following aspects of the EverMarkets platform:
* Smart contracts that represent futures.
* Margin Syndicates.
* Collateral (in EMX) and positions locked-up on the blockchain.
* Collateral transfer based on profit/loss associated with traders' positions.
* "Dollar-neutral" profit and loss.
* Custom contract creation.
* Trading fees (paid to the Contract Creator).

## Infrastructure

This project includes a **Client** web application, API **Server**, and a suite of **Ethereum Smart Contracts**.

#### Client

The client web application is using [React](https://facebook.github.io/react/) as the UI framework and communicates with the server using Socket.io connections provided by the [Feathers](https://feathersjs.com/) framework. It uses [Material-UI](http://www.material-ui.com/) for CSS bootstrapping.

The client also requires that the user have [MetaMask](https://metamask.io/) installed for calls to the blockchain and transaction signing.

#### Server

The backend server uses Node.js and the [Feathers](https://feathersjs.com/) framework to expose REST and Socket.io services to the client.

Services Exposed:
* `/orders`
* `/auctions`
* `/exec`
* `/debug`

Our production server sends transactions using [Infura](https://infura.io).

#### Ethereum Smart Contracts

Both the client and server interact with smart contracts using the [Truffle](http://truffleframework.com/) framework. The smart contracts are written in Solidity and migrated to the blockchain using Truffle tools.

Smart Contract Suite:
* `FutureFactory.sol`
  * create_future()
  * futures()
* `Future.sol`
  * add_trades()
  * deposit()
  * withdraw()
* `EVRToken.sol`
  * balanceOf()
  * approve()
  * transferFrom()

## Build

There are **Client Build**, **Server Build**, and **Smart Contract Build & Deploy** steps to both our dev and production build process. We use [Babel](https://babeljs.io/) and [webpack](https://webpack.github.io/) to compile and package our client and server for release.

The sections below are in the order you should follow if you're interested in setting up a build environment.

#### Install Dependencies
First, install all node dependencies (from our package.json) by running:

```
$ npm install
```

##### MySQL Installation
###### If you don't have mysql installed locally, run the following:

```
$ brew install mysql
$ mysqladmin -u root root
$ mysql -uroot -p -e "create database evermarkets"
```

###### If you already have mysql:

* Edit database information in /config/default.js. to point to your instance. Requires MySQL 5.7+.
* ```create database evermarkets``` to create initial database (in mysql terminal).
* Initial server start will create and fill tables with sample data.
* Ports necessary to run: 8080 (server), 3030 (client), 3306 (db or socket file).

##### MetaMask Installation

Our client web application requires MetaMask to interact with the blockchain and sign transactions to deposit and withdraw collateral.  You will need to import accounts into MetaMask that represent the TestRPC or Rinkeby accounts used for our demo. You can get the private keys for the TestRPC accounts from the TestRPC window itself (they end in 1001, 1002, etc.).

#### Smart Contract Build & Deploy

The contracts **must** be compiled and migrated *before* building the client and server applications as those processes depend on JSON wrappers created by Truffle during this process.

Fun the following to compile your .sol files into JSON contract wrappers.

```
$ truffle compile
```

Next, if you will be deploying to dev, run the following command to start TestRPC and migrate the contracts automatically:

```
$ npm run testrpc:dev
```

In **production only**, you'll need to migrate contracts to Rinkeby yourself (if they have changed). You can do this by running the following:

```
$ truffle migrate --network rinkeby --reset
```

##### How does our app find our deployed contracts?
The `truffle compile` step creates a /build/contracts folder with JSON wrappers for your contracts. Subsequent `truffle migrate` commands fill the "networks" section of those JSON files with pointers to the contract's deployed address. When you deploy the client and server, these JSON files are deployed along with it so the application knows where to find our FutureFactory, for example.

You can extract the deployed network information from these JSON wrappers by running the following:

```
$ npm run extractnetworks
```

This will update the networks.json file with the deployed address of each contract on each network.

You can inject addresses from networks.json into your JSON wrappers (you will need to have run `npm run compile` first) by running the following:

```
$ npm run injectnetworks
```

You can see a summary of all deployed contracts and their addresses across networks by running the following:

```
$ npm run networks
```

Thanks to [Gnosis](https://github.com/gnosis/gnosis-contracts) for this idea.

#### Client Build
To build and host the client-side application in dev, run:
```
$ npm run build:devserver
```

This will host the client at http://localhost:3030. The webpack process will stay running to automatically deploy changes to your running browsers as soon as you save client-side files. This greatly speeds up the development process.

In **production only**, you will build and package the client and server together in one package by running:
```
$ npm run build
```

#### Server Build
To start the server in dev, run:
```
$ npm run start:devserver
```

To package the client and server for release, see the "Client Build" section above. The client and server are packaged together in a single build command.

You can refresh our demo environment (http://demo.evermarkets.com) by running the following command. If you have modified the smart contracts, make sure to run the `truffle migrate ...` and `npm run build` steps above, first. After migration is complete, be sure to run `npm run extractnetworks` and commit the changes to the `networks.json` file so the new contract addresses are not lost.
```
$ npm run deploy
```

## Operations

Our demo environment is comprised of the following:
* ElasticBeanstalk deployment (http://demo.evermarkets.com).
* MySQL running on an EC2 machine.
* Private keys for Rinkeby testnet users.

#### ElasticBeanstalk

You will need to install the `eb` CLI to push / rollback deployments to http://demo.evermarkets.com.

#### Demo Scripts

There are cron scripts running on an EC2 machine to support the creation, settlement, and trading of daily S&P futures in our Rinkeby demo environment. These scripts do the following:
* Settle / Expire / Create daily S&P futures (ES).
* Create / Update orders from the system account for any active ES daily contracts.
* Call auctions for any active futures with a cross.

## Debugging

#### Truffle Console

It can be useful to investigate blockchain issues using the truffle console which you can access like this:
```
$ truffle console --network rinkeby
```

Then, you can run code like this to access our contracts on the chain, for example:

```
FutureFactory.deployed().then(x => ff = x);
ff.futures('ESM2018').then(x => es_addr = x);
Future.at(es_addr).then(x => es = x);
es.trader_qty('0x1dec83cde509c68cb51eb91edc58e53582113233');
```

#### Smart Contract Logging

You can run the following to connect to our ESM2018 contract and display the log messages written to it (on either network):
```
$ truffle exec debug/contract_log.js
```

#### Order Monkey

You can generate test orders around the current indicative price by running:
```
$ truffle exec debug/order_monkey.js
```

This only works in the devserver environment.

#### MetaMask errors in local dev

If the app shell loads but stays stuck on the loading spinner, and the console has an error like this:

```
Invalid JSON RPC response: {\"id\":110,\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32603,\"message\":\"\"}}"
```

Run the following command to correct it:

```
$ npm run prep_es
```

After doing this you'll have to stop the devserver, drop and re-create the `evermarkets` database, and start the devserver again.
