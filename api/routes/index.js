const os = require('os');
const { Router } = require('express');
const limiter = require('../controllers/limiter');
const pjson = require('../../package.json');
const shabads = require('../controllers/shabads');
const banis = require('../controllers/banis');
const kosh = require('../controllers/kosh');
const amritkeertan = require('../controllers/amritkeertan');
const rehats = require('../controllers/rehats');
const healthcheck = require('../controllers/healthcheck');

const route = Router();

route.get('/', limiter.rate100, (req, res) => {
  res.json({
    name: 'BaniDB API',
    version: pjson.version,
    documentation: 'https://www.banidb.com',
    'terms-of-service': 'https://www.banidb.com/tos',
    'data-license': 'http://www.banidb.com/nposl',
    endpoint: os.hostname().substr(0, 3),
  });
});

// Healthcheck Routes
route.get('/health', limiter.rate250, healthcheck.db);

// Shabad Routes
route.get('/search/:query', limiter.rate250, shabads.search);

route.get('/shabads/:ShabadID', limiter.rate100, shabads.shabads);

route.get('/angs/:PageNo/:SourceID?', limiter.rate100, shabads.angs);

route.get('/hukamnamas/:year?/:month?/:day?', limiter.rate100, shabads.hukamnamas);

route.get('/random/:SourceID?', limiter.rate100, shabads.random);

// Bani Routes
route.get('/banis', limiter.rate100, banis.all);

route.get('/banis/:BaniID', limiter.rate100, banis.bani);

// Amrit Keertan Routes
route.get('/amritkeertan', limiter.rate100, amritkeertan.headers);

route.get('/amritkeertan/index', limiter.rate100, amritkeertan.index);

route.get('/amritkeertan/index/:HeaderID', limiter.rate100, amritkeertan.index);

route.get('/amritkeertan/shabads/:ShabadID', limiter.rate100, amritkeertan.shabad);

// Kosh Routes
route.get('/kosh/:Letter', limiter.rate100, kosh.letter);

route.get('/kosh/word/:Word', limiter.rate100, kosh.word);

route.get('/kosh/search/:query', limiter.rate100, kosh.search);

// Rehat Routes
route.get('/rehats', limiter.rate100, rehats.all);

route.get('/rehats/:RehatID', limiter.rate100, rehats.chapterList);

route.get('/rehats/:RehatID/chapters/:ChapterID?', limiter.rate100, rehats.chapters);

route.get('/rehats/search/:string', limiter.rate250, rehats.search);

module.exports = route;
