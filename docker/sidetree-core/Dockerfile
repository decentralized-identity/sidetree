FROM node:10-slim


# Installation Dependencies
RUN apt-get update && \
    apt-get install -y \
    g++ \
    make \
    python

RUN wget https://github.com/Yelp/dumb-init/releases/download/v1.2.2/dumb-init_1.2.2_amd64.deb
RUN dpkg -i dumb-init_*.deb

WORKDIR /app/sidetree-core

COPY ./src/core* ./src/
COPY ./lib ./lib
COPY ./*.json ./
COPY ./docker/sidetree-core ./

# Setup Node
RUN npm config set package-lock false && \
    npm install && \
    npm run build

# Remove devDependencies
RUN npm prune --production

# Install json to replace config via env variables.
RUN npm install json -g

# Purge Dependencies
RUN apt-get purge -y \
  g++ make python gcc && \
  apt-get autoclean && \
  apt-get autoremove -y

RUN rm -rf \
  /dumb-init_*.deb \
  /root/.npm \
  /root/.node-gyp \
  /tmp/* \
  /var/lib/apt/lists/*

# Runtime Things.
ENV SIDETREE_CORE_DEV_MODE true
ENV SIDETREE_CORE_PORT 3000
ENV DID_METHOD_NAME "did:sidetree:"
ENV CONTENT_ADDRESSABLE_STORE_SERVICE_URI "http://127.0.0.1:3001/v1.0"
ENV BLOCKCHAIN_SERVICE_URI "http://127.0.0.1:3002"
ENV BATCHING_INTERVAL_IN_SECONDS 600
ENV OBSERVING_INTERVAL_IN_SECONDS 60
ENV MAX_CONCURRENT_DOWNLOADS 20
ENV MONGODB_CONNECTION_STRING "mongodb://root:detault@mongo:27017/"


EXPOSE 3000

#HEALTHCHECK --interval=5s --timeout=5s --retries=10 CMD curl -f http://localhost:3000/insight/

ENTRYPOINT ["/usr/bin/dumb-init", "--", "./sidetree-core-entrypoint.sh"]
