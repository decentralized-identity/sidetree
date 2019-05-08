#!/usr/bin/env bash

sed -i -- "s/\"testnet\"/\"${BITCOIN_NETWORK}\"/g" ./bitcore-node.json
./node_modules/.bin/bitcore-node start
