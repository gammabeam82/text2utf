const fs = require('fs');
const detectCharacterEncoding = require('detect-character-encoding');
const mime = require('mime');
const readChunk = require('read-chunk');
const ProgressBar = require('progress');
const convertEncoding = require('encoding');
const util = require('util');
const process = require('process');
const commandLineArgs = require('command-line-args');
const path = require('path');

const getFiles = util.promisify(fs.readdir);
const getContent = util.promisify(fs.readFile);
const putContent = util.promisify(fs.writeFile);
const copy = util.promisify(fs.copyFile);

const optionDefinitions = [
  { name: 'dir', type: String, multiple: false, defaultOption: true },
  { name: 'copy', type: Boolean }
];

const types = ['application/x-subrip', 'text/plain'];

const convertData = (data, encoding) => {
  return new Promise((resolve, reject) => {
    try {
      resolve(convertEncoding.convert(data, 'UTF-8', encoding));
    } catch (err) {
      reject(err);
    }
  });
}

const prepareList = (files, dir) => {
  return files
    .filter(file => fs.lstatSync(path.join(dir, file)).isFile())
    .filter(file => types.includes(mime.getType(path.join(dir, file))))
    .map(file => {
      let fullpath = path.join(dir, file);
      let { encoding } = detectCharacterEncoding(readChunk.sync(fullpath, 0, 4096));
      return {
        fullpath,
        encoding
      }
    });
}

const processList = (list, saveDir, options) => {
  let bar = new ProgressBar('[:percent] :bar', {
    total: list.length
  });

  list.forEach(async (item) => {
    let { fullpath, encoding } = item;
    let name = path.join(saveDir, path.basename(fullpath));

    if ('UTF-8' === encoding) {
      if (options.copy) {
        await copy(fullpath, name);
      }
      bar.tick();
      return;
    }

    let data = await getContent(fullpath);
    let convertedData = await convertData(data, encoding);

    await putContent(name, convertedData);

    bar.tick();
  });
}

const checkFs = (dir, saveDir) => {
  if (!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) {
    console.log(`Invalid path: ${dir}`);
    process.exit(1);
  }

  try {
    fs.accessSync(dir, fs.constants.R_OK && fs.constants.W_OK);
  } catch (err) {
    console.log('Access denied');
    process.exit(1);
  }

  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir);
  }
}

const run = options => {
  const dir = options.dir || './';
  const saveDir = path.join(dir, 'processed');

  checkFs(dir, saveDir);
  getFiles(dir)
    .then(data => prepareList(data, dir))
    .then(list => processList(list, saveDir, options))
    .catch(err => console.log(err.message));
}


run(commandLineArgs(optionDefinitions));
