/**
 * 内置工具注册
 */
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { editFileTool } from "./edit-file.js";
import { bashTool } from "./bash.js";
import { listDirectoryTool } from "./list-dir.js";
import { grepTool } from "./grep.js";

export const tools = [
  readFileTool,
  writeFileTool,
  editFileTool,
  bashTool,
  listDirectoryTool,
  grepTool,
];
