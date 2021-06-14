const mongoose = require('mongoose');
const indexSchema = new mongoose.Schema({
    cycle: { type: String, require: false },
    timestamp: { type: Date, require: true },
    price: { type: String, require: true }
});
module.exports = mongoose.model('Index', indexSchema);
//# sourceMappingURL=indexValue.js.map