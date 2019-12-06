const { createPool } = require('mariadb');
const banidb = require('shabados');
const config = require('../config');
const lib = require('../lib');

const sources = banidb.SOURCES;
const searchTypes = banidb.TYPES;

const pool = createPool(config.mysql);

const allColumns = `v.ID, v.Gurmukhi, v.GurmukhiUni, v.Translations, v.PageNo AS PageNo, v.LineNo,
    v.SourceID as SourceID, s.ShabadID, v.FirstLetterStr, v.MainLetters, v.Visraam,
    v.FirstLetterEng, v.Transliterations, v.WriterID, w.WriterEnglish,
    w.WriterGurmukhi, w.WriterUnicode, v.RaagID, r.RaagGurmukhi,
    r.RaagUnicode, r.RaagEnglish, r.RaagWithPage, r.StartID, r.EndID,
    src.SourceGurmukhi, src.SourceUnicode, src.SourceEnglish,
    GREATEST(s.Updated, v.Updated) AS Updated`;

const liveColumns = `v.ID, v.Gurmukhi, v.GurmukhiUni, v.Translations, s.ShabadID`;

const allFrom = `FROM Verse v
  LEFT JOIN Shabad s ON s.VerseID = v.ID
  LEFT JOIN Writer w USING(WriterID)
  LEFT JOIN Raag r USING(RaagID)
  LEFT JOIN Source src USING(SourceID)`;

const allColumnsWhere = 'AND s.ShabadID < 5000000';

const error = (err, res) => {
  console.error(err);
  Error.captureStackTrace(err);
  res.status(400).json({
    error: true,
    data: {
      error: err,
      stack: err.stack,
    },
  });
};

exports.search = async (req, res) => {
  let searchQuery = req.params.query;
  let SourceID = req.query.source || '';
  let searchType = req.query.searchtype ? parseInt(req.query.searchtype, 10) : 0;
  let writer = parseInt(req.query.writer, 10) || null;
  let raag = parseInt(req.query.raag, 10) || null;
  let ang = parseInt(req.query.ang, 10) || null;
  let page = parseInt(req.query.page, 10) || 0;
  let results = parseInt(req.query.results, 10) || 20;
  const sinceDate = req.query.updatedsince ? lib.isValidDatetime(req.query.updatedsince) : null;
  const liveSearch = req.query.livesearch ? parseInt(req.query.livesearch, 10) : 0;

  SourceID = SourceID.substr(0, 1);

  if (!searchTypes[searchType]) {
    searchType = 0;
  }

  if (writer < 0) {
    writer = 0;
  }

  if (raag < 0) {
    raag = 0;
  }

  if (ang < 0) {
    ang = 0;
  }

  if (page < 1) {
    page = 1;
  }

  if (results < 1) {
    results = 20;
  }

  let columns = liveSearch ? `${liveColumns} ${allFrom}` : `${allColumns} ${allFrom}`;
  let charCodeQuery = '';
  let charCodeQueryWildCard = '';
  const conditions = [];
  const parameters = [];
  let groupBy = '';
  let orderBy = '';

  // only do for first letter searches
  if (searchType === 0 || searchType === 1) {
    // ignore spaces
    searchQuery = searchQuery.replace(/\s+/g, '');

    for (let x = 0, len = searchQuery.length; x < len; x += 1) {
      let charCode = searchQuery.charCodeAt(x);
      if (charCode < 100) {
        charCode = `0${charCode}`;
      }
      charCodeQuery += `,${charCode}`;
    }
    // Add trailing wildcard
    charCodeQueryWildCard = `${charCodeQuery},z`;
  }

  if (sources[SourceID]) {
    conditions.push('v.SourceID = ?');
    parameters.push(SourceID);
  }

  if (searchQuery) {
    if (searchType === 0) {
      // First letter start
      conditions.push('v.FirstLetterStr BETWEEN ? AND ?');
      parameters.push(charCodeQuery, charCodeQueryWildCard);
      if (searchQuery.length < 3) {
        orderBy = 'FirstLetterLen,';
      }
    } else if (searchType === 1) {
      // First letter anywhere
      columns += ' LEFT JOIN tokenized_firstletters t ON t.verseid = v.ID';
      conditions.push('t.token BETWEEN ? AND ?');
      parameters.push(charCodeQuery, charCodeQueryWildCard);
      groupBy = 'GROUP BY v.ID';
      if (searchQuery.length < 3) {
        orderBy = 'FirstLetterLen,';
      }
    } else if (searchType === 2) {
      // Full word (Gurmukhi)
      conditions.push('v.Gurmukhi LIKE BINARY ?');
      parameters.push(`%${searchQuery.replace(/(\[|\])/g, '')}%`);
      groupBy = 'GROUP BY v.ID';
    } else if (searchType === 3) {
      // Full word (English)
      columns += ' LEFT JOIN tokenized_english t ON t.verseid = v.ID';
      conditions.push('t.token LIKE ?');
      parameters.push(`${searchQuery}%`);
      groupBy = 'GROUP BY v.ID';
    } else if (searchType === 4) {
      // Full word (Romanized)
      let spicy = searchQuery.toLowerCase().split(' ');
      spicy = spicy.map(word => word.substr(0, 1));
      conditions.push('v.FirstLetterEng LIKE ?');
      parameters.push(`%${spicy.join('')}%`);
    } else if (searchType === 5) {
      // Ang
      // Reserved for Ang search - ideally it should go to /angs
      conditions.push('v.PageNo = ?');
      parameters.push(searchQuery);
    } else if (searchType === 6) {
      // Main letters
      columns += ' LEFT JOIN tokenized_mainletters t ON t.verseid = v.ID';
      const words = searchQuery.split(' ').join('%');
      conditions.push('t.token LIKE BINARY ?');
      parameters.push(`${words}%`);
      groupBy = 'GROUP BY v.ID';
    }
  }

  if (writer > 0) {
    conditions.push('v.WriterID = ?');
    parameters.push(writer);
  }

  if (raag > 0) {
    conditions.push('v.RaagID = ?');
    parameters.push(raag);
  }

  if (ang > 0) {
    conditions.push('v.PageNo = ?');
    parameters.push(ang);
  }

  if (sinceDate) {
    conditions.push('v.Updated > ?');
    parameters.push(sinceDate);
  }

  let conn;

  try {
    conn = await pool.getConnection();

    const q = `SELECT ${columns}
      WHERE ${conditions.join(' AND ')}
      ${groupBy}
      ORDER BY ${orderBy} ShabadID ASC`;

    const row = await conn.query(`SELECT COUNT(*) FROM (${q}) AS count`, parameters);

    const totalResults = row[0]['COUNT(*)'];
    const totalPages = Math.ceil(totalResults / results);
    if (page > totalPages) {
      page = totalPages;
    }
    const resultsInfo = {
      totalResults,
      pageResults: totalResults,
      pages: {
        page,
        resultsPerPage: results,
        totalPages,
      },
    };

    if (totalResults > 0) {
      if (page < totalPages) {
        req.query.page = page + 1;
        resultsInfo.pages.nextPage = `${req.protocol}://${req.get('host')}${req.baseUrl}${
          req.path
        }?${Object.keys(req.query)
          .map(key => `${key}=${encodeURIComponent(req.query[key])}`)
          .join('&')}`;
      }
      const rows = await conn.query(`${q} LIMIT ?, ?`, [
        ...parameters,
        (page - 1) * results,
        results,
      ]);
      const verses = rows.map(verse => lib.prepVerse(verse, true, liveSearch));
      resultsInfo.pageResults = verses.length;
      res.json({
        resultsInfo,
        verses,
      });
    } else {
      res.json({
        resultsInfo,
        verses: [],
      });
    }
  } catch (err) {
    error(err, res);
  } finally {
    if (conn) conn.end();
  }
};

exports.shabads = async (req, res) => {
  let { ShabadID } = req.params;
  const sinceDate = req.query.updatedsince ? lib.isValidDatetime(req.query.updatedsince) : null;

  if (lib.isListOfNumbers(ShabadID)) {
    ShabadID = ShabadID.split(/[,+]/g);
    try {
      const rows = await getShabad(ShabadID, sinceDate);
      if (Object.entries(rows).length === 0) {
        lib.customError(
          'Shabad does not exist or no updates found for specified Shabad.',
          res,
          404,
        );
      } else {
        res.json(rows);
      }
    } catch (err) {
      error(err, res);
    }
  } else {
    error('malformed url', res);
  }
};

exports.angs = async (req, res) => {
  let PageNo = parseInt(req.params.PageNo, 10);
  const sinceDate = req.query.updatedsince ? lib.isValidDatetime(req.query.updatedsince) : null;

  if (PageNo < 1) {
    PageNo = 1;
  }
  let { SourceID } = req.params;
  // Check if SourceID is supported or default to 'G'
  if (!sources[SourceID]) {
    SourceID = 'G';
  }
  // If SGGS, check if within 1430
  if (SourceID === 'G' && PageNo > 1430) {
    PageNo = 1430;
  }

  const parameters = [PageNo, SourceID];

  let sinceQuery = '';
  if (sinceDate) {
    sinceQuery = 'AND GREATEST(s.Updated, v.Updated) > ?';
    parameters.push(sinceDate);
  }

  let conn;

  try {
    conn = await pool.getConnection();
    const q = `SELECT ${allColumns} ${allFrom}
      WHERE
        v.PageNo = ?
        AND v.SourceID = ?
        ${sinceQuery}
        ${allColumnsWhere}
      ORDER BY v.LineNo ASC, ShabadID ASC, v.ID ASC`;
    const rows = await conn.query(q, parameters);
    if (rows.length > 0) {
      const source = lib.getSource(rows[0]);
      const count = rows.length;
      const page = rows.map(row => {
        const rowData = lib.prepVerse(row);
        rowData.writer = lib.getWriter(row);
        rowData.raag = lib.getRaag(row);
        return rowData;
      });
      const q1 = `(SELECT 'previous' as navigation, PageNo FROM Verse WHERE PageNo = ? AND SourceID = ? LIMIT 1)
          UNION
        (SELECT 'next' as navigation, PageNo FROM Verse WHERE PageNo= ? AND SourceID = ? LIMIT 1);`;
      const rows1 = await conn.query(q1, [PageNo - 1, SourceID, PageNo + 1, SourceID]);
      let previous = null;
      let next = null;
      rows1.forEach(row => {
        if (row.navigation === 'previous') {
          previous = row.PageNo;
        }
        if (row.navigation === 'next') {
          next = row.PageNo;
        }
      });
      const navigation = {
        previous,
        next,
      };
      res.json({
        source,
        count,
        navigation,
        page,
      });
    } else {
      lib.customError('That ang does not exist or no updates found.', res, 404);
    }
  } catch (err) {
    error(err, res);
  } finally {
    if (conn) conn.end();
  }
};

exports.hukamnamas = async (req, res) => {
  let q;
  const output = {};
  const args = [];
  let exit = false;
  if (req.params.year && req.params.month && req.params.day) {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);
    const day = parseInt(req.params.day, 10);
    const validDate = new Date(year, month - 1, day).getTime();
    const archiveDate = new Date(2002, 0, 1).getTime();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (validDate >= archiveDate && validDate <= tomorrow.getTime()) {
      q = 'SELECT ID as hukamDate, ShabadID FROM Hukamnama WHERE ID = ?';
      args.push(`${year}-${month}-${day}`);
    } else {
      lib.customError('Please specify a valid date. Archives go back to 2002-01-01', res, 404);
      exit = true;
    }
  }
  if (!q) {
    q = 'SELECT ID as hukamDate, ShabadID FROM Hukamnama ORDER BY ID DESC LIMIT 1';
    output.isLatest = true;
  }
  if (!exit) {
    let conn;

    try {
      conn = await pool.getConnection();
      const row = await conn.query(q, args);
      if (row.length > 0) {
        const { hukamDate } = row[0];
        const ShabadIDs = JSON.parse(row[0].ShabadID);
        const shabads = await getShabad(ShabadIDs);
        const hukamGregorianDate = new Date(hukamDate);
        const date = {
          gregorian: {
            month: hukamGregorianDate.getMonth() + 1,
            date: hukamGregorianDate.getDate(),
            year: hukamGregorianDate.getFullYear(),
          },
        };

        output.date = date;
        output.shabadIds = ShabadIDs;
        output.shabads = shabads.shabads ? shabads.shabads : shabads;

        res.json(output);
      } else {
        lib.customError('Hukamnama is missing for that date', res, 404);
      }
    } catch (err) {
      error(err, res);
    } finally {
      if (conn) conn.end();
    }
  }
};

exports.random = async (req, res) => {
  let { SourceID } = req.params;
  // Check if SourceID is supported or default to 'G'
  if (!sources[SourceID]) {
    SourceID = 'G';
  }
  let conn;
  try {
    conn = await pool.getConnection();
    const q =
      'SELECT DISTINCT s.ShabadID, v.PageNo FROM Shabad s JOIN Verse v ON s.VerseID = v.ID WHERE v.SourceID = ? ORDER BY RAND() LIMIT 1';
    const row = await conn.query(q, [SourceID]);
    const { ShabadID } = row[0];
    const rows = await getShabad([ShabadID]);
    res.json(rows);
  } catch (err) {
    error(err, res);
  } finally {
    if (conn) conn.end();
  }
};

const getShabad = (ShabadIDQ, sinceDate = null) =>
  new Promise((resolve, reject) => {
    pool
      .getConnection()
      .then(conn => {
        const parameters = [...ShabadIDQ];
        const ShabadIDQLength = ShabadIDQ.length;
        const tokens = new Array(ShabadIDQLength).fill('?').join(',');

        let sinceQuery = '';
        if (sinceDate) {
          sinceQuery = 'AND GREATEST(s.Updated, v.Updated) > ?';
          parameters.push(sinceDate);
        }

        let multipleShabadOrder = '';
        if (ShabadIDQLength > 1) {
          multipleShabadOrder = `FIELD(ShabadID, ${tokens}),`;
          parameters.push(...ShabadIDQ);
        }

        const q = `SELECT ${allColumns} ${allFrom}
                    WHERE s.ShabadID IN (${tokens}) ${allColumnsWhere} ${sinceQuery}
                    ORDER BY ${multipleShabadOrder} v.ID ASC`;

        conn
          .query(q, parameters)
          .then(async rows => {
            if (rows.length > 0 && ShabadIDQLength === 1) {
              // single shabad
              const retShabad = await getShabadSingle(rows);
              resolve(retShabad);
            } else if (rows.length > 0) {
              // multiple shabads
              const output = {
                shabadIds: [],
                shabads: [],
              };
              let curShabadID = -1;
              let counter = 0;
              rows.forEach(row => {
                if (row.ShabadID !== curShabadID) {
                  curShabadID = row.ShabadID;
                  output.shabadIds.push(row.ShabadID);
                  counter = output.shabads.push([]) - 1;
                }
                output.shabads[counter].push(row);
              });

              const outputShabadPromises = output.shabads.map(getShabadSingle);
              output.shabads = await Promise.all(outputShabadPromises);
              resolve(output);
            } else {
              resolve({});
            }
            if (conn) conn.end();
          })
          .catch(err => reject(err));
      })
      .catch(err => reject(err));
  });

const getShabadSingle = async rows => {
  const shabadInfo = lib.getShabadInfo(rows[0]);
  const verses = rows.map(lib.prepVerse);
  const navigation = await getShabadNavigation(rows[0].ID, rows[rows.length - 1].ID);

  return {
    shabadInfo,
    count: verses.length,
    navigation,
    verses,
  };
};

const getShabadNavigation = async (firstLine, lastLine) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const q1 = `(SELECT 'previous' as navigation,ShabadID FROM Shabad WHERE VerseID < ? ORDER BY VerseID DESC LIMIT 1)
                UNION
                (SELECT 'next' as navigation,ShabadID FROM Shabad WHERE VerseID > ? ORDER BY VerseID LIMIT 1);`;
    const rows1 = await conn.query(q1, [firstLine, lastLine]);
    let previous = null;
    let next = null;
    rows1.forEach(row => {
      if (row.navigation === 'previous') {
        previous = row.ShabadID;
      }
      if (row.navigation === 'next') {
        next = row.ShabadID;
      }
    });
    return {
      previous,
      next,
    };
  } catch (err) {
    error(err);
  } finally {
    if (conn) conn.end();
  }
  return {};
};
