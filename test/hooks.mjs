// Point the game's script modules at the fakes in test/mock, so the real pack
// scripts in behavior_pack/ run unchanged under Node.
import { registerHooks } from "node:module";

const mocks = {
  "@minecraft/server": new URL("./mock/server.js", import.meta.url).href,
  "@minecraft/server-ui": new URL("./mock/server-ui.js", import.meta.url).href,
};

registerHooks({
  resolve(specifier, context, next) {
    const url = mocks[specifier];
    return url ? { url, shortCircuit: true } : next(specifier, context);
  },
});
