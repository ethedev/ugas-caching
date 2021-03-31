const mongoose = require('mongoose');

const medianSchema = new mongoose.Schema({
    timestamp: { type: Date, require: true },
    price: { type: String, require: true}
});

module.exports = mongoose.model('GasMedian', medianSchema);