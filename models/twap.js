const mongoose = require('mongoose');

const twapSchema = new mongoose.Schema({
    asset: { type: String, require: false },
    timestamp: { type: Date, require: true },
    price: { type: Number, require: true}
});

module.exports = mongoose.model('GasTwap', twapSchema);