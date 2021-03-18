const mongoose = require('mongoose');

const twapSchema = new mongoose.Schema({
    address: { type: String, require: false },
    timestamp: { type: Date, require: true },
    price: { type: String, require: true}
});

module.exports = mongoose.model('GasTwap', twapSchema);