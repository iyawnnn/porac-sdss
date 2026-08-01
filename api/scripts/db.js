"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = exports.db = exports.client = void 0;
const postgres_1 = __importDefault(require("postgres"));
const postgres_js_1 = require("drizzle-orm/postgres-js");
exports.client = (0, postgres_1.default)(process.env.DATABASE_URL);
exports.sql = exports.client;
exports.db = (0, postgres_js_1.drizzle)(exports.client);
//# sourceMappingURL=db.js.map