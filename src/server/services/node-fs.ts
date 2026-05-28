/**
 * Node.js FileSystem 适配器
 * 为 JsonlSessionRepo 提供所需的文件系统操作
 */
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmSync,
  mkdtempSync,
  realpathSync,
  renameSync,
} from "fs";
import { join, resolve, isAbsolute } from "path";
import { tmpdir } from "os";

export class NodeFileSystem {
  cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  async absolutePath(path: string): Promise<{ ok: true; value: string } | { ok: false; error: any }> {
    try {
      return { ok: true, value: isAbsolute(path) ? path : resolve(this.cwd, path) };
    } catch (e) {
      return { ok: false, error: { code: "unknown", message: String(e) } };
    }
  }

  async joinPath(parts: string[]): Promise<{ ok: true; value: string } | { ok: false; error: any }> {
    try {
      return { ok: true, value: join(...parts) };
    } catch (e) {
      return { ok: false, error: { code: "unknown", message: String(e) } };
    }
  }

  async readTextFile(path: string): Promise<{ ok: true; value: string } | { ok: false; error: any }> {
    try {
      const content = readFileSync(path, "utf-8");
      return { ok: true, value: content };
    } catch (e: any) {
      const code = e.code === "ENOENT" ? "not_found" : "unknown";
      return { ok: false, error: { code, message: e.message, path } };
    }
  }

  async readTextLines(
    path: string,
    options?: { maxLines?: number }
  ): Promise<{ ok: true; value: string[] } | { ok: false; error: any }> {
    try {
      const content = readFileSync(path, "utf-8");
      let lines = content.split("\n");
      if (options?.maxLines) {
        lines = lines.slice(0, options.maxLines);
      }
      return { ok: true, value: lines };
    } catch (e: any) {
      const code = e.code === "ENOENT" ? "not_found" : "unknown";
      return { ok: false, error: { code, message: e.message, path } };
    }
  }

  async readBinaryFile(path: string): Promise<{ ok: true; value: Uint8Array } | { ok: false; error: any }> {
    try {
      const buffer = readFileSync(path);
      return { ok: true, value: new Uint8Array(buffer) };
    } catch (e: any) {
      const code = e.code === "ENOENT" ? "not_found" : "unknown";
      return { ok: false, error: { code, message: e.message, path } };
    }
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<{ ok: true; value: void } | { ok: false; error: any }> {
    try {
      const dir = resolve(path, "..");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path, content);
      return { ok: true, value: undefined };
    } catch (e: any) {
      return { ok: false, error: { code: "unknown", message: e.message, path } };
    }
  }

  async appendFile(path: string, content: string | Uint8Array): Promise<{ ok: true; value: void } | { ok: false; error: any }> {
    try {
      appendFileSync(path, content);
      return { ok: true, value: undefined };
    } catch (e: any) {
      return { ok: false, error: { code: "unknown", message: e.message, path } };
    }
  }

  async fileInfo(path: string): Promise<{ ok: true; value: any } | { ok: false; error: any }> {
    try {
      const stat = statSync(path);
      return {
        ok: true,
        value: {
          name: path.split("/").pop() || "",
          path,
          kind: stat.isDirectory() ? "directory" : "file",
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        },
      };
    } catch (e: any) {
      const code = e.code === "ENOENT" ? "not_found" : "unknown";
      return { ok: false, error: { code, message: e.message, path } };
    }
  }

  async listDir(path: string): Promise<{ ok: true; value: any[] } | { ok: false; error: any }> {
    try {
      const entries = readdirSync(path, { withFileTypes: true });
      const result = entries.map((entry) => {
        const fullPath = join(path, entry.name);
        const stat = statSync(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          kind: entry.isDirectory() ? "directory" : "file",
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        };
      });
      return { ok: true, value: result };
    } catch (e: any) {
      const code = e.code === "ENOENT" ? "not_found" : "unknown";
      return { ok: false, error: { code, message: e.message, path } };
    }
  }

  async canonicalPath(path: string): Promise<{ ok: true; value: string } | { ok: false; error: any }> {
    try {
      return { ok: true, value: realpathSync(path) };
    } catch (e: any) {
      const code = e.code === "ENOENT" ? "not_found" : "unknown";
      return { ok: false, error: { code, message: e.message, path } };
    }
  }

  async exists(path: string): Promise<{ ok: true; value: boolean } | { ok: false; error: any }> {
    try {
      return { ok: true, value: existsSync(path) };
    } catch (e: any) {
      return { ok: false, error: { code: "unknown", message: e.message, path } };
    }
  }

  async createDir(path: string, options?: { recursive?: boolean }): Promise<{ ok: true; value: void } | { ok: false; error: any }> {
    try {
      mkdirSync(path, { recursive: options?.recursive !== false });
      return { ok: true, value: undefined };
    } catch (e: any) {
      return { ok: false, error: { code: "unknown", message: e.message, path } };
    }
  }

  async remove(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<{ ok: true; value: void } | { ok: false; error: any }> {
    try {
      rmSync(path, { recursive: options?.recursive, force: options?.force });
      return { ok: true, value: undefined };
    } catch (e: any) {
      return { ok: false, error: { code: "unknown", message: e.message, path } };
    }
  }

  async createTempDir(prefix?: string): Promise<{ ok: true; value: string } | { ok: false; error: any }> {
    try {
      const dir = mkdtempSync(join(tmpdir(), prefix || "tmp-"));
      return { ok: true, value: dir };
    } catch (e: any) {
      return { ok: false, error: { code: "unknown", message: e.message } };
    }
  }

  async createTempFile(options?: { prefix?: string; suffix?: string }): Promise<{ ok: true; value: string } | { ok: false; error: any }> {
    try {
      const dir = mkdtempSync(join(tmpdir(), options?.prefix || "tmp-"));
      const fileName = `file${options?.suffix || ""}`;
      const filePath = join(dir, fileName);
      writeFileSync(filePath, "");
      return { ok: true, value: filePath };
    } catch (e: any) {
      return { ok: false, error: { code: "unknown", message: e.message } };
    }
  }

  async cleanup(): Promise<void> {
    // Node.js 文件系统不需要特殊清理
  }
}
