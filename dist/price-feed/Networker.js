// This class makes networking calls on behalf of the caller. Note: this is separated out to allow this functionality
// to be mocked out in tests so no real network calls have to be made.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const fetch = require("node-fetch");
class Networker {
    /**
     * @notice Constructs new Networker.
     * @param {Object} logger Winston module used to send logs.
     */
    constructor(logger) {
        this.logger = logger;
    }
    getJson(url) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield fetch(url);
            const json = yield response.json();
            if (!json) {
                this.logger.error({
                    at: "Networker",
                    message: "Failed to get json response🚨",
                    url: url,
                    error: new Error(response)
                });
            }
            return json;
        });
    }
}
module.exports = {
    Networker
};
//# sourceMappingURL=Networker.js.map