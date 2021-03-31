const mongoose = require('mongoose');

const indexSchema = new mongoose.Schema({
    timestamp: { type: Date, require: true },
    price: { type: String, require: true}
});

module.exports = mongoose.model('Index', indexSchema);