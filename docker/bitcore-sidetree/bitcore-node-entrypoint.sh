#!/usr/bin/env bash

json -I -f bitcore-node.json -e "this.network=\"${BITCOIN_NETWORK}\""
json -I -f ./node_modules/sidetree/config.json -e "this.privateKeyWIF=\"${BITCOIN_PRIVATE_KEY_WIF}\"; this.fees=\"${BITCOIN_FEE}\""

./node_modules/.bin/bitcore-node start
