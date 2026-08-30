import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let cachedLocalEnv = null;

export function getServerEnv(name) {
  return process.env[name] || getLocalEnv()[name] || "";
}

export function getServerEnvDebug(names) {
  const localEnv = getLocalEnv();
  return {
    cwd: process.cwd(),
    envLocalLoaded: Boolean(cachedLocalEnv?.__loaded),
    variables: Object.fromEntries(
      names.map((name) => [
        name,
        {
          present: Boolean(process.env[name] || localEnv[name]),
          source: process.env[name] ? "process.env" : localEnv[name] ? ".env.local" : "missing"
        }
      ])
    )
  };
}

function getLocalEnv() {
  if (cachedLocalEnv) return cachedLocalEnv;

  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    cachedLocalEnv = {};
    return cachedLocalEnv;
  }

  cachedLocalEnv = parseEnvFile(readFileSync(envPath, "utf8"));
  cachedLocalEnv.__loaded = "true";
  return cachedLocalEnv;
}

function parseEnvFile(contents) {
  return contents.split(/\r?\n/).reduce((env, line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) return env;

    const match = trimmedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return env;

    const [, key, rawValue] = match;
    env[key] = unquote(rawValue.trim());
    return env;
  }, {});
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
