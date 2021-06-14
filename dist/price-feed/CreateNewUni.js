var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const Web3 = require("web3");
const { createPriceFeed } = require("./CreatePriceFeed");
const { Networker } = require("./Networker");
const { Logger } = require("./Logger");
// Constants
const INFURA_URL = `https://mainnet.infura.io/v3/${process.env.INFURA_KEY}`;
const INVERTED = false;
const TWAP_LENGTH = 7200;
// Setup
const web3 = new Web3(INFURA_URL);
const networker = new Networker();
const getTime = () => Math.floor(Date.now() / 1000);
function createUniPriceFeed(assetPairAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        const pf = yield createPriceFeed(Logger, web3, networker, getTime, {
            type: "uniswap",
            uniswapAddress: assetPairAddress,
            invertPrice: INVERTED,
            lookback: 0,
            twapLength: TWAP_LENGTH,
        });
        return pf;
    });
}
function usePriceFeed(assetPairAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        let priceFeed;
        try {
            priceFeed = yield createUniPriceFeed(assetPairAddress);
        }
        catch (err) {
            console.log(err);
        }
        try {
            yield priceFeed.update();
        }
        catch (err) {
            console.log(err);
        }
        return priceFeed;
    });
}
exports.usePriceFeed = usePriceFeed;
//# sourceMappingURL=CreateNewUni.js.map