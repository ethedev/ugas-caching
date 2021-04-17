const mongoose = require("mongoose");
const Web3 = require("web3");
const EMPContract = require("../abi/emp.json");
const { BigQuery } = require("@google-cloud/bigquery");
const highland = require("highland");
const moment = require("moment");
const fetch = require("node-fetch");
const BigNumber = require("bignumber.js");

const GasMedian = require("../models/median");
const Twap = require("../models/twap");
const Index = require("../models/indexValue");
const TestingUniPriceFunctions = require("../price-feed/CreateNewUni");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const client = new BigQuery();

const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.URI}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const assetURI =
  "https://raw.githubusercontent.com/yam-finance/degenerative/master/protocol/assets.json";
const INFURA_URL = `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`;
const web3 = new Web3(INFURA_URL);

mongoose
  .connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("Connected to db");
  })
  .catch((err) => {
    console.log(err);
  });

const createMedian = async (req, res, next) => {
  const medianValue = await runQuery();
  const currentTime = new Date();

  const createdMedian = new GasMedian({
    timestamp: currentTime,
    price: medianValue[1].toString(),
  });

  await createdMedian.save();
  // res.json(result);
};

const getIndexFromSpreadsheet = async (req, res, next) => {
  const indexValue = await fetchIndex();

  const fetchedIndex = new Index({
    timestamp: indexValue[0],
    price: indexValue[1].toString(),
  });

  await fetchedIndex.save();
  // res.json(result);
};

async function submitQuery(query) {
  // returns a node read stream
  const stream = await client.createQueryStream({ query });
  // highland wraps a stream and adds utilities simlar to lodash
  // https://caolan.github.io/highland/
  return (
    highland(stream)
      // from here you can map or reduce or whatever you need for down stream processing
      // we are just going to "collect" stream into an array for display
      .collect()
      // emit the stream as a promise when the stream ends
      // this is the start of a data pipeline so you can imagine
      // this could also "pipe" into some other processing pipeline or write to a file
      .toPromise(Promise)
  );
}

function buildQuery(formattedCurrentTime, formattedEarlierTimeBound) {
  let query;

  query = `
        DECLARE halfway int64;
        DECLARE block_count int64;
        DECLARE max_block int64;

        -- Querying for the amount of blocks in the preset time range. This will allow block_count to be compared against a given minimum block amount.
        SET (block_count, max_block) = (SELECT AS STRUCT (MAX(number) - MIN(number)), MAX(number) FROM \`bigquery-public-data.crypto_ethereum.blocks\` 
        WHERE timestamp BETWEEN TIMESTAMP('${formattedEarlierTimeBound}', 'UTC') AND TIMESTAMP('${formattedCurrentTime}', 'UTC'));

        CREATE TEMP TABLE cum_gas (
          gas_price int64,
          cum_sum int64
        );

        -- If the minimum threshold of blocks is met, query on a time range
        IF block_count >= 134400 THEN
        INSERT INTO cum_gas (
          SELECT
            gas_price,
            SUM(gas_used) OVER (ORDER BY gas_price) AS cum_sum
          FROM (
            SELECT
              gas_price,
              SUM(receipt_gas_used) AS gas_used
            FROM
              \`bigquery-public-data.crypto_ethereum.transactions\`
            WHERE block_timestamp 
            BETWEEN TIMESTAMP('${formattedEarlierTimeBound}', 'UTC')
            AND TIMESTAMP('${formattedCurrentTime}', 'UTC')  
            GROUP BY
              gas_price));
        ELSE -- If a minimum threshold of blocks is not met, query for the minimum amount of blocks
        INSERT INTO cum_gas (
          SELECT
            gas_price,
            SUM(gas_used) OVER (ORDER BY gas_price) AS cum_sum
          FROM (
            SELECT
              gas_price,
              SUM(receipt_gas_used) AS gas_used
            FROM
              \`bigquery-public-data.crypto_ethereum.transactions\`
            WHERE block_number 
            BETWEEN (max_block - 134400)
            AND max_block
            GROUP BY
              gas_price));
        END IF;

        SET halfway = (SELECT DIV(MAX(cum_sum),2) FROM cum_gas);

        SELECT cum_sum, gas_price FROM cum_gas WHERE cum_sum > halfway ORDER BY gas_price LIMIT 1;
        `;

  return query;
}

async function formatCurrentTime() {
  const currentTime = new Date();
  let formattedCurrentTime = moment(currentTime)
    .subtract(5, "minutes")
    .utc()
    .format(this.dateConversionString);

  let earlierTimeBound = new Date();
  let formattedEarlierTimeBound = moment(earlierTimeBound)
    .subtract(2592300, "seconds")
    .utc()
    .format(this.dateConversionString);

  formattedEarlierTimeBound = moment(formattedEarlierTimeBound)
    .utc()
    .format("YYYY-MM-DD HH:mm:ss");
  formattedCurrentTime = moment(formattedCurrentTime)
    .utc()
    .format("YYYY-MM-DD HH:mm:ss");

  return { formattedCurrentTime, formattedEarlierTimeBound };
}

async function runQuery() {
  const {
    formattedCurrentTime,
    formattedEarlierTimeBound,
  } = await formatCurrentTime();

  let priceResponse;

  try {
    priceResponse = await submitQuery(
      buildQuery(formattedCurrentTime, formattedEarlierTimeBound)
    );
    priceResponse = priceResponse[0].gas_price;
  } catch (error) {
    console.error(error);
  }

  return [formattedCurrentTime, priceResponse];
}

async function fetchIndex() {
  const currentTime = new Date();

  let priceResponse;

  try {
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
    await doc.useApiKey(process.env.GAPI_KEY);
    await doc.loadInfo();

    const sheet = await doc.sheetsByIndex[0];
    await sheet.loadCells("M50");
    const targetCell = await sheet.getCellByA1("M50");
    priceResponse = targetCell.value;
  } catch (error) {
    console.error(error);
  }

  return [currentTime, priceResponse];
}

const getMedians = async (req, res, next) => {
  const medians = await GasMedian.find({}, { _id: 0 })
    .select("timestamp price")
    .exec();
  let theResults = [];
  for (let i = 0; i < medians.length; i++) {
    // if (i % 2 == 0) {
    theResults.push(medians[i]);
    // }
  }
  console.log("theResults", theResults);
  res.json(theResults);
};

const twapCleaner = async () => {
  const response = await fetch(assetURI);
  const data = await response.json();

  for (const assets in data) {
    const assetDetails = data[assets];
    for (const asset in assetDetails) {
      const empContract = new web3.eth.Contract(
        EMPContract.abi,
        assetDetails[asset].emp.address
      );
      const currentContractTime = await empContract.methods
        .getCurrentTime()
        .call();
      const expirationTimestamp = await empContract.methods
        .expirationTimestamp()
        .call();
      const isExpired =
        Number(currentContractTime) >= Number(expirationTimestamp);
      var bulk = await Twap.initializeUnorderedBulkOp();

      if (isExpired) {
        await bulk
          .find({ address: assetDetails[asset].token.address })
          .remove()
          .exec();
      }
    }
  }
};

const getIndex = async (req, res, next) => {
  const index = await Index.find({}, { _id: 0 })
    .select("timestamp price")
    .exec();
  let theResults = [];
  for (let i = 0; i < index.length; i++) {
    // if (i % 2 == 0) {
    theResults.push(index[i]);
    // }
  }

  console.log("theResults", theResults);
  res.json(theResults);
};

const getDailyIndex = async (req, res, next) => {
  let currentTime = new Date();
  let earlierTime = currentTime.getDate() - 30;

  const index = await Index.find(
    {},
    { _id: 0, timestamp: { $gte: earlierTime, $lte: currentTime } }
  )
    .select("timestamp price")
    .exec();
  let theResults = [];
  for (let i = 0; i < index.length; i++) {
    // if (i % 2 == 0) {
    let obj = {};
    
    obj["timestamp"] = index[i]["timestamp"].getTime() / 1000;
    obj["price"] = index[i]["price"];

    theResults.push(obj);
    // }
  }

  console.log("theResults", theResults);
  res.json(theResults);
};

const getLatestIndex = async (req, res, next) => {
  const index = await Index.find({}, { _id: 0 })
    .select("timestamp price")
    .exec();
  res.json(index[index.length - 1] || {});
};

const getMedianRange = async (req, res, next) => {
  let currentTime = new Date();
  let earlierTime = currentTime.getDate() - 30;

  const medians = await GasMedian.find({
    timestamp: { $gte: earlierTime, $lte: currentTime },
  })
    .select("timestamp price")
    .exec();

  let theResults = [];
  for (let i = 0; i < medians.length; i++) {
    //   if (i % 2 == 0) {
    theResults.push(medians[i]);
    //   }
  }
  res.json(theResults);
};

const getLatestMedian = async (req, res, next) => {
  const medians = await GasMedian.find({}, { _id: 0 })
    .select("timestamp price")
    .exec();

  res.json(medians[medians.length - 1]);
};

const getTwaps = async (req, res, next) => {
  const twaps = await Twap.find({}, { _id: 0 })
    .select("timestamp asset address price collateral roundingDecimals")
    .exec();
  let theResults = [];
  for (let i = 0; i < twaps.length; i++) {
    // if (i % 2 == 0) {
    theResults.push(twaps[i]);
    // }
  }
  res.json(theResults);
};

const getTwapsWithParam = async (req, res, next) => {
  const passedAddress = req.params.address;
  const twaps = await Twap.find({ address: { $eq: passedAddress } }, { _id: 0 })
    .select("timestamp asset address price collateral roundingDecimals")
    .exec();
  let theResults = [];
  for (let i = 0; i < twaps.length; i++) {
    // if (i % 2 == 0) {
    theResults.push(twaps[i]);
    // }
  }

  res.json(theResults);
};

const getLatestTwapWithParam = async (req, res, next) => {
  const passedAddress = req.params.address;
  const twaps = await Twap.find({ address: { $eq: passedAddress } }, { _id: 0 })
    .select("timestamp asset address price collateral roundingDecimals")
    .exec();
  res.json(twaps[twaps.length - 1] || {});
};

const getTwapRange = async (req, res, next) => {
  let currentTime = new Date();
  let earlierTime = currentTime.getDate() - 30;

  const twaps = await Twap.find(
    { timestamp: { $gte: earlierTime, $lte: currentTime } },
    { _id: 0 }
  )
    .select("timestamp price")
    .exec();

  let theResults = [];
  for (let i = 0; i < twaps.length; i++) {
    //   if (i % 2 == 0) {
    theResults.push(twaps[i]);
    //   }
  }
  res.json(theResults);
};

const getLatestTwap = async (req, res, next) => {
  const twaps = await Twap.find({}, { _id: 0 })
    .select("timestamp price")
    .exec();
  res.json(twaps[twaps.length - 1] || {});
};

const twapCreation = async (req, res, next) => {
  let priceFeed;
  let roundingDecimals;
  const assetPairArray = [];
  const response = await fetch(assetURI);
  const data = await response.json();

  for (const assets in data) {
    const assetDetails = data[assets];
    for (const asset in assetDetails) {
      assetPairArray.push({
        key: `${assets.toUpperCase()}-${assetDetails[asset].cycle}${
          assetDetails[asset].year
        }`,
        value: assetDetails[asset].pool.address,
        collateral: assetDetails[asset].collateral,
      });
    }
  }

  for (const assetPairAddress in assetPairArray) {
    try {
      priceFeed = await TestingUniPriceFunctions.usePriceFeed(
        assetPairArray[assetPairAddress].value
      );
    } catch (err) {
      console.log(err);
    }
    let price = new BigNumber(priceFeed.getCurrentPrice());
    let time = priceFeed.lastUpdateTime;

    if (
      assetPairArray[assetPairAddress].value ==
      "0xedf187890af846bd59f560827ebd2091c49b75df"
    ) {
      price = new BigNumber(1).dividedBy(price);
      price = price.multipliedBy(new BigNumber(10).pow(18)).toFixed();
      roundingDecimals = 2;
    } else {
      price = price.multipliedBy(new BigNumber(10).pow(-18)).toFixed();
      roundingDecimals = 4;
    }

    const createdTwap = new Twap({
      asset: assetPairArray[assetPairAddress].key,
      address: assetPairArray[assetPairAddress].value,
      timestamp: time,
      price: price.toString(),
      collateral: assetPairArray[assetPairAddress].collateral,
      roundingDecimals: roundingDecimals,
    });
    await createdTwap.save();
  }
};

exports.createMedian = createMedian;
exports.getIndexFromSpreadsheet = getIndexFromSpreadsheet;
exports.getMedians = getMedians;
exports.getIndex = getIndex;
exports.getDailyIndex = getDailyIndex;
exports.getLatestIndex = getLatestIndex;
exports.getTwaps = getTwaps;
exports.twapCleaner = twapCleaner;
exports.getTwapsWithParam = getTwapsWithParam;
exports.getLatestMedian = getLatestMedian;
exports.twapCreation = twapCreation;
exports.getLatestTwap = getLatestTwap;
exports.getLatestTwapWithParam = getLatestTwapWithParam;
exports.getTwapRange = getTwapRange;
exports.getMedianRange = getMedianRange;
