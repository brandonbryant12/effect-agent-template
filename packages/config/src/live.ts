import { Layer } from "effect";
import { decodeAppConfig } from "./decode.js";
import { AppConfig, type AppConfigValue } from "./service.js";

export const AppConfigLive = Layer.sync(AppConfig, () =>
  decodeAppConfig(process.env),
);

export const AppConfigTest = (value: AppConfigValue) =>
  Layer.succeed(AppConfig, value);
