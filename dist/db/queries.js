"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNISWAP_PRICE_PER_ETH = exports.UNISWAP_DAILY_PAIR_DATA = exports.UNISWAP_DAILY_PRICE_QUERY2 = exports.UNISWAP_DAILY_PRICE_QUERY = exports.UNISWAP_MARKET_DATA_QUERY = exports.SUSHISWAP_ENDPOINT = exports.UNISWAP_ENDPOINT = void 0;
const graphql_request_1 = require("graphql-request");
exports.UNISWAP_ENDPOINT = 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2';
exports.SUSHISWAP_ENDPOINT = 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange';
exports.UNISWAP_MARKET_DATA_QUERY = graphql_request_1.gql `
  query pair($poolAddress: Bytes!) {
    pair(id: $poolAddress) {
      reserveUSD
      token0 {
        symbol
      }
      token0Price
      token1 {
        symbol
      }
      token1Price
    }
  }
`;
exports.UNISWAP_DAILY_PRICE_QUERY = graphql_request_1.gql `
  query tokenDayDatas($tokenAddresses: [String!], $startingTime: Int!) {
    tokenDayDatas(orderBy: date, orderDirection: asc, where: { token_in: $tokenAddresses, date_gt: $startingTime }) {
      id
      date
      priceUSD
    }
  }
`;
// TODO
exports.UNISWAP_DAILY_PRICE_QUERY2 = graphql_request_1.gql `
  query tokenDayDatas($tokenAddresses: [String!], $startingTime: Int!) {
    tokenDayDatas(orderBy: date, orderDirection: asc, where: { token_in: $tokenAddresses, date_gt: $startingTime }) {
      date
      price
      priceUSD
    }
  }
`;
exports.UNISWAP_DAILY_PAIR_DATA = graphql_request_1.gql `
  query pairDayDatas($pairAddress: Bytes!, $startingTime: Int!) {
    pairDayDatas(orderBy: date, orderDirection: asc, where: { pairAddress: $pairAddress, date_gt: $startingTime }) {
      date
      token0 {
        id
      }
      token1 {
        id
      }
      reserve0
      reserve1
    }
  }
`;
exports.UNISWAP_PRICE_PER_ETH = graphql_request_1.gql `
  query token($tokenAddress: ID!) {
    token(id: $tokenAddress) {
      derivedETH
    }
  }
`;
//# sourceMappingURL=queries.js.map