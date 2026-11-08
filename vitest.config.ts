import { defineConfig } from "vitest/config";
import { vitestSetupFilePath, getClarinetVitestsArgv } from "@hirosystems/clarinet-sdk/vitest";

export default defineConfig({
  test: {
    environment: "clarinet", // provided by vitest-environment-clarinet
    pool: "forks",
    poolOptions: {
      threads: { singleThread: true },
      forks: { singleFork: true },
    },
    testTimeout: 30_000,
    globals: true,
    // Registers the Clarity matchers used in the tests (toBeOk, toBeErr, ...).
    setupFiles: [vitestSetupFilePath],
    environmentOptions: {
      clarinet: { ...getClarinetVitestsArgv() },
    },
  },
});
