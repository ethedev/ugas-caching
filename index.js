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
cron.schedule('* * * * *', function() {
    console.log("running twap cron")
    mongoFunctions.twapCreation();
});

// index scheduler
cron.schedule('*/5 * * * *', function() {
    console.log("running index cron")
    mongoFunctions.getIndexFromSpreadsheet();
});

// add cleaner

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
app.get('/median-history', mongoFunctions.getMedians);
app.get('/median-range', mongoFunctions.getMedianRange)
app.get('/median', mongoFunctions.getLatestMedian);
app.get('/twap', mongoFunctions.getLatestTwap);
app.get('/twap-range', mongoFunctions.getTwapRange);
app.get('/twap-history', mongoFunctions.getTwaps);
app.get('/twap-history/pair/:address', function (req, res) {
  mongoFunctions.getTwapsWithParam(req.params)
});
app.get('/twap/pair/:address', function (req, res) {
  mongoFunctions.getLatestTwapWithParam(req.params)
});

// other
app.get('/ustonks/index-history', mongoFunctions.getIndex);
app.get('/ustonks/index', mongoFunctions.getLatestIndex);

app.listen(8080);