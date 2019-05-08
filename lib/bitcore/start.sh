#!/bin/bash

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Get data directory ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
echo -n "Directory for blockchain data: "
read dataDirectory
if [[ ! -d $dataDirectory ]]; then 
    echo "$dataDirectory is not a directory"
    exit 1
fi
if [[ ! -w $dataDirectory ]]; then
    echo "Cannot write in $dataDirectory"
    exit 1
fi

echo "Installing prerequisite software"
# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Install Node v.10 ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
sudo snap install node --classic --channel=10
if [ $? != 0 ]; then
    echo "Snapcraft failed, using apt..."
    curl -sL https://deb.nodesource.com/setup_11.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Install build essentials and git ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
sudo apt-get install gcc g++ make git -y

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Get MongoDB Credentials ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
echo -n "MongoDB URL (\"\" to install mongodb locally): "
read mongoUrl
mongoUsername=""
mongoPassword=""
mongoPort="27017"
mongoDatabase="bitcore"
if [[ ! -n "$mongoUrl" ]]; then
    # ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
    # ┆ Install MongoDB ┆
    # └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
    bionic=$(lsb_release -dc | grep Ubuntu 18)
    if [[ ! -n "$bionic" ]]; then
        echo "This script currently only supports Ubuntu 18.04 Bionic for automatically installing MongoDB"
        exit 1
    fi

    echo "Installing mongoDB locally"
    sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 9DA31620334BD75D9DCB49F368818C72E52529D4
    echo "deb [ arch=amd64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.0.list
    sudo apt-get update
    sudo apt-get install -y mongodb-org
    sudo service mongod start
else 
    echo -n "MongoDB Port (Default 27017): "
    read mongoPort
    if [[ ! -n "$mongoPort" ]]; then 
        mongoPort="27017"
    fi
    echo -n "MongoDB Database: "
    read mongoDatabase
    echo -n "MongoDB Username: "
    read mongoUsername
    echo -n "MongoDB Password: "
    read mongoPassword

    which mongo
    if [ $? != 0]; then
        mongo --host $mongoUrl --port $mongoPort --username $mongoUsername --password $mongoPassword --eval 'db' $mongoDatabase
        if [ $? != 0 ]; then 
            echo "MongoDB connection information incorrect"
            exit 1
        fi
    fi
fi

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Install bcoin as a peer2peer peer ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
cd $dataDirectory
git clone git://github.com/bcoin-org/bcoin.git
cd bcoin
npm install
echo "
network: testnet
prefix: $dataDirectory/data/bcoin/
host: 127.0.0.1
port: 18332
workers-size: 1
" > $dataDirectory/data/bcoin/bcoin.conf
./bin/bcoin --config $dataDirectory/data/bcoin/bcoin.conf --daemon

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Install bitcore ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
cd $dataDirectory
git clone https://github.com/bitpay/bitcore.git
cd bitcore
npm install

echo "{
  \"bitcoreNode\": {
    \"chains\": {
      \"BTC\": {
        \"testnet\": {
          \"chainSource\": \"p2p\",
          \"trustedPeers\": [
            {
              \"host\": \"127.0.0.1\",
              \"port\": 18332
            }
          ]
        }
      }
    },
    \"port\": 3000,
    \"dbHost\": \"$mongoUrl\",
    \"dbPort\": \"$mongoPort\",
    \"dbName\": \"$mongoDatabase\",
    \"dbUser\": \"$mongoUsername\",
    \"dbPass\": \"$mongoPassword\"
  }
}" > $dataDirectory/data/bitcore.config.json

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Set the bitcore environment variable to use the configuration file ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
export BITCORE_CONFIG_PATH="$dataDirectory/data/bitcore.config.json"

# ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
# ┆ Run bitcore node ┆
# └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
npm run node