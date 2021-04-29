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
  const currentTime = new Date().toISOString();

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

const getIndexFromSpreadsheetWithCycle = async (cycleArray) => {
  for (let i = 0; i < cycleArray.length; i++) {
    const indexValue = await fetchIndex(i, cycleArray[i]);

    // console.log(indexValue)

    const fetchedIndex = new Index({
      cycle: indexValue[0],
      timestamp: indexValue[1],
      price: indexValue[2].toString(),
    });

    await fetchedIndex.save();
    // res.json(result);

  }
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
  const currentTime = new Date().toISOString();
  let formattedCurrentTime = moment(currentTime)
    .subtract(5, "minutes")
    .utc()
    .format(this.dateConversionString);

  let earlierTimeBound = new Date().toISOString();
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

async function fetchIndex(_index, _cycle) {
  const currentTime = new Date().toISOString();

  let priceResponse;

  try {
    const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
    await doc.useApiKey(process.env.GAPI_KEY);
    await doc.loadInfo();

    const sheet = await doc.sheetsByIndex[_index];
    await sheet.loadCells("M50");
    const targetCell = await sheet.getCellByA1("M50");
    priceResponse = targetCell.value;
  } catch (error) {
    console.error(error);
  }

  return [_cycle, currentTime, priceResponse];
}

const getMedians = async (req, res, next) => {
  const medians = await GasMedian.find({}, { _id: 0 })
    .select("timestamp price")
    .exec();
  let theResults = [];
  for (let i = 0; i < medians.length; i++) {
    // if (i % 2 == 0) {
    let obj = {};
    
    obj["timestampDate"] = medians[i]["timestamp"];
    obj["timestamp"] = (medians[i]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = medians[i]["price"];
  
    theResults.push(obj);
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
  const index = await Index.find()
    .select("timestamp price")
    .exec();
  let theResults = [];
  for (let i = 0; i < index.length; i++) {
    // if (i % 2 == 0) {
    let obj = {};
    
    obj["timestampDate"] = index[i]["timestamp"];
    obj["timestamp"] = (index[i]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = index[i]["price"];
  
    theResults.push(obj);
    // }
  }

  console.log("theResults", theResults);
  res.json(theResults);
};

const getIndexWithParam = async (req, res, next) => {
  const passedCycle = req.params.cycle;
  const index = await Index.find({ cycle: { $eq: passedCycle } })
    .select("cycle timestamp price")
    .exec();
  let theResults = [];
  for (let i = 0; i < index.length; i++) {
    // if (i % 2 == 0) {
    let obj = {};
    
    obj["cycle"] = index[i]["cycle"];
    obj["timestampDate"] = index[i]["timestamp"];
    obj["timestamp"] = (index[i]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = index[i]["price"];
  
    theResults.push(obj);
    // }
  }

  console.log("theResults", theResults);
  res.json(theResults);
};

const getDailyIndex = async (req, res, next) => {
  let currentTime = new Date();
  let earlierTime = new Date(currentTime.getTime() - 2629743000);

  const index = await Index.find({ timestamp: { $gte: earlierTime.toISOString(), $lte: currentTime.toISOString() } })
    .select("timestamp price")
    .exec();
  let theResults = [];
  for (let i = 0; i < index.length; i++) {
    // if (i % 2 == 0) {
    let obj = {};
    
    obj["timestampDate"] = index[i]["timestamp"];
    obj["timestamp"] = (index[i]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = index[i]["price"];

    theResults.push(obj);
    // }
  }

  let finalResults = [];
  let dayCount  = 0;

  for (let i = theResults.length - 1; i >= 0 && dayCount < 30; i--) {
    if (theResults[i]["timestampDate"].toISOString().includes("T01:00:00")) {
      finalResults.unshift(theResults[i]);
      dayCount += 1;
    }
  }

  console.log("theResults", finalResults);
  res.json(finalResults);
};

const getDailyIndexWithParam = async (req, res, next) => {
  const passedCycle = req.params.cycle;
  let currentTime = new Date();
  let earlierTime = new Date(currentTime.getTime() - 2629743000);

  const index = await Index.find({ cycle: { $eq: passedCycle }, timestamp: { $gte: earlierTime.toISOString(), $lte: currentTime.toISOString() } })
    .select("cycle timestamp price")
    .exec();
  let theResults = [];
  for (let i = 0; i < index.length; i++) {
    // if (i % 2 == 0) {
    let obj = {};
    
    obj["cycle"] = index[i]["cycle"];
    obj["timestampDate"] = index[i]["timestamp"];
    obj["timestamp"] = (index[i]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = index[i]["price"];

    theResults.push(obj);
    // }
  }

  let finalResults = [];
  let dayCount  = 0;

  for (let i = theResults.length - 1; i >= 0 && dayCount < 30; i--) {
    if (theResults[i]["timestampDate"].toISOString().includes("T01:00:00")) {
      finalResults.unshift(theResults[i]);
      dayCount += 1;
    }
  }

  console.log("theResults", finalResults);
  res.json(finalResults);
};

const getLatestIndex = async (req, res, next) => {
  const index = await Index.find()
    .select("timestamp price")
    .exec();
  
  let obj = {};
    
  obj["timestampDate"] = index[index.length - 1]["timestamp"];
  obj["timestamp"] = (index[index.length - 1]["timestamp"].getTime() / 1000).toFixed();
  obj["price"] = index[index.length - 1]["price"];

  res.json(obj || {});
};

const getLatestIndexWithParam = async (req, res, next) => {
  const passedCycle = req.params.cycle;

  const index = await Index.find({ cycle: { $eq: passedCycle } })
  .select("cycle timestamp price")
  .exec();

  let obj = {};
    
  obj["cycle"] = index[index.length - 1]["cycle"];
  obj["timestampDate"] = index[index.length - 1]["timestamp"];
  obj["timestamp"] = (index[index.length - 1]["timestamp"].getTime() / 1000).toFixed();
  obj["price"] = index[index.length - 1]["price"];

  console.log(obj)

  res.json(obj || {});
}

const getMedianRange = async (req, res, next) => {
  let currentTime = new Date();
  let earlierTime = new Date(currentTime.getTime() - 2629743000);

  const medians = await GasMedian.find({
    timestamp: { $gte: earlierTime.toISOString(), $lte: currentTime.toISOString() },
  })
    .select("timestamp price")
    .exec();

  let theResults = [];
  for (let i = 0; i < medians.length; i++) {
    //   if (i % 2 == 0) {
    let obj = {};
    
    obj["timestampDate"] = medians[i]["timestamp"];
    obj["timestamp"] = (medians[i]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = medians[i]["price"];
  
    theResults.push(obj);
    //   }
  }
  res.json(theResults);
};

const getLatestMedian = async (req, res, next) => {
  const medians = await GasMedian.find({}, { _id: 0 })
    .select("timestamp price")
    .exec();

    let obj = {};

    obj["timestampDate"] = medians[medians.length - 1]["timestamp"];
    obj["timestamp"] = (medians[medians.length - 1]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = medians[medians.length - 1]["price"];

  res.json(obj);
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

    let obj = {};
    
    obj["asset"] = twaps[i]["asset"];
    obj["address"] = twaps[i]["address"];
    obj["timestampDate"] = twaps[i]["timestamp"];
    obj["timestamp"] = (twaps[i]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = twaps[i]["price"];
    obj["collateral"] = twaps[i]["collateral"];
    obj["roundingDecimals"] = twaps[i]["roundingDecimals"];
    
    theResults.push(obj);
    // }
  }

  res.json(theResults);
};

const getLatestTwapWithParam = async (req, res, next) => {
  const passedAddress = req.params.address;
  const twaps = await Twap.find({ address: { $eq: passedAddress } }, { _id: 0 })
    .select("timestamp asset address price collateral roundingDecimals")
    .exec();

  let obj = {};
  
  obj["asset"] = twaps[twaps.length - 1]["asset"];
  obj["address"] = twaps[twaps.length - 1]["address"];
  obj["timestampDate"] = twaps[twaps.length - 1]["timestamp"];
  obj["timestamp"] = (twaps[twaps.length - 1]["timestamp"].getTime() / 1000).toFixed();
  obj["price"] = twaps[twaps.length - 1]["price"];
  obj["collateral"] = twaps[twaps.length - 1]["collateral"];
  obj["roundingDecimals"] = twaps[twaps.length - 1]["roundingDecimals"];

  res.json(obj || {});
};

const getTwapRange = async (req, res, next) => {
  let currentTime = new Date();
  let earlierTime = new Date(currentTime.getTime() - 2629743000);

  const twaps = await Twap.find(
    { timestamp: { $gte: earlierTime.toISOString(), $lte: currentTime.toISOString() } },
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
    let time = new Date(priceFeed.lastUpdateTime * 1000).toISOString()

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
exports.getIndexFromSpreadsheetWithCycle = getIndexFromSpreadsheetWithCycle;
exports.getMedians = getMedians;
exports.getIndex = getIndex;
exports.getIndexWithParam = getIndexWithParam;
exports.getDailyIndex = getDailyIndex;
exports.getDailyIndexWithParam = getDailyIndexWithParam;
exports.getLatestIndex = getLatestIndex;
exports.getLatestIndexWithParam = getLatestIndexWithParam;
exports.getTwaps = getTwaps;
exports.twapCleaner = twapCleaner;
exports.getTwapsWithParam = getTwapsWithParam;
exports.getLatestMedian = getLatestMedian;
exports.twapCreation = twapCreation;
exports.getLatestTwap = getLatestTwap;
exports.getLatestTwapWithParam = getLatestTwapWithParam;
exports.getTwapRange = getTwapRange;
exports.getMedianRange = getMedianRange;
