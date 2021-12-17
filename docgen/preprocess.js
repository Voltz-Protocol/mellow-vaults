const fs = require("fs");
const path = require("path");
const { getGasData } = require("./gasData");
const EXCLUDE_FILE = "docgen/exclude.txt";
const excludeList = lines(EXCLUDE_FILE);
const OUTPUT_DIR = "docs";

function lines(pathName) {
  return fs
    .readFileSync(pathName, { encoding: "utf8" })
    .split("\r")
    .join("")
    .split("\n");
}

const getAllFiles = function (dirPath, arrayOfFiles) {
  files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function (file) {
    for (const rule of excludeList) {
      const fullFile = dirPath + "/" + file;
      if (fullFile.match(rule)) {
        return;
      }
    }
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });

  return arrayOfFiles;
};
const docsDir = path.resolve(path.join(OUTPUT_DIR, "..", "docs"));

function addGas(data, { avg, min, max }) {
  let line = `${data}\n\n⛽ ${formatGas(avg)}`;
  if (min && max) {
    if (formatGas(min) != formatGas(avg) || formatGas(max) != formatGas(avg)) {
      line += ` (${formatGas(min)} - ${formatGas(max)})`;
    }
  }
  line += "\n\n";
  return line;
}

function formatGas(gas) {
  if (gas > 1000000) {
    return `${Math.ceil(gas / 10000) / 100}M`;
  }
  return `${Math.ceil(gas / 1000)}K`;
}

function enrichData(data) {
  let name = "";
  const lines = data.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("# ")) {
      name = line.slice(2);
      const gasData = getGasData(name);
      if (gasData.avg) {
        lines[i + 1] = addGas(lines[i + 1], gasData);
      }
    }
    if (line.startsWith("### ")) {
      const method = line.slice(4);
      const gasData = getGasData(name, method);
      if (gasData.avg) {
        lines[i] = addGas(lines[i], gasData);
      }
    }
  }
  return lines.join("\n");
}

module.exports = {
  preprocess() {
    let res = "";
    getAllFiles(docsDir).forEach((file) => {
      let data = fs.readFileSync(file).toString();
      data = enrichData(data);
      res += `${data}\n`;
    });

    fs.writeFileSync(path.resolve(path.join(docsDir, "api.md")), res);
  },
};
