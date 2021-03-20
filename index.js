require("dotenv").config();
const express = require('express');
const cron = require('node-cron');
const bodyParser = require('body-parser');

const mongoFunctions = require('./db/mongoose');

const app = express();

// gas scheduler
cron.schedule('0 0 * * *', function() {
    console.log("running gas cron")
    mongoFunctions.createMedian();
});

// twap scheduler
cron.schedule('0 * * * *', function() {
    console.log("running twap cron")
    mongoFunctions.twapCreation();
});

// index scheduler
cron.schedule('*/5 * * * *', function() {
    console.log("running index cron")
    mongoFunctions.getIndexFromSpreadsheet();
});

// add cleaner

// twap cleaner
cron.schedule('0 * * * *', function() {
    console.log("running twap cleaner cron")
    mongoFunctions.twapCleaner();
});

app.use(bodyParser.json());

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
    next();
});

// gas
app.get('/median', mongoFunctions.getLatestMedian);
app.get('/median-history', mongoFunctions.getMedians);
app.get('/median-range', mongoFunctions.getMedianRange)

// twap
// app.get('/twap', mongoFunctions.getLatestTwap);
// app.get('/twap-history', mongoFunctions.getTwaps);
// app.get('/twap-range', mongoFunctions.getTwapRange);
app.get('/twap/pair/:address', mongoFunctions.getLatestTwapWithParam);
app.get('/twap-history/pair/:address', mongoFunctions.getTwapsWithParam);

// other
app.get('/ustonks/index', mongoFunctions.getLatestIndex);
app.get('/ustonks/index-history', mongoFunctions.getIndex);

app.listen(8080);