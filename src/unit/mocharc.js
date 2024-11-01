const { watchFile } = require("fs");

module.exports = {
    spec: "src/unit/*.test.ts",
    require: 'ts-node/register',
    "watch-files": [
        "src/**/*.ts",
        "src/**/*.test.ts"
    ]
};