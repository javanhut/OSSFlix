import { readdir } from "node:fs/promises";
import { join } from "node:path";

type TomlValue = string | number | boolean | string[] | number[];

export async function updateTomlFile(dirPath: string, updates: Record<string, TomlValue>): Promise<string> {
  // Find the .toml metadata file in the directory (not timing.toml)
  const entries = await readdir(dirPath);
  const tomlFile = entries.find((f) => f.endsWith(".toml") && f.toLowerCase() !== "timing.toml");

  let content = "";
  let filePath: string;

  if (tomlFile) {
    filePath = join(dirPath, tomlFile);
    content = await Bun.file(filePath).text();
  } else {
    // Create a new toml file based on directory name
    const dirName = dirPath.split("/").pop() || "metadata";
    const safeName = `${dirName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.toml`;
    filePath = join(dirPath, safeName);
    content = "[series]\n";
  }

  // Parse existing content and merge updates
  for (const [key, value] of Object.entries(updates)) {
    const serialized = serializeValue(value);
    const regex = new RegExp(`^${escapeRegex(key)}\\s*=\\s*.*$`, "m");

    if (regex.test(content)) {
      // Replace existing key
      content = content.replace(regex, `${key} = ${serialized}`);
    } else {
      // Add after [series] header or at the end of the [series] section
      const seriesMatch = content.match(/^\[series\]\s*$/m);
      if (seriesMatch) {
        const insertPos = content.indexOf("\n", content.indexOf("[series]"));
        if (insertPos >= 0) {
          content = `${content.slice(0, insertPos + 1)}${key} = ${serialized}\n${content.slice(insertPos + 1)}`;
        } else {
          content += `\n${key} = ${serialized}\n`;
        }
      } else {
        content += `${key} = ${serialized}\n`;
      }
    }
  }

  await Bun.write(filePath, content);
  return filePath;
}

function serializeValue(value: TomlValue): string {
  if (typeof value === "string") {
    if (value.includes("\n") || value.length > 100) {
      return `"""${value}"""`;
    }
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => (typeof v === "string" ? `"${v.replace(/"/g, '\\"')}"` : String(v)));
    return `[${items.join(", ")}]`;
  }
  return String(value);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
