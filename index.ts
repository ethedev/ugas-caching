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

// apr scheduler
cron.schedule('0 */6 * * *', function() {
    console.log("running apr cron")
    mongoFunctions.saveAPR();
});
// mongoFunctions.saveAPR();


// twap scheduler
cron.schedule('0 * * * *', function() {
    console.log("running twap cron")
    mongoFunctions.twapCreation();
});

// @todo Remove scheduler.
// index scheduler
// cron.schedule('*/5 * * * *', function() {
//     console.log("running index cron")
//     mongoFunctions.getIndexFromSpreadsheet();
// });

// index scheduler with cycle
cron.schedule('*/10 * * * *', function() {
    console.log("running index cron")

    // @dev To add another uSTONKS cycle, add the cycle keyword to the array.
    // @notice The index of each entry mirrors the index of the spreadsheet.
    const cycleArray = ['apr21', 'jun21'];

    mongoFunctions.getIndexFromSpreadsheetWithCycle(cycleArray);
});

// twap cleaner
// cron.schedule('* * * * 0', function() {
//     console.log("running twap cleaner cron")
//     mongoFunctions.twapCleaner();
// });

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
app.get('/median-range', mongoFunctions.getMedianRange);

// twap
// app.get('/twap', mongoFunctions.getLatestTwap);
// app.get('/twap-history', mongoFunctions.getTwaps);
// app.get('/twap-range', mongoFunctions.getTwapRange);
app.get('/twap/pair/:address', mongoFunctions.getLatestTwapWithParam);
app.get('/twap-history/pair/:address', mongoFunctions.getTwapsWithParam);

// other
// @todo Remove endpoint.
app.get('/ustonks/index', mongoFunctions.getLatestIndex);
app.get('/ustonks/index/:cycle', mongoFunctions.getLatestIndexWithParam);
// @todo Remove endpoint.
app.get('/ustonks/index-history', mongoFunctions.getIndex);
app.get('/ustonks/index-history/:cycle', mongoFunctions.getIndexWithParam);
// @todo Remove endpoint.
app.get('/ustonks/index-history-daily', mongoFunctions.getDailyIndex);
app.get('/ustonks/index-history-daily/:cycle', mongoFunctions.getDailyIndexWithParam);

// apr
app.get('/degenerative/apr/:asset', mongoFunctions.getLatestAprWithParam);

app.listen(8080);
