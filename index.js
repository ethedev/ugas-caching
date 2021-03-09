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

// index scheduler
cron.schedule('0 * * * *', function() {
  console.log("running index cron")
  mongoFunctions.getIndexFromSpreadsheet();
});

// twap scheduler
cron.schedule('0 * * * *', function() {
    console.log("running twap cron")
    mongoFunctions.twapCreation();
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

app.get('/median', mongoFunctions.getMedians);

app.get('/index', mongoFunctions.getIndex);

app.get('/current-index', mongoFunctions.getLatestIndex);

app.get('/median-range', mongoFunctions.getMedianRange)

app.get('/current-median', mongoFunctions.getLatestMedian);

app.get('/twap', mongoFunctions.getTwaps);

app.get('/current-twap', mongoFunctions.getLatestTwap);

app.get('/twap-range', mongoFunctions.getTwapRange);

app.listen(8080);