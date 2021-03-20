const mongoose = require('mongoose');

const twapSchema = new mongoose.Schema({
    asset: { type: String, require: false },
    address: { type: String, require: false },
    timestamp: { type: Date, require: true },
    price: { type: String, require: true}
});

module.exports = mongoose.model('GasTwap', twapSchema);