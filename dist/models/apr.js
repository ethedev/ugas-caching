const mongoose = require('mongoose');
const aprSchema = new mongoose.Schema({
    assetName: { type: String, require: true },
    aprMultiplier: { type: String, require: true },
    timestamp: { type: Date, require: true },
});
module.exports = mongoose.model('Apr', aprSchema);
//# sourceMappingURL=apr.js.map