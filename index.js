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
  { name: 'dir', type: String, multiple: false, defaultOption: true, defaultValue: './' },
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

const prepareList = (files, options) => {
  return files
    .filter(file => fs.lstatSync(path.join(options.dir, file)).isFile())
    .filter(file => types.includes(mime.getType(path.join(options.dir, file))))
    .map(file => {
      let { encoding } = detectCharacterEncoding(readChunk.sync(path.join(options.dir, file), 0, 4096));
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
    let name = path.join(options.saveDir, file);
    let fullpath = path.join(options.dir, file);

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
