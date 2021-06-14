var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
// This transport enables Winston logging to the console.
const winston = require("winston");
const { format } = winston;
const { combine, timestamp, colorize, printf } = format;
function createConsoleTransport() {
    return new winston.transports.Console({
        handleExceptions: true,
        format: combine(
        // Adds timestamp.
        colorize(), timestamp(), printf(info => {
            const { timestamp, level, error } = info, args = __rest(info, ["timestamp", "level", "error"]);
            // This slice changes a timestamp formatting from `2020-03-25T10:50:57.168Z` -> `2020-03-25 10:50:57`
            const ts = timestamp.slice(0, 19).replace("T", " ");
            let log = `${ts} [${level}]: ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ""}`;
            // Winston does not properly log Error objects like console.error() does, so this formatter will search for the Error object
            // in the "error" property of "info", and add the error stack to the log.
            // Discussion at https://github.com/winstonjs/winston/issues/1338.
            if (error) {
                log = `${log}\n${error}`;
            }
            return log;
        }))
    });
}
module.exports = { createConsoleTransport };
//# sourceMappingURL=ConsoleTransport.js.map