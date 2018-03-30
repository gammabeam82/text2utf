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
const glob = require("glob");

const getContent = util.promisify(fs.readFile);
const putContent = util.promisify(fs.writeFile);
const copy = util.promisify(fs.copyFile);

const optionDefinitions = [
  { name: 'dir', type: String, multiple: false, defaultOption: true, defaultValue: './' },
  { name: 'copy', type: Boolean }
];

const types = ['application/x-subrip', 'text/plain'];

const getFiles = dir => {
  return new Promise((resolve, reject) => {
    glob(path.join(dir, '*.*'), { 'nodir': true }, (err, files) => {
      if (err) {
        reject(err);
      }
      resolve(files);
    });
  });
}

const prepareList = (files, options) => {
  return files
    .filter(file => types.includes(mime.getType(file)))
    .map(file => {
      let { encoding } = detectCharacterEncoding(readChunk.sync(file, 0, 4096));
      return {
        file,
        encoding
      }
    });
}

const processList = (list, options) => {
  let bar = new ProgressBar('[:percent] :bar', {
    total: list.length
  });

  list.forEach(async (item) => {
    let { file, encoding } = item;
    let dest = path.join(options.saveDir, path.basename(file));

    if ('UTF-8' === encoding) {
      if (options.copy) {
        await copy(file, dest);
      }
      bar.tick();
      return;
    }

    let data = await getContent(file);
    let convertedData = convertEncoding.convert(data, 'UTF-8', encoding);

    await putContent(dest, convertedData);
    bar.tick();
  });
}

const checkFs = options => {
  if (!fs.existsSync(options.dir) || !fs.lstatSync(options.dir).isDirectory()) {
    console.log(`Invalid path: ${options.dir}`);
    process.exit(1);
  }

  try {
    fs.accessSync(options.dir, fs.constants.R_OK && fs.constants.W_OK);
  } catch (err) {
    console.log('Access denied');
    process.exit(1);
  }

  if (!fs.existsSync(options.saveDir)) {
    fs.mkdirSync(options.saveDir);
  }
}

const run = options => {
  options.saveDir = path.join(options.dir, 'processed');

  checkFs(options);
  getFiles(options.dir)
    .then(data => prepareList(data, options))
    .then(list => processList(list, options))
    .catch(err => console.log(err.message));
}


run(commandLineArgs(optionDefinitions));
