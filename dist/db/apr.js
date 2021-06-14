"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.devMiningCalculator = exports.getUsdPrice = exports.getMiningRewards = exports.getPoolData = void 0;
const graphql_request_1 = require("graphql-request");
const moment_1 = __importDefault(require("moment"));
const axios_1 = __importDefault(require("axios"));
const assets_json_1 = __importDefault(require("../assets/assets.json"));
const uni_json_1 = __importDefault(require("../abi/uni.json"));
const emp_json_1 = __importDefault(require("../abi/emp.json"));
const erc20_json_1 = __importDefault(require("../abi/erc20.json"));
const ethers_1 = require("ethers");
const node_sessionstorage_1 = __importDefault(require("node-sessionstorage"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const queries_1 = require("./queries");
const EthNodeProvider = new ethers_1.providers.JsonRpcProvider('https://fee7372b6e224441b747bf1fde15b2bd.eth.rpc.rivet.cloud');
const getPoolData = (pool) => __awaiter(void 0, void 0, void 0, function* () {
    const endpoint = pool.location === 'uni' ? queries_1.UNISWAP_ENDPOINT : queries_1.SUSHISWAP_ENDPOINT;
    try {
        const data = yield graphql_request_1.request(endpoint, queries_1.UNISWAP_MARKET_DATA_QUERY, { poolAddress: pool.address });
        return data.pair;
    }
    catch (err) {
        console.log(err);
        return Promise.reject(err);
    }
});
exports.getPoolData = getPoolData;
/**
 * Fetch the mining rewards
 * @notice This will be removed after the api is ready (don't remove any comments)
 * @param {string} assetName Name of an asset for the input
 * @param {ISynth} asset Asset object for the input
 * @param {number} assetPrice Asset price for the input
 * @public
 * @methods
 */
const getMiningRewards = (assetName, asset, assetPrice) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO Use params for setup instead of test setup
    const ethersProvider = EthNodeProvider;
    const network = 'mainnet';
    /// @dev Check if params are set
    if (!assetName || !asset) {
        return 0;
    }
    try {
        const contractLp = new ethers_1.ethers.Contract(asset.pool.address, uni_json_1.default.abi, ethersProvider);
        /// @dev Construct devMiningCalculator
        const devmining = devMiningCalculator({
            provider: ethersProvider,
            ethers: ethers_1.ethers,
            getPrice: getPriceByContract,
            empAbi: emp_json_1.default.abi,
            erc20Abi: erc20_json_1.default.abi,
        });
        const [jsonEmpData, contractLpCall, ethPrice, umaPrice, yamPrice] = yield Promise.all([
            getEmpData(devmining, ethersProvider, network),
            contractLp.getReserves(),
            exports.getUsdPrice("weth"),
            exports.getUsdPrice("uma"),
            exports.getUsdPrice("yam-2"),
        ]);
        const jsonEmpObject = JSON.parse(jsonEmpData);
        const { rewards, whitelistedTVM } = jsonEmpObject;
        /// @dev Get emp info from devMiningCalculator
        const getEmpInfo = yield devmining.utils.getEmpInfo(asset.emp.address);
        /// @dev Setup base variables for calculation
        let baseCollateral;
        const baseAsset = ethers_1.BigNumber.from(10).pow(asset.token.decimals);
        /// @dev Temporary pricing
        let tokenPrice;
        if (asset.collateral === "USDC") {
            baseCollateral = ethers_1.BigNumber.from(10).pow(6);
            /* @ts-ignore */
            tokenPrice = assetPrice * 1;
            // } else if(assetInstance.collateral === "YAM"){
            //   tokenPrice = assetPrice * yamPrice;
        }
        else {
            baseCollateral = ethers_1.BigNumber.from(10).pow(18);
            /* @ts-ignore */
            // tokenPrice = assetPrice * ethPrice;
            tokenPrice = assetPrice * 1;
        }
        /// @dev Prepare reward calculation
        const current = moment_1.default().unix();
        /// @TODO Update week1UntilWeek2 and week3UntilWeek4 timestamps for uPUNKS after launch.
        const week1UntilWeek2 = 1615665600;
        const week3UntilWeek4 = 1616961600;
        const umaRewards = rewards[asset.emp.address];
        let yamWeekRewards = 0;
        let umaWeekRewards = 0;
        /// @TODO Check assetName
        if (assetName.toLowerCase() === "upunks-0921") {
            if (current < week1UntilWeek2) {
                umaWeekRewards += 5000;
            }
            else if (current < week3UntilWeek4) {
                yamWeekRewards += 5000;
            }
        }
        /// @dev Calculate rewards
        let calcAsset = 0;
        let calcCollateral = 0;
        const additionalWeekRewards = umaWeekRewards * umaPrice + yamWeekRewards * yamPrice;
        const assetReserve0 = ethers_1.BigNumber.from(contractLpCall._reserve0).div(baseAsset).toNumber();
        const assetReserve1 = ethers_1.BigNumber.from(contractLpCall._reserve1).div(baseCollateral).toNumber();
        calcAsset = assetReserve0 * tokenPrice;
        calcCollateral = assetReserve1 * (asset.collateral == "WETH" ? ethPrice : 1);
        /// @dev Prepare calculation
        console.log("assetName", assetName);
        // getEmpInfo.tokenCount
        let _tokenCount;
        if (assetName.toLowerCase().includes("ustonks")) {
            _tokenCount = Number(ethers_1.utils.formatUnits(getEmpInfo.tokenCount, 6));
        }
        else {
            _tokenCount = Number(ethers_1.utils.formatUnits(getEmpInfo.tokenCount, 18));
        }
        console.log("_tokenCount", _tokenCount.toString());
        // tokenPrice
        const _tokenPrice = tokenPrice;
        console.log("_tokenPrice", _tokenPrice);
        // whitelistedTVM
        const _whitelistedTVM = Number(whitelistedTVM);
        console.log("_whitelistedTVM", _whitelistedTVM);
        // 50_000
        /// @TODO Check why umaRewards != 50_000
        const _umaRewards = 50000;
        console.log("_umaRewards", _umaRewards);
        // umaPrice
        const _umaPrice = umaPrice;
        console.log("_umaPrice", _umaPrice);
        // 0.82
        const _developerRewardsPercentage = 0.82;
        console.log("_developerRewardsPercentage", _developerRewardsPercentage);
        // additionalWeekRewards
        const _additionalWeekRewards = additionalWeekRewards;
        console.log("_additionalWeekRewards", _additionalWeekRewards);
        // calcAsset
        const _calcAsset = calcAsset;
        console.log("_calcAsset", _calcAsset);
        // 1
        const _one = 1;
        console.log("_one", _one);
        // 52
        const _numberOfWeeksInYear = 52;
        console.log("_numberOfWeeksInYear", _numberOfWeeksInYear);
        // cr
        // const _cr: number = cr
        // console.log("_cr", _cr)
        // @notice New calculation based on the doc
        /// @TODO Check _whitelistedTVM
        // umaRewardsPercentage = (`totalTokensOutstanding` * synthPrice) / whitelistedTVM
        let umaRewardsPercentage = (_tokenCount * _tokenPrice) / _whitelistedTVM;
        console.log("umaRewardsPercentage", umaRewardsPercentage.toString());
        // dynamicAmountPerWeek = 50,000 * umaRewardsPercentage
        const dynamicAmountPerWeek = _umaRewards * umaRewardsPercentage;
        console.log("dynamicAmountPerWeek", dynamicAmountPerWeek.toString());
        // dynamicAmountPerWeekInDollars = dynamicAmountPerWeek * UMA price
        const dynamicAmountPerWeekInDollars = dynamicAmountPerWeek * _umaPrice;
        console.log("dynamicAmountPerWeekInDollars", dynamicAmountPerWeekInDollars.toString());
        // standardWeeklyRewards = dynamicAmountPerWeekInDollars * developerRewardsPercentage
        const standardWeeklyRewards = dynamicAmountPerWeekInDollars * _developerRewardsPercentage;
        console.log("standardWeeklyRewards", standardWeeklyRewards.toString());
        // totalWeeklyRewards = (standardRewards) + (Additional UMA * UMA price) + (Additional Yam * Yam Price)
        const totalWeeklyRewards = standardWeeklyRewards + _additionalWeekRewards;
        console.log("totalWeeklyRewards", totalWeeklyRewards.toString());
        // sponsorAmountPerDollarMintedPerWeek = totalWeeklyRewards / (Synth in AMM pool * synth price)
        const sponsorAmountPerDollarMintedPerWeek = totalWeeklyRewards / _calcAsset;
        console.log("sponsorAmountPerDollarMintedPerWeek", sponsorAmountPerDollarMintedPerWeek.toString());
        // collateralEfficiency = 1 / (CR + 1)
        // const collateralEfficiency: number = 1 / (_cr + 1)
        // console.log("collateralEfficiency", collateralEfficiency)
        // General APR = (sponsorAmountPerDollarMintedPerWeek * chosen collateralEfficiency * 52)
        let aprMultiplier = sponsorAmountPerDollarMintedPerWeek * _numberOfWeeksInYear * 100;
        console.log("aprMultiplier", aprMultiplier.toString());
        if (aprMultiplier === Infinity || _tokenPrice === undefined) {
            aprMultiplier = 0;
        }
        return aprMultiplier.toString();
    }
    catch (e) {
        console.error("error", e);
        return 0;
    }
});
exports.getMiningRewards = getMiningRewards;
// Get USD price of token and cache to sessionstorage
/*
export const getUsdPrice = async (tokenAddress: string) => {
  const cached = sessionStorage.getItem(tokenAddress);
  if (cached) return Promise.resolve(Number(cached));

  try {
    const res = await axios.get(`https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`);
    const price = Number(res.data[tokenAddress].usd);
    sessionStorage.setItem(tokenAddress, price.toString());
    return Promise.resolve(price);
  } catch (err) {
    return Promise.reject(err);
  }
};
*/
const getUsdPrice = (cgId) => __awaiter(void 0, void 0, void 0, function* () {
    const cached = node_sessionstorage_1.default.getItem(cgId);
    if (cached)
        return Promise.resolve(Number(cached));
    try {
        const res = yield axios_1.default.get(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`);
        const price = Number(res.data[cgId].usd);
        node_sessionstorage_1.default.setItem(cgId, price.toString());
        return Promise.resolve(price);
    }
    catch (err) {
        return Promise.reject(err);
    }
});
exports.getUsdPrice = getUsdPrice;
const getEmpData = (devmining, ethersProvider, network) => __awaiter(void 0, void 0, void 0, function* () {
    const cached = node_sessionstorage_1.default.getItem("empData");
    if (cached)
        return cached;
    /// @dev Get dev mining emp
    const devMiningEmp = yield getDevMiningEmps(network);
    /// @dev Get dev mining reward estimation from devMiningCalculator
    const estimateDevMiningRewards = yield devmining.estimateDevMiningRewards({
        /* @ts-ignore */
        totalRewards: devMiningEmp["totalReward"],
        /* @ts-ignore */
        empWhitelist: devMiningEmp["empWhitelist"],
    });
    /// @dev Structure rewards
    const rewards = {};
    let whitelistedTVM = "";
    for (let i = 0; i < estimateDevMiningRewards.length; i++) {
        rewards[estimateDevMiningRewards[i][0]] =
            estimateDevMiningRewards[i][1];
        whitelistedTVM = estimateDevMiningRewards[i][2];
    }
    node_sessionstorage_1.default.setItem("empData", JSON.stringify({ rewards, whitelistedTVM }));
    return JSON.stringify({ rewards, whitelistedTVM });
});
const mergeUnique = (arr1, arr2) => {
    return arr1.concat(arr2.filter(function (item) {
        return arr1.indexOf(item) === -1;
    }));
};
const getDevMiningEmps = (network) => __awaiter(void 0, void 0, void 0, function* () {
    /* @ts-ignore */
    const assets = assets_json_1.default[network];
    if (assets) {
        /* @ts-ignore */
        const data = [
            /* @ts-ignore */
            assets["uGAS"][1].emp.address,
            /* @ts-ignore */
            assets["uGAS"][2].emp.address,
            /* @ts-ignore */
            assets["uGAS"][3].emp.address,
            /* @ts-ignore */
            assets["uSTONKS"][0].emp.address,
            /* @ts-ignore */
            assets["uSTONKS"][1].emp.address,
        ];
        const umadata = yield node_fetch_1.default(`https://raw.githubusercontent.com/UMAprotocol/protocol/master/packages/affiliates/payouts/devmining-status.json`);
        const umaDataJson = yield umadata.json();
        const empWhitelistUpdated = mergeUnique(umaDataJson["empWhitelist"], data);
        const umaObject = {
            empWhitelist: empWhitelistUpdated,
            totalReward: umaDataJson["totalReward"],
        };
        return umaObject;
    }
    else {
        return -1;
    }
});
const getContractInfo = (address) => __awaiter(void 0, void 0, void 0, function* () {
    const data = yield node_fetch_1.default(`https://api.coingecko.com/api/v3/coins/ethereum/contract/${address}`);
    const jsonData = yield data.json();
    return jsonData;
});
const getPriceByContract = (address, toCurrency) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO: Remove while loop
    let result = yield getContractInfo(address);
    return (result &&
        result.market_data &&
        result.market_data.current_price[toCurrency || "usd"]);
});
function devMiningCalculator({ provider, ethers, getPrice, empAbi, erc20Abi, }) {
    const { utils, BigNumber, FixedNumber } = ethers;
    const { parseEther } = utils;
    function getEmpInfo(address, toCurrency = "usd") {
        return __awaiter(this, void 0, void 0, function* () {
            const emp = new ethers.Contract(address, empAbi, provider);
            const tokenAddress = yield emp.tokenCurrency();
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
            /// @dev Fetches the token price from coingecko using getPriceByContract (getPrice == getPriceByContract)
            const tokenPrice = yield getPrice(tokenAddress, toCurrency).catch(() => null);
            const tokenCount = (yield emp.totalTokensOutstanding()).toString();
            const tokenDecimals = (yield tokenContract.decimals()).toString();
            const collateralAddress = yield emp.collateralCurrency();
            const collateralContract = new ethers.Contract(collateralAddress, erc20Abi, provider);
            /// @dev Fetches the collateral price from coingecko using getPriceByContract (getPrice == getPriceByContract)
            const collateralPrice = yield getPrice(collateralAddress, toCurrency).catch(() => null);
            const collateralCount = (yield emp.totalPositionCollateral()).toString();
            const collateralDecimals = (yield collateralContract.decimals()).toString();
            const collateralRequirement = (yield emp.collateralRequirement()).toString();
            return {
                address,
                toCurrency,
                tokenAddress,
                tokenPrice,
                tokenCount,
                tokenDecimals,
                collateralAddress,
                collateralPrice,
                collateralCount,
                collateralDecimals,
                collateralRequirement,
            };
        });
    }
    /// @dev Returns a fixed number
    function calculateEmpValue({ tokenPrice, tokenDecimals, collateralPrice, collateralDecimals, tokenCount, collateralCount, collateralRequirement, }) {
        /// @dev If we have a token price, use this first to estimate EMP value
        if (tokenPrice) {
            const fixedPrice = FixedNumber.from(tokenPrice.toString());
            const fixedSize = FixedNumber.fromValue(tokenCount, tokenDecimals);
            return fixedPrice.mulUnsafe(fixedSize);
        }
        /** @dev Theres no token price then fallback to collateral price divided by
          * the collateralization requirement (usually 1.2) this should give a
          * ballpack of what the total token value will be. Its still an over estimate though.
         */
        if (collateralPrice) {
            const fixedPrice = FixedNumber.from(collateralPrice.toString());
            const collFixedSize = FixedNumber.fromValue(collateralCount, collateralDecimals);
            return fixedPrice
                .mulUnsafe(collFixedSize)
                .divUnsafe(FixedNumber.fromValue(collateralRequirement, 18));
        }
        throw new Error("Unable to calculate emp value, no token price or collateral price");
    }
    function estimateDevMiningRewards({ totalRewards, empWhitelist, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const allInfo = yield Promise.all(empWhitelist.map((address) => getEmpInfo(address)));
            const values = [];
            /// @dev Returns the whitelisted TVM
            const totalValue = allInfo.reduce((totalValue, info) => {
                console.log(info);
                const value = calculateEmpValue(info);
                values.push(value);
                return totalValue.addUnsafe(value);
            }, FixedNumber.from("0"));
            return allInfo.map((info, i) => {
                return [
                    info.address,
                    values[i]
                        .mulUnsafe(FixedNumber.from(totalRewards))
                        .divUnsafe(totalValue)
                        .toString(),
                    totalValue.toString()
                ];
            });
        });
    }
    return {
        estimateDevMiningRewards,
        utils: {
            getEmpInfo,
            calculateEmpValue,
        },
    };
}
exports.devMiningCalculator = devMiningCalculator;
//# sourceMappingURL=apr.js.map