const fs = require('fs');
const detectCharacterEncoding = require('detect-character-encoding');
const mime = require('mime');
const readChunk = require('read-chunk');
const ProgressBar = require('progress');
const convertEncoding = require('encoding');
const util = require('util');
const process = require('process');
const commandLineArgs = require('command-line-args');

const getFiles = util.promisify(fs.readdir);
const getContent = util.promisify(fs.readFile);
const putContent = util.promisify(fs.writeFile);
const copy = util.promisify(fs.copyFile);

const optionDefinitions = [
  { name: 'dir', type: String, multiple: false, defaultOption: true },
  { name: 'copy', type: Boolean }
];

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
    .filter(file => fs.lstatSync(dir.concat(file)).isFile())
    .filter(file => {
      let type = mime.getType(dir.concat(file));
      return 'text/plain' === type || 'application/x-subrip' === type
    })
    .map(file => {
      let fullpath = dir.concat(file);
      let { encoding } = detectCharacterEncoding(readChunk.sync(fullpath, 0, 4096));
      return {
        filename: file,
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
    let { filename, fullpath, encoding } = item;

    if ('UTF-8' === encoding) {
      if (options.copy) {
        await copy(fullpath, saveDir.concat(filename));
      }
      bar.tick();
      return;
    }

    let data = await getContent(fullpath);
    let convertedData = await convertData(data, encoding);

    await putContent(saveDir.concat(filename), convertedData);

    bar.tick();
  });
}

const checkFs = (dir, saveDir) => {
  if (!fs.existsSync(dir)) {
    console.log(`Invalid path: ${dir}`);
    process.exit(1);
  }

  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir);
  }
}

const run = options => {
  let dir = options.dir || './';

  if (!dir.match(/(.)\/$/)) {
    dir = dir.concat('/');
  }

  const saveDir = dir.concat('processed/');

  checkFs(dir, saveDir);
  getFiles(dir)
    .then(data => prepareList(data, dir))
    .then(list => processList(list, saveDir, options))
    .catch(err => console.log(err.message));
}


run(commandLineArgs(optionDefinitions));
