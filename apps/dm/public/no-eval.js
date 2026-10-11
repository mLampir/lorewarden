// The Lorewarden server forbids compiling code at run time in its apps (Content Security Policy).
// zod, which checks the adventures, would otherwise try it once and the browser would log an
// error. This has to run before the app's modules, which build their schemas as they load.
globalThis.__zod_globalConfig = { ...globalThis.__zod_globalConfig, jitless: true };
