# sidetree-bitcoin

Blockchain-specific code for the Sidetree-based DID Method implementation on Bitcoin

## Getting started

Our reference implementation of the blockchain service is based on bitcored. Here is the list of instructions to deploy Sidetree's blockchain service on your node.

- Install a Bitcored full node using instructions at [this link](https://bitcore.io/guides/full-node). We reproduce their instructions below since we run bitcored with node v9 rather than v4:

  - Install node version manager (NVM) by following instructions at [this link](https://github.com/creationix/nvm#install-script).
  - Install node v9 by using: 
     ```bash 
     nvm install v9
     ```
  - Install ZeroMQ and Tools. On GNU/Debian distributions, do:
    ```bash
    apt-get install libzmq3-dev build-essential
    ```
  - Install bitcore:
    ```bash
    npm install -g bitcore
    ```
  - Start bitcore (ignore --testnet for mainnet):
    ```bash
    bitcore create mynode --testnet
    ```

- Clone this repository to folder `$(SIDETREE_BITCOIN_REPO)` and run the following:
    ```bash
      cd $(SIDETREE_BITCOIN_REPO)/src/bitcored-services/sidetree
      npm install bitcore-lib
    ```
- Add a private key from a Bitcoin wallet to `$(SIDETREE_BITCOIN_REPO)/src/bitcored-services/sidetree/config.json`

- Suppose that we install bitcored to `$(BITCORE_DIR)` on `$(NODE_IP)`, use the following instructions to add Sidetree's blockchain service:

   ```bash
      cd $(BITCORE_DIR)/node_modules
      ln -s $(SIDETREE_BITCOIN_REPO)/src/bitcored-services/sidetree
      add the string "sidetree" to the services array in $BITCORE_DIR/bitcore-node.json
    ```

- Install insight UI:
  ```bash
  bitcore install insight-api insight-ui
  ```

- Start the `bitcored` daemon by running:

   ```bash
    cd $(BITCORE_DIR)
    bitcored
   ```

- Verify that the bitcored installation was successful by pointing the browser to: `http://$(NODE_IP):3001/insight/`
