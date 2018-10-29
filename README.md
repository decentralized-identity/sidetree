# sidetree-bitcoin
Blockchain-specific code for the Sidetree-based DID Method implementation on Bitcoin

# Getting started
Our reference implementation of the blockchain service is based on bitcored. Here is the list of instructions to deploy Sidetree's blockchain service on your node. 
  - Install a Bitcored full node using instructions at [this link]([https://bitcore.io/guides/full-node]). Suppose that we install this to $(BITCORE_DIR) on $(NODE_IP). Verifying that the bitcored installation was successful by pointing the browser to: http://$(NODE_IP):3001/insight/
  - Install the SidetreeRooterService using the following instructions:
    cd $(BITCORE_DIR)/node_modules
    ln -s $(SIDETREE_BITCOIN_REPO)/src/bitcored-services/sidetree-rooter
    add side-tree rooter to the services array in $BITCORE_DIR/bitcore-node.json
  - Start bitcored daemon by running bitcored inside $(BITCORE_DIR)
