FROM node:lts

COPY ./dist /app/dist/
COPY ./node_modules /app/node_modules
COPY ./package.json /app
COPY ./package-lock.json /app
WORKDIR /app

EXPOSE 3002
CMD npm start