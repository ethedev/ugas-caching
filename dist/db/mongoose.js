var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const mongoose = require("mongoose");
const Web3 = require("web3");
const EMPContract = require("../abi/emp.json");
const { BigQuery } = require("@google-cloud/bigquery");
const highland = require("highland");
const moment = require("moment");
const fetch = require("node-fetch");
const BigNumber = require("bignumber.js");
const { getMiningRewards, getPoolData, getUsdPrice } = require("./apr");
const Asset = require("../assets/assets.json");
const GasMedian = require("../models/median");
const Apr = require("../models/apr");
const Twap = require("../models/twap");
const Index = require("../models/indexValue");
const CollateralData = require("../assets/collateral.json");
const TestingUniPriceFunctions = require("../price-feed/CreateNewUni");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const client = new BigQuery();
const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.URI}/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const assetURI = "https://raw.githubusercontent.com/yam-finance/degenerative/master/protocol/assets.json";
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
const saveAPR = () => __awaiter(this, void 0, void 0, function* () {
    var _a;
    const currentTime = new Date().toISOString();
    for (const network in Asset) {
        if (network == "mainnet") {
            const assetCategories = Asset[network];
            for (const assetCategory in assetCategories) {
                const assetObject = assetCategories[assetCategory];
                for (const assetDetail in assetObject) {
                    const asset = assetObject[assetDetail];
                    const assetName = assetCategory + "-" + asset.cycle + asset.year;
                    const collateral = CollateralData["mainnet"][asset.collateral];
                    const collateralPriceUsd = yield getUsdPrice((_a = collateral.coingeckoId) !== null && _a !== void 0 ? _a : '');
                    const pool = yield getPoolData(asset.pool);
                    let priceUsd;
                    let pricePerPaired;
                    if (asset.collateral === pool.token0.symbol) {
                        priceUsd = pool.token0Price * collateralPriceUsd;
                        pricePerPaired = pool.token0Price;
                    }
                    else {
                        priceUsd = pool.token1Price * collateralPriceUsd;
                        pricePerPaired = pool.token1Price;
                    }
                    const aprMultiplier = yield getMiningRewards(assetName, asset, priceUsd);
                    const clientCalc = (1 / (1.5 + 1)) * aprMultiplier;
                    console.log("clientCalc", clientCalc);
                    console.log("------------------------------------");
                    const getApr = new Apr({
                        assetName: assetName.toLowerCase(),
                        aprMultiplier: aprMultiplier,
                        timestamp: currentTime,
                    });
                    yield getApr.save();
                }
            }
        }
    }
});
const getLatestAprWithParam = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const passedAsset = req.params.asset.toLowerCase();
    const apr = yield Apr.find({ assetName: { $eq: passedAsset } })
        .select("assetName aprMultiplier timestamp")
        .exec();
    let obj = {};
    obj["timestampDate"] = apr[apr.length - 1]["timestamp"];
    obj["timestamp"] = (apr[apr.length - 1]["timestamp"].getTime() / 1000).toFixed();
    obj["aprMultiplier"] = apr[apr.length - 1]["aprMultiplier"];
    obj["assetName"] = apr[apr.length - 1]["assetName"];
    res.json(obj || {});
});
const createMedian = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const medianValue = yield runQuery();
    const currentTime = new Date().toISOString();
    const createdMedian = new GasMedian({
        timestamp: currentTime,
        price: medianValue[1].toString(),
    });
    yield createdMedian.save();
    // res.json(result);
});
const getIndexFromSpreadsheet = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const indexValue = yield fetchIndex();
    const fetchedIndex = new Index({
        timestamp: indexValue[0],
        price: indexValue[1].toString(),
    });
    yield fetchedIndex.save();
    // res.json(result);
});
const getIndexFromSpreadsheetWithCycle = (cycleArray) => __awaiter(this, void 0, void 0, function* () {
    for (let i = 0; i < cycleArray.length; i++) {
        const indexValue = yield fetchIndex(i, cycleArray[i]);
        // console.log(indexValue)
        const fetchedIndex = new Index({
            cycle: indexValue[0],
            timestamp: indexValue[1],
            price: indexValue[2].toString(),
        });
        yield fetchedIndex.save();
        // res.json(result);
    }
});
function submitQuery(query) {
    return __awaiter(this, void 0, void 0, function* () {
        // returns a node read stream
        const stream = yield client.createQueryStream({ query });
        // highland wraps a stream and adds utilities simlar to lodash
        // https://caolan.github.io/highland/
        return (highland(stream)
            // from here you can map or reduce or whatever you need for down stream processing
            // we are just going to "collect" stream into an array for display
            .collect()
            // emit the stream as a promise when the stream ends
            // this is the start of a data pipeline so you can imagine
            // this could also "pipe" into some other processing pipeline or write to a file
            .toPromise(Promise));
    });
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
function formatCurrentTime() {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
function runQuery() {
    return __awaiter(this, void 0, void 0, function* () {
        const { formattedCurrentTime, formattedEarlierTimeBound, } = yield formatCurrentTime();
        let priceResponse;
        try {
            priceResponse = yield submitQuery(buildQuery(formattedCurrentTime, formattedEarlierTimeBound));
            priceResponse = priceResponse[0].gas_price;
        }
        catch (error) {
            console.error(error);
        }
        return [formattedCurrentTime, priceResponse];
    });
}
function fetchIndex(_index, _cycle) {
    return __awaiter(this, void 0, void 0, function* () {
        const currentTime = new Date().toISOString();
        let priceResponse;
        try {
            const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
            yield doc.useApiKey(process.env.GAPI_KEY);
            yield doc.loadInfo();
            const sheet = yield doc.sheetsByIndex[_index];
            yield sheet.loadCells("M50");
            const targetCell = yield sheet.getCellByA1("M50");
            priceResponse = targetCell.value;
        }
        catch (error) {
            console.error(error);
        }
        return [_cycle, currentTime, priceResponse];
    });
}
const getMedians = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const medians = yield GasMedian.find({}, { _id: 0 })
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
});
const twapCleaner = () => __awaiter(this, void 0, void 0, function* () {
    const response = yield fetch(assetURI);
    const data = yield response.json();
    for (const assets in data) {
        const assetDetails = data[assets];
        for (const asset in assetDetails) {
            const empContract = new web3.eth.Contract(EMPContract.abi, assetDetails[asset].emp.address);
            const currentContractTime = yield empContract.methods
                .getCurrentTime()
                .call();
            const expirationTimestamp = yield empContract.methods
                .expirationTimestamp()
                .call();
            const isExpired = Number(currentContractTime) >= Number(expirationTimestamp);
            var bulk = yield Twap.initializeUnorderedBulkOp();
            if (isExpired) {
                yield bulk
                    .find({ address: assetDetails[asset].token.address })
                    .remove()
                    .exec();
            }
        }
    }
});
const getIndex = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const index = yield Index.find()
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
});
const getIndexWithParam = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const passedCycle = req.params.cycle.toLowerCase();
    const index = yield Index.find({ cycle: { $eq: passedCycle } })
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
});
const getDailyIndex = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    let currentTime = new Date();
    let earlierTime = new Date(currentTime.getTime() - 2629743000);
    const index = yield Index.find({ timestamp: { $gte: earlierTime.toISOString(), $lte: currentTime.toISOString() } })
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
    let dayCount = 0;
    for (let i = theResults.length - 1; i >= 0 && dayCount < 30; i--) {
        if (theResults[i]["timestampDate"].toISOString().includes("T01:00")) {
            finalResults.unshift(theResults[i]);
            dayCount += 1;
        }
    }
    console.log("theResults", finalResults);
    res.json(finalResults);
});
const getDailyIndexWithParam = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const passedCycle = req.params.cycle.toLowerCase();
    let currentTime = new Date();
    let earlierTime = new Date(currentTime.getTime() - 2629743000);
    const index = yield Index.find({ cycle: { $eq: passedCycle }, timestamp: { $gte: earlierTime.toISOString(), $lte: currentTime.toISOString() } })
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
    let dayCount = 0;
    for (let i = theResults.length - 1; i >= 0 && dayCount < 30; i--) {
        if (theResults[i]["timestampDate"].toISOString().includes("T01:00")) {
            finalResults.unshift(theResults[i]);
            dayCount += 1;
        }
    }
    console.log("theResults", finalResults);
    res.json(finalResults);
});
const getLatestIndex = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const index = yield Index.find()
        .select("timestamp price")
        .exec();
    let obj = {};
    obj["timestampDate"] = index[index.length - 1]["timestamp"];
    obj["timestamp"] = (index[index.length - 1]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = index[index.length - 1]["price"];
    res.json(obj || {});
});
const getLatestIndexWithParam = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const passedCycle = req.params.cycle.toLowerCase();
    const index = yield Index.find({ cycle: { $eq: passedCycle } })
        .select("cycle timestamp price")
        .exec();
    let obj = {};
    obj["cycle"] = index[index.length - 1]["cycle"];
    obj["timestampDate"] = index[index.length - 1]["timestamp"];
    obj["timestamp"] = (index[index.length - 1]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = index[index.length - 1]["price"];
    res.json(obj || {});
});
const getMedianRange = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    let currentTime = new Date();
    let earlierTime = new Date(currentTime.getTime() - 2629743000);
    const medians = yield GasMedian.find({
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
});
const getLatestMedian = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const medians = yield GasMedian.find({}, { _id: 0 })
        .select("timestamp price")
        .exec();
    let obj = {};
    obj["timestampDate"] = medians[medians.length - 1]["timestamp"];
    obj["timestamp"] = (medians[medians.length - 1]["timestamp"].getTime() / 1000).toFixed();
    obj["price"] = medians[medians.length - 1]["price"];
    res.json(obj);
});
const getTwaps = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const twaps = yield Twap.find({}, { _id: 0 })
        .select("timestamp asset address price collateral roundingDecimals")
        .exec();
    let theResults = [];
    for (let i = 0; i < twaps.length; i++) {
        // if (i % 2 == 0) {
        theResults.push(twaps[i]);
        // }
    }
    res.json(theResults);
});
const getTwapsWithParam = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const passedAddress = req.params.address;
    const twaps = yield Twap.find({ address: { $eq: passedAddress } }, { _id: 0 })
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
});
const getLatestTwapWithParam = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const passedAddress = req.params.address;
    const twaps = yield Twap.find({ address: { $eq: passedAddress } }, { _id: 0 })
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
});
const getTwapRange = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    let currentTime = new Date();
    let earlierTime = new Date(currentTime.getTime() - 2629743000);
    const twaps = yield Twap.find({ timestamp: { $gte: earlierTime.toISOString(), $lte: currentTime.toISOString() } }, { _id: 0 })
        .select("timestamp price")
        .exec();
    let theResults = [];
    for (let i = 0; i < twaps.length; i++) {
        //   if (i % 2 == 0) {
        theResults.push(twaps[i]);
        //   }
    }
    res.json(theResults);
});
const getLatestTwap = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    const twaps = yield Twap.find({}, { _id: 0 })
        .select("timestamp price")
        .exec();
    res.json(twaps[twaps.length - 1] || {});
});
const twapCreation = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    let priceFeed;
    let roundingDecimals;
    const assetPairArray = [];
    const response = yield fetch(assetURI);
    const data = yield response.json();
    for (const assets in data) {
        const assetDetails = data[assets];
        for (const asset in assetDetails) {
            assetPairArray.push({
                key: `${assets.toUpperCase()}-${assetDetails[asset].cycle}${assetDetails[asset].year}`,
                value: assetDetails[asset].pool.address,
                collateral: assetDetails[asset].collateral,
            });
        }
    }
    for (const assetPairAddress in assetPairArray) {
        try {
            priceFeed = yield TestingUniPriceFunctions.usePriceFeed(assetPairArray[assetPairAddress].value);
        }
        catch (err) {
            console.log(err);
        }
        let price = new BigNumber(priceFeed.getCurrentPrice());
        let time = new Date(priceFeed.lastUpdateTime * 1000).toISOString();
        if (assetPairArray[assetPairAddress].value ==
            "0xedf187890af846bd59f560827ebd2091c49b75df") {
            price = new BigNumber(1).dividedBy(price);
            price = price.multipliedBy(new BigNumber(10).pow(18)).toFixed();
            roundingDecimals = 2;
        }
        else {
            price = price.multipliedBy(new BigNumber(10).pow(-18)).toFixed();
            roundingDecimals = 4;
            if (assetPairArray[assetPairAddress].key.includes("USTONKS")) {
                roundingDecimals = 2;
            }
        }
        const createdTwap = new Twap({
            asset: assetPairArray[assetPairAddress].key,
            address: assetPairArray[assetPairAddress].value,
            timestamp: time,
            price: price.toString(),
            collateral: assetPairArray[assetPairAddress].collateral,
            roundingDecimals: roundingDecimals,
        });
        yield createdTwap.save();
    }
});
exports.createMedian = createMedian;
exports.saveAPR = saveAPR;
exports.getLatestAprWithParam = getLatestAprWithParam;
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
//# sourceMappingURL=mongoose.js.map