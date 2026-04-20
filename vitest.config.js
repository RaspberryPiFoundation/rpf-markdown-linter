"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const node_url_1 = require("node:url");
exports.default = (0, config_1.defineConfig)({
    test: {
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: {
            vscode: (0, node_url_1.fileURLToPath)(new URL('./src/test/vscode.mock.ts', import.meta.url)),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map